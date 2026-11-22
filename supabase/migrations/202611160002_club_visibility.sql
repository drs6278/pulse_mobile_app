begin;
alter table public.events add column pulse_visibility text not null default 'public'
 check(pulse_visibility in ('public','club_only'));
alter table public.events add constraint club_visibility_requires_club check(pulse_visibility='public' or club_id is not null);

create function public.community_active_member(p_club uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.pulse_account_active(p_user) and exists(select 1 from public.club_memberships m
 join public.clubs c on c.id=m.club_id where m.club_id=p_club and m.user_id=p_user and m.status='active' and c.deleted_at is null)
$$;
revoke all on function public.community_active_member(uuid,uuid) from public,anon,authenticated;
create function public.community_active_member(p_club uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.community_active_member(p_club,auth.uid())
$$;
revoke all on function public.community_active_member(uuid) from public,anon;
grant execute on function public.community_active_member(uuid) to authenticated,anon;
-- Cover existing anonymous event policies too, without broadening their grants.
create policy club_event_visibility on public.events as restrictive for select to public
 using(pulse_visibility='public' or public.community_active_member(club_id));
drop policy memberships_read on public.club_memberships;
create policy memberships_read on public.club_memberships for select to authenticated
 using(public.pulse_account_active() and (user_id=auth.uid() or public.community_club_admin(club_id) or (status='active' and public.community_active_member(club_id))));
create function public.club_member_count(p_club uuid) returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.club_memberships where club_id=p_club and status='active' and public.pulse_account_active()
$$;
revoke all on function public.club_member_count(uuid) from public,anon;
grant execute on function public.club_member_count(uuid) to authenticated;

-- Definer functions bypass event RLS, so the shared predicate checks visibility explicitly.
create or replace function public.community_event_visible(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=p_event and public.pulse_event_access(e.created_by,e.pulse_age_min)
 and (e.pulse_visibility='public' or public.community_active_member(e.club_id)))
$$;
create policy club_notification_visibility on public.event_notifications as restrictive for select to authenticated
 using(exists(select 1 from public.events e where e.id::text=event_id));

create function public.cancel_departed_club_rsvps() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' or new.status<>'active' then
 update public.event_rsvps r set status='cancelled' from public.events e
 where r.event_id=e.id and r.user_id=old.user_id and e.club_id=old.club_id and e.pulse_visibility='club_only' and r.status='going';
 end if;
 return null;
end $$;
revoke all on function public.cancel_departed_club_rsvps() from public,anon,authenticated;
create trigger cancel_departed_club_rsvps after delete or update of status on public.club_memberships
 for each row execute function public.cancel_departed_club_rsvps();
notify pgrst,'reload schema';
commit;
