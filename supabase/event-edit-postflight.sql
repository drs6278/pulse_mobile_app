-- Live verification only: all fixture changes are rolled back.
begin;
do $$
declare ids uuid[];
begin
  if to_regprocedure('public.edit_pulse_event(text,integer,jsonb)') is null then raise exception 'Missing event editor RPC'; end if;
  if not (select relrowsecurity from pg_class where oid='public.event_notifications'::regclass) then raise exception 'Notification RLS is disabled'; end if;
  if has_function_privilege('anon','public.edit_pulse_event(text,integer,jsonb)','EXECUTE') then raise exception 'Anonymous edit access'; end if;
  if has_table_privilege('authenticated','public.event_notifications','INSERT') then raise exception 'Clients can forge notifications'; end if;
  select array_agg(user_id order by user_id) into ids from (select user_id from public.private_profiles where account_state='active' order by user_id limit 2) p;
  if cardinality(ids)<2 then raise exception 'Verification requires two active accounts'; end if;
  perform set_config('pulse.verify_owner',ids[1]::text,true);
  perform set_config('pulse.verify_attendee',ids[2]::text,true);
  update public.private_profiles set profile_setup_completed_at=now(),profile_hidden=false,age_band='21_plus' where user_id=any(ids);
  delete from public.user_blocks where blocker_id=any(ids) and blocked_id=any(ids);
end $$;
select set_config('request.jwt.claim.sub',current_setting('pulse.verify_owner'),true);
set local role authenticated;
do $$ declare event_id text; begin
  insert into public.events(title,location,category,event_date,pulse_starts_at,pulse_ends_at,pulse_timezone)
    values('Pulse rollback verification','Verification hall','Other',(now()+interval '1 day')::date,now()+interval '1 day',now()+interval '1 day 1 hour','UTC') returning id::text into event_id;
  perform set_config('pulse.verify_event',event_id,true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('pulse.verify_attendee'),true);
insert into public.event_rsvps(user_id,event_id,status) select auth.uid(),id,'going' from public.events where id::text=current_setting('pulse.verify_event');
do $$ begin
  begin
    perform public.edit_pulse_event(current_setting('pulse.verify_event'),1,'{}'::jsonb);
    raise exception 'FAILED: another account edited the event';
  exception when others then
    if sqlerrm not like '%Only the original poster%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('pulse.verify_owner'),true);
select public.edit_pulse_event(current_setting('pulse.verify_event'),1,jsonb_build_object(
  'title','Pulse verified edit','location','Updated verification hall','category','Arts',
  'pulse_starts_at',now()+interval '2 days','pulse_ends_at',now()+interval '2 days 1 hour',
  'pulse_timezone','UTC','pulse_age_min',18));
do $$ begin
  if exists(select 1 from public.event_notifications where event_id=current_setting('pulse.verify_event')) then raise exception 'Poster received a notification'; end if;
  if not exists(select 1 from public.events where id::text=current_setting('pulse.verify_event') and pulse_revision=2 and title='Pulse verified edit') then raise exception 'Event edit failed'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('pulse.verify_attendee'),true);
do $$ begin
  if (select count(*) from public.event_notifications where event_id=current_setting('pulse.verify_event') and read_at is null)<>1 then raise exception 'Expected one unread attendee notification'; end if;
  if not exists(select 1 from public.event_notifications where event_id=current_setting('pulse.verify_event') and changes->'title'->>'before'='Pulse rollback verification' and changes->'title'->>'after'='Pulse verified edit') then raise exception 'Incorrect change summary'; end if;
  if not exists(select 1 from public.event_rsvps where event_id::text=current_setting('pulse.verify_event') and user_id=auth.uid() and status='going') then raise exception 'RSVP was not preserved'; end if;
  update public.event_notifications set read_at=now() where event_id=current_setting('pulse.verify_event');
  if exists(select 1 from public.event_notifications where event_id=current_setting('pulse.verify_event') and read_at is null) then raise exception 'Mark read failed'; end if;
end $$;
reset role;
rollback;
select 'PASS: editor ownership, revision, RSVP preservation, attendee notification, inbox privacy and mark read; all verification changes rolled back' as verification,
  (select count(*) from public.events) as events,(select count(*) from public.event_rsvps) as rsvps,(select count(*) from auth.users) as users;
