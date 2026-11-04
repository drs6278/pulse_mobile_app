-- Live verification: every fixture and write is rolled back.
begin;
do $$ declare ids uuid[]; begin
  if not (select relrowsecurity from pg_class where oid='public.saved_events'::regclass) then raise exception 'Saved events RLS disabled'; end if;
  if has_table_privilege('anon','public.saved_events','SELECT') then raise exception 'Anonymous bookmarks access'; end if;
  if has_table_privilege('authenticated','public.saved_events','UPDATE') then raise exception 'Bookmarks are mutable'; end if;
  select array_agg(user_id) into ids from (select user_id from public.private_profiles where account_state='active' order by user_id limit 2) p;
  if cardinality(ids)<2 then raise exception 'Two active accounts required'; end if;
  perform set_config('pulse.saved_owner',ids[1]::text,true);
  perform set_config('pulse.saved_other',ids[2]::text,true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('pulse.saved_owner'),true);
set local role authenticated;
do $$ declare target text; begin
  insert into public.events(title,location,category,event_date,pulse_starts_at,pulse_ends_at,pulse_timezone)
  values('Saved event verification','Verification hall','Other',(now()+interval '1 day')::date,now()+interval '1 day',now()+interval '1 day 1 hour','UTC') returning id::text into target;
  perform set_config('pulse.saved_event',target,true);
  insert into public.saved_events(user_id,event_id) select auth.uid(),id from public.events where id::text=target;
  insert into public.saved_events(user_id,event_id) select auth.uid(),id from public.events where id::text=target on conflict(user_id,event_id) do nothing;
  if (select count(*) from public.saved_events where event_id::text=target)<>1 then raise exception 'Save/read failed'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('pulse.saved_other'),true);
do $$ begin
  if exists(select 1 from public.saved_events where event_id::text=current_setting('pulse.saved_event')) then raise exception 'Bookmarks leaked'; end if;
  delete from public.saved_events where event_id::text=current_setting('pulse.saved_event');
  if found then raise exception 'Another account removed bookmark'; end if;
  begin
    insert into public.saved_events(user_id,event_id) values(current_setting('pulse.saved_owner')::uuid,current_setting('pulse.saved_event')::uuid);
    raise exception 'Another account saved bookmark';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('pulse.saved_owner'),true);
do $$ begin
  delete from public.saved_events where event_id::text=current_setting('pulse.saved_event');
  if not found then raise exception 'Unsave failed'; end if;
end $$;
rollback;
