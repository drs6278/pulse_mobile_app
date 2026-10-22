-- Lets signed-in students publish events they own. Apply after 202610190001_scheduling.sql.
begin;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='pulse_starts_at') then
    raise exception 'Apply the scheduling migration before event creation.';
  end if;
end $$;

alter table public.events add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Client inserts never choose an ID. Only add a generator when the existing key has none.
do $$ declare id_type text; has_generator boolean; begin
  select format_type(a.atttypid,a.atttypmod), a.atthasdef or a.attidentity <> '' into id_type, has_generator
  from pg_attribute a where a.attrelid='public.events'::regclass and a.attname='id' and not a.attisdropped;
  if has_generator then return; end if;
  if id_type = 'uuid' then
    alter table public.events alter column id set default gen_random_uuid();
  elsif id_type in ('text','character varying') then
    alter table public.events alter column id set default gen_random_uuid()::text;
  elsif id_type in ('bigint','integer') then
    create sequence if not exists public.events_id_seq owned by public.events.id;
    perform setval('public.events_id_seq', coalesce((select max(id) from public.events),0)+1, false);
    alter table public.events alter column id set default nextval('public.events_id_seq');
    grant usage on sequence public.events_id_seq to authenticated;
  else
    raise exception 'Review unsupported event ID type: %',id_type;
  end if;
end $$;

-- Column grant: publishers cannot pick IDs, owners, revisions, or cancellation state.
grant insert (title,location,category,event_date,pulse_starts_at,pulse_ends_at,pulse_timezone,pulse_all_day_start,pulse_all_day_end) on public.events to authenticated;
create policy event_insert_own on public.events for insert to authenticated with check ((select auth.uid())=created_by and not pulse_cancelled);
commit;