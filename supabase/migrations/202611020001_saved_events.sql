begin;
-- Match the existing events primary key (UUID, bigint or text).
do $$ declare id_type text; begin
  select format_type(atttypid,atttypmod) into id_type from pg_attribute
    where attrelid='public.events'::regclass and attname='id' and not attisdropped;
  execute format('create table public.saved_events (
    user_id uuid not null references auth.users(id) on delete cascade,
    event_id %s not null references public.events(id) on delete cascade,
    created_at timestamptz not null default now(), primary key(user_id,event_id))',id_type);
end $$;
create index saved_events_recent on public.saved_events(user_id,created_at desc,event_id);
alter table public.saved_events enable row level security;
revoke all on public.saved_events from public,anon,authenticated;
grant select,delete on public.saved_events to authenticated;
grant insert(user_id,event_id) on public.saved_events to authenticated;
create policy saved_events_read on public.saved_events for select to authenticated
  using(user_id=(select auth.uid()) and public.pulse_account_active());
create policy saved_events_insert on public.saved_events for insert to authenticated
  with check(user_id=(select auth.uid()) and public.pulse_account_active()
    and exists(select 1 from public.events e where e.id=event_id));
create policy saved_events_delete on public.saved_events for delete to authenticated
  using(user_id=(select auth.uid()) and public.pulse_account_active());
notify pgrst,'reload schema';
commit;
