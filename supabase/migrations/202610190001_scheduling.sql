-- Apply to a disposable database first. Does not create or replace the existing events table.
begin;
do $$ begin
  if to_regclass('public.events') is null then raise exception 'Verify the existing public.events schema before applying scheduling.'; end if;
  if exists (select 1 from pg_class where oid = 'public.events'::regclass and not relrowsecurity) then
    raise exception 'Enable and verify existing events RLS before exposing RSVP relationships.';
  end if;
end $$;

create table public.schedule_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null, day_start text not null default '08:00', day_end text not null default '22:00',
  minimum_gap integer not null default 30 check (minimum_gap between 1 and 1440),
  categories text[] not null default '{}', version integer not null default 1,
  check (day_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and day_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and day_end > day_start)
);
create table public.schedule_imports (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(label) between 1 and 200), request_key text not null,
  created_at timestamptz not null default now(), unique (id, user_id), unique (user_id, request_key)
);
create table public.schedule_series (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid, title text not null check (length(trim(title)) between 1 and 200),
  kind text not null check (kind in ('class','commitment')), location text not null default '' check (length(location) <= 500),
  start_local text not null, end_local text not null, timezone text not null, term_end date not null,
  all_day boolean not null default false, busy boolean not null default true,
  recurrence jsonb, rdates text[] not null default '{}', exdates text[] not null default '{}',
  source_uid text, content_key text not null check (length(content_key) <= 100000), version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, user_id), unique (user_id, source_uid),
  foreign key (import_id, user_id) references public.schedule_imports(id, user_id) on delete cascade
);
create index schedule_series_owner on public.schedule_series(user_id);
create unique index schedule_import_content on public.schedule_series(user_id, content_key) where import_id is not null;
create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null, recurrence_key text not null, cancelled boolean not null,
  start_local text, end_local text,
  foreign key (series_id, user_id) references public.schedule_series(id, user_id) on delete cascade,
  unique (series_id, recurrence_key),
  check ((cancelled and start_local is null and end_local is null) or (not cancelled and start_local is not null and end_local is not null and end_local > start_local))
);
create index schedule_exceptions_owner on public.schedule_exceptions(user_id);
create index schedule_imports_owner on public.schedule_imports(user_id);

create function public.validate_schedule_row() returns trigger language plpgsql set search_path = '' as $$
declare s timestamp; e timestamp; rule jsonb; d integer;
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then raise exception 'Invalid timezone'; end if;
  if tg_table_name = 'schedule_preferences' then
    if cardinality(new.categories) > 6 then raise exception 'Too many category interests'; end if;
    if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
    return new;
  end if;
  if new.start_local !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' or new.end_local !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' then raise exception 'Invalid local time'; end if;
  s := new.start_local::timestamp; e := new.end_local::timestamp;
  if e <= s or e > s + interval '7 days' or new.term_end < s::date or new.term_end > s::date + 366 then raise exception 'Invalid schedule bounds'; end if;
  if ((s at time zone new.timezone) at time zone new.timezone) <> s or ((e at time zone new.timezone) at time zone new.timezone) <> e then raise exception 'Nonexistent local time'; end if;
  if new.all_day and (s::time <> time '00:00' or e::time <> time '00:00') then raise exception 'All-day boundaries must be midnight'; end if;
  if cardinality(new.rdates) + cardinality(new.exdates) > 2000 then raise exception 'Too many occurrence dates'; end if;
  if exists (select 1 from unnest(new.rdates || new.exdates) x where x::date < s::date or x::date > new.term_end) then raise exception 'Occurrence outside semester'; end if;
  rule := new.recurrence;
  if rule is not null and rule <> 'null'::jsonb then
    if jsonb_typeof(rule) is distinct from 'object' or jsonb_typeof(rule->'days') is distinct from 'array' then raise exception 'Invalid weekly recurrence'; end if;
    if jsonb_array_length(rule->'days') not between 1 and 7
       or coalesce((rule->>'interval')::integer,0) not between 1 and 52
       or coalesce((rule->>'weekStart')::integer,0) not between 1 and 7 then raise exception 'Invalid weekly recurrence'; end if;
    for d in select jsonb_array_elements_text(rule->'days')::integer loop
      if d not between 1 and 7 then raise exception 'Invalid weekday'; end if;
    end loop;
    if not (rule->'days' @> to_jsonb(extract(isodow from s)::integer)) then raise exception 'Start date must match a selected weekday'; end if;
    if rule->>'count' is not null and (rule->>'count')::integer not between 1 and 2000 then raise exception 'Invalid recurrence count'; end if;
    if rule->>'until' is not null then perform (rule->>'until')::timestamptz; end if;
  end if;
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger schedule_validate before insert or update on public.schedule_series for each row execute function public.validate_schedule_row();
create trigger preferences_validate before insert or update on public.schedule_preferences for each row execute function public.validate_schedule_row();

