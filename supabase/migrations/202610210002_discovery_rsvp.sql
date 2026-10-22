-- Phase 3; requires scheduling and clubs/events migrations.
begin;
alter table public.events add column pulse_capacity integer check(pulse_capacity > 0),
 add column pulse_search tsvector generated always as
 (to_tsvector('simple',coalesce(title,'') || ' ' || coalesce(location,'') || ' ' || coalesce(category,'') || ' ' || pulse_description)) stored;
create index pulse_events_search on public.events using gin(pulse_search);
create index pulse_events_discovery on public.events(event_date,id) where pulse_status='published' and not pulse_cancelled;
alter table public.event_rsvps drop constraint event_rsvps_status_check;
alter table public.event_rsvps add constraint event_rsvps_status_check check(status in ('going','waitlisted','cancelled')),
 add column queue_order bigint generated always as identity;
create index pulse_rsvp_queue on public.event_rsvps(event_id,status,queue_order);
-- All attendance writes must pass through RPCs taking the event lock.
revoke insert,update,delete on public.event_rsvps from authenticated,anon;

-- Internal helper: explicit identity is needed to recheck queued users, never exposed to clients.
create function public.rsvp_eligible(e public.events,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select u is not null and exists(select 1 from auth.users where id=u)
 and e.pulse_status='published' and not e.pulse_cancelled
 and coalesce(e.pulse_ends_at > now(),e.event_date >= current_date)
 and (e.pulse_visibility='public' or (e.pulse_club_id is null and e.pulse_owner_id=u)
 or (e.pulse_club_id is not null and exists(select 1 from public.club_memberships where club_id=e.pulse_club_id and user_id=u and (e.pulse_visibility='club_only' or role in ('admin','officer'))))
 or (e.pulse_visibility='private' and exists(select 1 from public.event_invitations where event_id=e.id::text and user_id=u)))
$$;
create function public.promote_event_waitlist(p_event text) returns void language plpgsql security definer set search_path='' as $$
declare e public.events; r record; seats bigint; begin
 select * into e from public.events where id::text=p_event for update;
 if not found then return; end if;
 if e.pulse_cancelled or e.pulse_status='cancelled' then
 update public.event_rsvps set status='cancelled' where event_id=e.id and status<>'cancelled'; return;
 end if;
 select coalesce(e.pulse_capacity,2147483647)-count(*) into seats from public.event_rsvps where event_id=e.id and status='going';
 for r in select * from public.event_rsvps where event_id=e.id and status='waitlisted' order by queue_order loop
 if not public.rsvp_eligible(e,r.user_id) then
 update public.event_rsvps set status='cancelled' where event_id=e.id and user_id=r.user_id;
 elsif seats>0 then
 update public.event_rsvps set status='going' where event_id=e.id and user_id=r.user_id;
 seats:=seats-1;
 end if;
 end loop;
end $$;
create function public.set_event_rsvp(p_event text,p_status text) returns text language plpgsql security definer set search_path='' as $$
declare e public.events; previous text; next_status text; n bigint; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_status is null or p_status not in ('going','cancelled') then raise exception 'Invalid RSVP request'; end if;
 select * into e from public.events where id::text=p_event for update;
 if not found then raise exception 'Event unavailable'; end if;
 select status into previous from public.event_rsvps where event_id=e.id and user_id=auth.uid();
 if p_status='cancelled' then
 update public.event_rsvps set status='cancelled' where event_id=e.id and user_id=auth.uid();
 perform public.promote_event_waitlist(p_event); return 'cancelled';
 end if;
 if not public.rsvp_eligible(e,auth.uid()) then raise exception 'This event is unavailable or you are no longer eligible to attend'; end if;
 perform public.promote_event_waitlist(p_event);
 select status into previous from public.event_rsvps where event_id=e.id and user_id=auth.uid();
 if previous in ('going','waitlisted') then return previous; end if;
 select count(*) into n from public.event_rsvps where event_id=e.id and status='going';
 next_status:=case when e.pulse_capacity is null or n<e.pulse_capacity then 'going' else 'waitlisted' end;
 -- jsonb_populate_record preserves the existing UUID, bigint or text event ID type.
 insert into public.event_rsvps(user_id,event_id,status)
 select auth.uid(),e.id,next_status on conflict(user_id,event_id) do update set status=excluded.status,queue_order=default;
 return next_status;
end $$;
create function public.event_attendance(p_events text[]) returns table(event_id text,going bigint,waitlisted bigint,capacity integer) language sql stable security definer set search_path='' as $$
 select e.id::text,count(r.user_id) filter(where r.status='going'),count(r.user_id) filter(where r.status='waitlisted'),e.pulse_capacity
 from public.events e left join public.event_rsvps r on r.event_id=e.id
 where e.id::text=any(p_events) and cardinality(p_events)<=100
 and public.can_view_event(e.id::text,e.pulse_owner_id,e.pulse_club_id,e.pulse_status,e.pulse_visibility)
 group by e.id
$$;
create function public.set_event_capacity(p_event text,p_capacity integer) returns void language plpgsql security definer set search_path='' as $$
declare e public.events; saved public.events; begin
 select * into e from public.events where id::text=p_event for update;
 if not found or not coalesce(public.can_manage_event(e.pulse_owner_id,e.pulse_club_id),false) then raise exception 'Event management permission required'; end if;
 update public.events set pulse_capacity=p_capacity,pulse_revision=pulse_revision+1 where id=e.id returning * into saved;
 insert into public.event_changes(event_id,revision,actor_id,snapshot) values(p_event,saved.pulse_revision,auth.uid(),to_jsonb(saved));
end $$;
create function public.attendance_event_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.pulse_capacity is not null and new.pulse_capacity<(select count(*) from public.event_rsvps where event_id=new.id and status='going') then
 raise exception 'Capacity cannot be lower than confirmed attendance'; end if;
 return new;
end $$;
create trigger attendance_capacity_guard before update of pulse_capacity on public.events for each row execute function public.attendance_event_guard();
create function public.attendance_event_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.promote_event_waitlist(new.id::text); return new; end $$;
create trigger attendance_event_changed after update of pulse_capacity,pulse_cancelled,pulse_status on public.events for each row execute function public.attendance_event_changed();
revoke all on function public.rsvp_eligible(public.events,uuid),public.promote_event_waitlist(text),public.attendance_event_guard(),public.attendance_event_changed() from public,anon,authenticated;
revoke all on function public.set_event_rsvp(text,text),public.event_attendance(text[]),public.set_event_capacity(text,integer) from public,anon;
grant execute on function public.set_event_rsvp(text,text),public.event_attendance(text[]),public.set_event_capacity(text,integer) to authenticated;
-- Publish only tables protected by existing visibility/ownership RLS.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['events','event_rsvps'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
 execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop; end if;
end $$;
commit;
