begin;

create table public.event_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  poster_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  event_title text not null,
  changes jsonb not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index event_notifications_inbox on public.event_notifications(user_id,created_at desc,id);
create index event_notifications_unread on public.event_notifications(user_id) where read_at is null;
alter table public.event_notifications enable row level security;
revoke all on public.event_notifications from public,anon,authenticated;
grant select on public.event_notifications to authenticated;
grant update(read_at) on public.event_notifications to authenticated;
create policy notification_read on public.event_notifications for select to authenticated
  using(user_id=(select auth.uid()) and public.pulse_account_active() and public.pulse_profile_visible(poster_id));
create policy notification_mark_read on public.event_notifications for update to authenticated
  using(user_id=(select auth.uid()) and public.pulse_account_active() and public.pulse_profile_visible(poster_id))
  with check(user_id=(select auth.uid()) and public.pulse_account_active() and public.pulse_profile_visible(poster_id));

-- The RPC is the only new write entry point. Never grant clients event UPDATE.
create function public.edit_pulse_event(p_id text,p_revision integer,p_draft jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  previous public.events%rowtype;
  saved public.events%rowtype;
  starts timestamptz; ends timestamptz; zone text;
  changes jsonb := '{}'::jsonb;
  before_values jsonb; after_values jsonb; field text;
begin
  if auth.uid() is null or not public.pulse_account_active() then raise exception 'Sign in with an active account.'; end if;
  select * into previous from public.events where id::text=p_id for update;
  if not found or previous.created_by is distinct from auth.uid() then raise exception 'Only the original poster can edit this event.'; end if;
  if previous.pulse_cancelled or coalesce(previous.pulse_starts_at,previous.pulse_all_day_start::timestamp at time zone previous.pulse_timezone,'-infinity'::timestamptz)<=clock_timestamp() then
    raise exception 'Events can only be edited before they start.';
  end if;
  if previous.pulse_revision is distinct from p_revision then raise exception 'This event changed. Reopen the editor to load the latest details.'; end if;
  zone := p_draft->>'pulse_timezone';
  if zone is null or not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Choose a valid timezone.'; end if;
  starts := (p_draft->>'pulse_starts_at')::timestamptz;
  ends := (p_draft->>'pulse_ends_at')::timestamptz;
  if starts is null or ends is null or starts<=clock_timestamp() or ends<=starts or ends-starts>interval '7 days' then raise exception 'Choose a future start and an end within seven days.'; end if;
  if coalesce(length(btrim(p_draft->>'title')),0) not between 1 and 200 or coalesce(length(btrim(p_draft->>'location')),0) not between 1 and 300 then raise exception 'Enter a valid title and location.'; end if;
  if coalesce(p_draft->>'category','') not in ('Food','Music','Sports','Arts','Outdoors','Other') or coalesce(p_draft->>'pulse_age_min','') not in ('0','18','21') then raise exception 'Choose a valid category and age restriction.'; end if;
  before_values := jsonb_build_object('title',previous.title,'location',previous.location,'category',previous.category,'pulse_starts_at',previous.pulse_starts_at,'pulse_ends_at',previous.pulse_ends_at,'pulse_timezone',previous.pulse_timezone,'pulse_age_min',previous.pulse_age_min,'pulse_all_day_start',previous.pulse_all_day_start,'pulse_all_day_end',previous.pulse_all_day_end);
  after_values := jsonb_build_object('title',btrim(p_draft->>'title'),'location',btrim(p_draft->>'location'),'category',p_draft->>'category','pulse_starts_at',starts,'pulse_ends_at',ends,'pulse_timezone',zone,'pulse_age_min',(p_draft->>'pulse_age_min')::integer,'pulse_all_day_start',null,'pulse_all_day_end',null);
  for field in select jsonb_object_keys(after_values) loop
    if before_values->field is distinct from after_values->field then
      changes := changes || jsonb_build_object(field,jsonb_build_object('before',before_values->field,'after',after_values->field));
    end if;
  end loop;
  if changes='{}'::jsonb then return; end if;
  update public.events set title=btrim(p_draft->>'title'),location=btrim(p_draft->>'location'),category=p_draft->>'category',
    pulse_starts_at=starts,pulse_ends_at=ends,pulse_timezone=zone,event_date=(starts at time zone zone)::date,
    pulse_age_min=(p_draft->>'pulse_age_min')::integer,pulse_all_day_start=null,pulse_all_day_end=null,
    pulse_revision=previous.pulse_revision+1 where id=previous.id returning * into saved;
  insert into public.event_notifications(user_id,poster_id,event_id,event_title,changes)
    select r.user_id,auth.uid(),saved.id::text,saved.title,changes from public.event_rsvps r
    where r.event_id=saved.id and r.status='going' and r.user_id<>auth.uid();
end $$;
revoke all on function public.edit_pulse_event(text,integer,jsonb) from public,anon;
grant execute on function public.edit_pulse_event(text,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