do $$ declare t text; begin
  foreach t in array array['schedule_preferences','schedule_imports','schedule_series','schedule_exceptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select,insert,update,delete on public.%I to authenticated', t);
    execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- All writes use the caller's RLS permissions. No service-role or definer bypass.
create function public.save_schedule(p_id uuid, p_version integer, p_draft jsonb, p_clear_exceptions boolean default false)
returns public.schedule_series language plpgsql security invoker set search_path = '' as $$
declare v public.schedule_series; saved public.schedule_series;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  v := jsonb_populate_record(null::public.schedule_series, p_draft);
  if p_id is null then
    insert into public.schedule_series(user_id,title,kind,location,start_local,end_local,timezone,term_end,all_day,busy,recurrence,rdates,exdates,source_uid,content_key)
    values(auth.uid(),v.title,v.kind,v.location,v.start_local,v.end_local,v.timezone,v.term_end,v.all_day,v.busy,v.recurrence,coalesce(v.rdates,'{}'),coalesce(v.exdates,'{}'),v.source_uid,v.content_key) returning * into saved;
  else
    perform 1 from public.schedule_series where id=p_id and user_id=auth.uid() and version=p_version for update;
    if not found then raise exception 'Schedule changed on another device. Refresh before saving.'; end if;
    if exists(select 1 from public.schedule_exceptions where series_id=p_id) and not p_clear_exceptions then raise exception 'Review occurrence exceptions before editing the series.'; end if;
    update public.schedule_series set title=v.title,kind=v.kind,location=v.location,start_local=v.start_local,end_local=v.end_local,timezone=v.timezone,term_end=v.term_end,
      all_day=v.all_day,busy=v.busy,recurrence=v.recurrence,rdates=coalesce(v.rdates,'{}'),exdates=coalesce(v.exdates,'{}'),content_key=v.content_key
      where id=p_id and user_id=auth.uid() returning * into saved;
    if p_clear_exceptions then delete from public.schedule_exceptions where series_id=p_id; end if;
  end if;
  return saved;
end $$;

create function public.set_schedule_exception(p_series uuid, p_version integer, p_key text, p_cancelled boolean, p_start text default null, p_end text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.schedule_series;
begin
  select * into s from public.schedule_series where id=p_series and user_id=auth.uid() and version=p_version for update;
  if not found then raise exception 'Schedule changed. Refresh before editing.'; end if;
  perform p_key::timestamp;
  if p_key::date < s.start_local::date or p_key::date > s.term_end then raise exception 'Occurrence outside semester'; end if;
  if not p_cancelled then
    if p_start is null or p_end is null or p_end::timestamp <= p_start::timestamp or p_end::timestamp > p_start::timestamp + interval '7 days' then raise exception 'Invalid replacement'; end if;
    if ((p_start::timestamp at time zone s.timezone) at time zone s.timezone) <> p_start::timestamp or ((p_end::timestamp at time zone s.timezone) at time zone s.timezone) <> p_end::timestamp then raise exception 'Nonexistent replacement time'; end if;
  end if;
  insert into public.schedule_exceptions(user_id,series_id,recurrence_key,cancelled,start_local,end_local)
    values(auth.uid(),p_series,p_key,p_cancelled,p_start,p_end)
    on conflict(series_id,recurrence_key) do update set cancelled=excluded.cancelled,start_local=excluded.start_local,end_local=excluded.end_local;
  update public.schedule_series set updated_at=now() where id=p_series;
end $$;

create function public.delete_schedule(p_id uuid, p_version integer) returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.schedule_series where id=p_id and user_id=auth.uid() and version=p_version;
  if not found then raise exception 'Schedule changed. Refresh before deleting.'; end if;
end $$;

create function public.commit_schedule_import(p_key text, p_label text, p_entries jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare batch uuid; item jsonb; saved public.schedule_series; exception jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) not between 1 and 2000 then raise exception 'Select 1–2000 entries'; end if;
  -- Serialize retries for the same user/request, including requests arriving before commit.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_key,0));
  select id into batch from public.schedule_imports where user_id=auth.uid() and request_key=p_key;
  if batch is not null then return batch; end if;
  insert into public.schedule_imports(user_id,label,request_key) values(auth.uid(),p_label,p_key) returning id into batch;
  for item in select jsonb_array_elements(p_entries) loop
    select * into saved from public.save_schedule((item->>'id')::uuid,coalesce((item->>'version')::integer,0),item->'draft',coalesce((item->>'clear_exceptions')::boolean,false));
    if item->>'id' is null then update public.schedule_series set import_id=batch where id=saved.id; end if;
    for exception in select jsonb_array_elements(coalesce(item->'exceptions','[]')) loop
      perform public.set_schedule_exception(saved.id,(select version from public.schedule_series where id=saved.id),exception->>'recurrence_key',(exception->>'cancelled')::boolean,exception->>'start_local',exception->>'end_local');
    end loop;
  end loop;
  return batch;
