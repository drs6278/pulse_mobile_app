begin;

create index club_events_upcoming on public.events(club_id,event_date,id) where not pulse_cancelled;
create index club_member_roster on public.club_memberships(club_id,status,role,user_id);
create index event_rsvp_going on public.event_rsvps(event_id,user_id) where status='going';

-- Every event write takes the club lock before the event lock. Membership
-- mutations already lock this same club row before changing eligibility.
create function public.lock_event_club(p_id text) returns void language plpgsql security definer set search_path='' as $$
declare club uuid;
begin
 select club_id into club from public.events where id::text=p_id;
 if club is not null then perform 1 from public.clubs where id=club for update; end if;
end $$;
revoke all on function public.lock_event_club(text) from public,anon,authenticated;

alter function public.edit_pulse_event(text,integer,jsonb) rename to edit_pulse_event_before_visibility;
revoke all on function public.edit_pulse_event_before_visibility(text,integer,jsonb) from public,anon,authenticated;
create function public.edit_pulse_event(p_id text,p_revision integer,p_draft jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.events%rowtype; visibility text;
begin
 perform public.lock_event_club(p_id);
 select * into previous from public.events where id::text=p_id for update;
 if not found then raise exception 'This event is no longer available.'; end if;
 visibility:=coalesce(p_draft->>'pulse_visibility',previous.pulse_visibility);
 if visibility not in ('public','club_only') or (visibility='club_only' and previous.club_id is null) then raise exception 'Choose a valid event visibility.'; end if;
 perform public.edit_pulse_event_before_visibility(p_id,p_revision,p_draft);
 if visibility is distinct from previous.pulse_visibility then
 update public.events set pulse_visibility=visibility,
 pulse_revision=case when pulse_revision=previous.pulse_revision then pulse_revision+1 else pulse_revision end where id=previous.id;
 if visibility='club_only' then
 update public.event_rsvps set status='cancelled' where event_id=previous.id and status='going'
 and not public.community_active_member(previous.club_id,user_id);
 end if;
 end if;
end $$;
revoke all on function public.edit_pulse_event(text,integer,jsonb) from public,anon;
grant execute on function public.edit_pulse_event(text,integer,jsonb) to authenticated;

-- Inject the same lock before legacy functions acquire an event row lock.
do $$ declare signature text; definition text; begin
 foreach signature in array array['public.cancel_club_event(uuid)','public.delete_pulse_event(text,integer)','public.set_event_photo(text,text)'] loop
 definition:=pg_get_functiondef(signature::regprocedure);
 if signature='public.set_event_photo(text,text)' then
 definition:=replace(definition,'previous.created_by is distinct from auth.uid()','not public.community_can_edit_event(previous.id)');
 end if;
 definition:=regexp_replace(definition,'\mbegin\M', E'begin\n perform public.lock_event_club(' || case when signature='public.cancel_club_event(uuid)' then 'p_event::text' else 'p_id' end || ');','i');
 execute definition;
 end loop;
end $$;

create function public.community_can_delete_event(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pulse_account_active() and exists(select 1 from public.events e where e.id=p_event and
 case when e.club_id is null then e.created_by=auth.uid() else public.community_club_admin(e.club_id) end)
$$;
revoke all on function public.community_can_delete_event(uuid) from public,anon;
grant execute on function public.community_can_delete_event(uuid) to authenticated;

-- Clients cannot bypass serialization via table writes. Authenticated actor
-- comes from the session; a supplied user ID is never trusted.
revoke insert,update,delete on public.event_rsvps from authenticated;
create function public.set_event_rsvp(p_event text,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare target public.events%rowtype;
begin
 if auth.uid() is null or not public.pulse_account_active() then raise exception 'Active account required.'; end if;
 if p_status is null or p_status not in ('going','cancelled') then raise exception 'Choose a valid RSVP status.'; end if;
 perform public.lock_event_club(p_event);
 select * into target from public.events where id::text=p_event for update;
 if not found then raise exception 'This event is no longer available.'; end if;
 if p_status='cancelled' then
 update public.event_rsvps set status='cancelled' where event_id=target.id and user_id=auth.uid();
 return;
 end if;
 if target.pulse_cancelled or not public.community_event_visible(target.id) then raise exception 'This event is unavailable.'; end if;
 insert into public.event_rsvps(user_id,event_id,status) values(auth.uid(),target.id,'going')
 on conflict(user_id,event_id) do update set status='going';
end $$;
revoke all on function public.set_event_rsvp(text,text) from public,anon;
grant execute on function public.set_event_rsvp(text,text) to authenticated;

-- Stable, bounded roster pages; caller's membership is fetched independently
-- so pagination never hides the caller's privileges.
create function public.list_club_members(p_club uuid,p_offset integer default 0)
returns table(user_id uuid,role text,status text,display_name text)
language sql stable security definer set search_path='' as $$
 select m.user_id,m.role,m.status,coalesce(p.display_name,'Club member')
 from public.club_memberships m left join public.profiles p on p.user_id=m.user_id and public.pulse_profile_visible(m.user_id)
 where m.club_id=p_club and public.community_active_member(p_club)
 and (m.status='active' or public.community_club_admin(p_club))
 order by m.status,m.role,m.user_id limit 25 offset greatest(0,p_offset)
$$;
revoke all on function public.list_club_members(uuid,integer) from public,anon;
grant execute on function public.list_club_members(uuid,integer) to authenticated;

-- Existing clients retain promote/demote, with the same active-account checks.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.manage_club_member(uuid,text,uuid)'::regprocedure);
 definition:=replace(definition, 'role=''admin'' and status=''active'')<=1', 'role=''admin'' and status=''active'' and public.pulse_account_active(user_id))<=1');
 definition:=replace(definition, 'elsif p_action in (''promote'',''demote'') then update public.club_memberships set role=case when p_action=''promote'' then ''admin'' else ''member'' end where club_id=p_club and user_id=p_user and status=''active'';', 'elsif p_action in (''promote'',''demote'') then perform public.set_club_member_role(p_club,p_user,case when p_action=''promote'' then ''admin'' else ''member'' end);');
 execute definition;
 definition:=pg_get_functiondef('public.save_club(jsonb,uuid)'::regprocedure);
 definition:=regexp_replace(definition,'\mbegin\M', E'begin\n if p_id is not null then perform 1 from public.clubs where id=p_id for update; end if;','i');
 execute definition;
end $$;

-- Only deletion of the last eligible admin requires appointing a successor.
-- Deleting an ordinary member must never elevate another member's role.
create or replace function public.resolve_profile_clubs(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare target record; successor uuid;
begin
 for target in select distinct club_id from public.club_memberships where user_id=p_user order by club_id loop
 perform 1 from public.clubs where id=target.club_id for update;
 if exists(select 1 from public.club_memberships where club_id=target.club_id and user_id=p_user and role='admin')
 and not exists(select 1 from public.club_memberships where club_id=target.club_id and user_id<>p_user and role='admin' and status='active' and public.pulse_account_active(user_id)) then
 select user_id into successor from public.club_memberships where club_id=target.club_id and user_id<>p_user and status='active' and public.pulse_account_active(user_id)
 order by (role='officer') desc,user_id limit 1;
 if successor is not null then update public.club_memberships set role='admin' where club_id=target.club_id and user_id=successor;
 else
 update public.clubs set deleted_at=now() where id=target.club_id;
 update public.events set pulse_cancelled=true,pulse_revision=pulse_revision+1 where club_id=target.club_id and coalesce(pulse_starts_at,event_date::timestamptz)>now();
 end if;
 end if;
 delete from public.club_memberships where club_id=target.club_id and user_id=p_user;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
