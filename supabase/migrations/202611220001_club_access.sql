begin;
create table public.club_event_restrictions (
 club_id uuid references public.clubs on delete cascade,
 user_id uuid references auth.users on delete cascade,
 kind text not null check (kind in ('rsvp','visibility')),
 primary key (club_id,user_id)
);
create table public.club_event_invites (
 event_id uuid references public.events on delete cascade,
 user_id uuid references auth.users on delete cascade,
 primary key(event_id,user_id)
);
alter table public.club_event_restrictions enable row level security;
alter table public.club_event_invites enable row level security;
revoke all on public.club_event_restrictions, public.club_event_invites from public,anon,authenticated;
alter table public.events drop constraint events_pulse_visibility_check;
alter table public.events add check (pulse_visibility in ('public','club_only','private'));
alter table public.events add check (pulse_visibility <> 'private' or club_id is not null);

create function public.club_event_access(p_event uuid,p_club uuid,p_visibility text) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_club is null then p_visibility='public' else
 not exists(select 1 from public.club_event_restrictions where club_id=p_club and user_id=auth.uid() and kind='visibility')
 and (p_visibility='public' or (public.community_active_member(p_club) and
 (p_visibility='club_only' or public.community_can_edit_event(p_event) or
 exists(select 1 from public.club_event_invites where event_id=p_event and user_id=auth.uid())))) end
$$;
revoke all on function public.club_event_access(uuid,uuid,text) from public;
grant execute on function public.club_event_access(uuid,uuid,text) to authenticated,anon;
alter policy club_event_visibility on public.events using(public.club_event_access(id,club_id,pulse_visibility));
create or replace function public.community_event_visible(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=p_event and public.pulse_event_access(e.created_by,e.pulse_age_min)
 and public.club_event_access(e.id,e.club_id,e.pulse_visibility))
$$;

create function public.set_club_restriction(p_club uuid,p_user uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.clubs where id=p_club for update;
 if not public.community_club_admin(p_club) then raise exception 'Club admin required.'; end if;
 if p_kind is null then
   delete from public.club_event_restrictions where club_id=p_club and user_id=p_user;
   return;
 end if;
 if not public.pulse_account_active(p_user) or exists(
 select 1 from public.club_memberships where club_id=p_club and user_id=p_user and status='active' and role in ('admin','officer'))
 then raise exception 'Choose an active user who does not manage this club.'; end if;
 insert into public.club_event_restrictions values(p_club,p_user,p_kind)
 on conflict(club_id,user_id) do update set kind=excluded.kind;
 update public.event_rsvps r set status='cancelled' from public.events e
 where e.id=r.event_id and e.club_id=p_club and r.user_id=p_user and r.status='going'
 and coalesce(e.pulse_starts_at,e.event_date::timestamptz)>now();
end $$;

create function public.find_club_restriction_targets(p_club uuid,p_name text)
returns table(user_id uuid,display_name text,kind text)
language sql stable security definer set search_path='' as $$
 select p.user_id,p.display_name,r.kind from public.profiles p
 left join public.club_event_restrictions r on r.club_id=p_club and r.user_id=p.user_id
 where public.community_club_admin(p_club) and public.pulse_profile_visible(p.user_id)
 and (r.kind is not null or (btrim(p_name)<>'' and lower(p.display_name)=lower(btrim(p_name))))
 order by p.display_name,p.user_id limit 25
$$;

create function public.list_club_restriction_attendees(p_event uuid,p_offset integer default 0)
returns table(user_id uuid,display_name text,kind text)
language sql stable security definer set search_path='' as $$
 select r.user_id,coalesce(p.display_name,'Event attendee'),x.kind
 from public.events e join public.event_rsvps r on r.event_id=e.id
 left join public.profiles p on p.user_id=r.user_id and public.pulse_profile_visible(p.user_id)
 left join public.club_event_restrictions x on x.club_id=e.club_id and x.user_id=r.user_id
 where e.id=p_event and public.community_club_admin(e.club_id) and (r.status='going' or x.kind is not null)
 order by r.user_id limit 25 offset greatest(0,p_offset)
$$;
revoke all on function public.list_club_restriction_attendees(uuid,integer) from public,anon;
grant execute on function public.list_club_restriction_attendees(uuid,integer) to authenticated;

create function public.manage_club_invitation(p_event uuid,p_user uuid,p_invite boolean) returns void
language plpgsql security definer set search_path='' as $$
declare target public.events%rowtype;
begin
 perform public.lock_event_club(p_event::text);
 select * into target from public.events where id=p_event for update;
 if target.club_id is null or not public.community_can_edit_event(p_event) then raise exception 'Club event manager required.'; end if;
 if p_invite then
   if not public.community_active_member(target.club_id,p_user) then raise exception 'Choose an active club member.'; end if;
   insert into public.club_event_invites values(p_event,p_user) on conflict do nothing;
 else
   delete from public.club_event_invites where event_id=p_event and user_id=p_user;
   if target.pulse_visibility='private' then
     update public.event_rsvps set status='cancelled' where event_id=p_event and user_id=p_user and status='going';
   end if;
 end if;
end $$;

create function public.list_club_event_invites(p_event uuid) returns setof uuid
language sql stable security definer set search_path='' as $$
 select user_id from public.club_event_invites where event_id=p_event and public.community_can_edit_event(p_event)
$$;

create function public.clear_departed_club_invites() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or new.status<>'active' then
   delete from public.club_event_invites i using public.events e
   where e.id=i.event_id and e.club_id=old.club_id and i.user_id=old.user_id;
   update public.event_rsvps r set status='cancelled' from public.events e
   where e.id=r.event_id and e.club_id=old.club_id and e.pulse_visibility='private' and r.user_id=old.user_id and r.status='going';
 end if;
 return null;
end $$;
create trigger clear_departed_club_invites after delete or update of status on public.club_memberships
for each row execute function public.clear_departed_club_invites();

do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.set_event_rsvp(text,text)'::regprocedure);
 execute replace(definition,'if target.pulse_cancelled or','if exists(select 1 from public.club_event_restrictions where club_id=target.club_id and user_id=auth.uid()) or target.pulse_cancelled or');
 definition:=pg_get_functiondef('public.edit_pulse_event(text,integer,jsonb)'::regprocedure);
 definition:=replace(definition,'''public'',''club_only''','''public'',''club_only'',''private''');
 definition:=replace(definition,'visibility=''club_only''','visibility in (''club_only'',''private'')');
 definition:=replace(definition,'and not public.community_active_member(previous.club_id,user_id);',
 'and (not public.community_active_member(previous.club_id,user_id) or (visibility=''private''
 and not exists(select 1 from public.club_event_invites i where i.event_id=previous.id and i.user_id=event_rsvps.user_id)
 and not exists(select 1 from public.club_memberships m where m.club_id=previous.club_id and m.user_id=event_rsvps.user_id and m.status=''active'' and m.role in (''admin'',''officer''))));');
 execute definition;
 definition:=pg_get_functiondef('public.create_club_event(uuid,jsonb)'::regprocedure);
 execute replace(definition,'''public'',''club_only''','''public'',''club_only'',''private''');
end $$;
revoke all on function public.clear_departed_club_invites() from public,anon,authenticated;
revoke all on function public.set_club_restriction(uuid,uuid,text), public.find_club_restriction_targets(uuid,text), public.manage_club_invitation(uuid,uuid,boolean), public.list_club_event_invites(uuid) from public,anon;
grant execute on function public.set_club_restriction(uuid,uuid,text), public.find_club_restriction_targets(uuid,text), public.manage_club_invitation(uuid,uuid,boolean), public.list_club_event_invites(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