end $$;

create function public.delete_imported_schedules(p_import uuid default null) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from public.schedule_imports where user_id=auth.uid() and (p_import is null or id=p_import);
end $$;

-- New columns deliberately use a Pulse prefix to avoid overwriting unknown legacy lifecycle fields.
alter table public.events add column if not exists pulse_starts_at timestamptz;
alter table public.events add column if not exists pulse_ends_at timestamptz;
alter table public.events add column if not exists pulse_timezone text;
alter table public.events add column if not exists pulse_cancelled boolean not null default false;
alter table public.events add column if not exists pulse_revision integer not null default 1;
alter table public.events add column if not exists pulse_all_day_start date;
alter table public.events add column if not exists pulse_all_day_end date;
alter table public.events add constraint pulse_event_times check ((pulse_starts_at is null and pulse_ends_at is null) or (pulse_starts_at is not null and pulse_ends_at is not null and pulse_ends_at > pulse_starts_at));
alter table public.events add constraint pulse_event_all_day check ((pulse_all_day_start is null and pulse_all_day_end is null) or (pulse_all_day_start is not null and pulse_all_day_end is not null and pulse_all_day_end > pulse_all_day_start and pulse_starts_at is null and pulse_ends_at is null));
create function public.validate_pulse_event() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.pulse_starts_at is not null or new.pulse_all_day_start is not null) and (new.pulse_timezone is null or not exists(select 1 from pg_timezone_names where name=new.pulse_timezone)) then raise exception 'A verified event timezone is required'; end if;
  if tg_op='UPDATE' and row(new.title,new.location,new.event_date,new.pulse_starts_at,new.pulse_ends_at,new.pulse_all_day_start,new.pulse_all_day_end,new.pulse_timezone,new.pulse_cancelled) is distinct from row(old.title,old.location,old.event_date,old.pulse_starts_at,old.pulse_ends_at,old.pulse_all_day_start,old.pulse_all_day_end,old.pulse_timezone,old.pulse_cancelled) then new.pulse_revision := old.pulse_revision+1; end if;
  return new;
end $$;
create trigger pulse_event_validate before insert or update on public.events for each row execute function public.validate_pulse_event();
-- Derive the RSVP foreign-key type from the actual existing event primary key.
do $$ declare event_type text; begin
  select format_type(a.atttypid,a.atttypmod) into event_type from pg_attribute a where a.attrelid='public.events'::regclass and a.attname='id' and not a.attisdropped;
  if event_type not in ('uuid','text','bigint','integer','character varying') then raise exception 'Review unsupported event ID type: %',event_type; end if;
  execute format('create table public.event_rsvps (user_id uuid not null references auth.users(id) on delete cascade,event_id %s not null references public.events(id) on delete cascade,status text not null check (status in (''going'',''cancelled'')),primary key(user_id,event_id))',event_type);
end $$;
alter table public.event_rsvps enable row level security;
revoke all on public.event_rsvps from anon;
grant select,insert,update,delete on public.event_rsvps to authenticated;
create policy rsvp_read on public.event_rsvps for select to authenticated using ((select auth.uid())=user_id);
create policy rsvp_insert on public.event_rsvps for insert to authenticated with check ((select auth.uid())=user_id and exists(select 1 from public.events e where e.id=event_rsvps.event_id and not e.pulse_cancelled));
create policy rsvp_update on public.event_rsvps for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and (status='cancelled' or exists(select 1 from public.events e where e.id=event_rsvps.event_id and not e.pulse_cancelled)));
create policy rsvp_delete on public.event_rsvps for delete to authenticated using ((select auth.uid())=user_id);
create index pulse_event_start on public.events(pulse_starts_at);

-- Revoke PostgreSQL's default PUBLIC execute grant on every new RPC/helper.
revoke all on function public.validate_schedule_row() from public,anon;
revoke all on function public.validate_pulse_event() from public,anon;
revoke all on function public.save_schedule(uuid,integer,jsonb,boolean) from public,anon;
revoke all on function public.set_schedule_exception(uuid,integer,text,boolean,text,text) from public,anon;
revoke all on function public.delete_schedule(uuid,integer) from public,anon;
revoke all on function public.commit_schedule_import(text,text,jsonb) from public,anon;
revoke all on function public.delete_imported_schedules(uuid) from public,anon;
grant execute on function public.save_schedule(uuid,integer,jsonb,boolean), public.set_schedule_exception(uuid,integer,text,boolean,text,text), public.delete_schedule(uuid,integer), public.commit_schedule_import(text,text,jsonb), public.delete_imported_schedules(uuid) to authenticated;
commit;
