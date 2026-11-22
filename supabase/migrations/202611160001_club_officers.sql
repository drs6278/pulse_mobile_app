begin;

alter table public.club_memberships drop constraint club_memberships_role_check;
alter table public.club_memberships add constraint club_memberships_role_check check(role in ('member','officer','admin'));

create function public.community_club_event_manager(p_club uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.pulse_account_active() and exists(
 select 1 from public.club_memberships m join public.clubs c on c.id=m.club_id
 where m.club_id=p_club and m.user_id=auth.uid() and m.status='active'
 and m.role in ('admin','officer') and c.deleted_at is null)
$$;
revoke all on function public.community_club_event_manager(uuid) from public,anon;
grant execute on function public.community_club_event_manager(uuid) to authenticated;

-- Keep the existing validated event workflow, widening only event management.
do $$ declare definition text; signature text; begin
 foreach signature in array array['public.community_can_edit_event(uuid)','public.create_club_event(uuid,jsonb)'] loop
 definition:=pg_get_functiondef(signature::regprocedure);
 if position('public.community_club_admin(' in definition)=0 then raise exception 'Unexpected club event contract: %',signature; end if;
 execute replace(definition,'public.community_club_admin(','public.community_club_event_manager(');
 end loop;
end $$;

create function public.set_club_member_role(p_club uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.clubs where id=p_club and deleted_at is null for update;
 if not found or not public.community_club_admin(p_club) then raise exception 'Club administrator required.'; end if;
 if p_role is null or p_role not in ('member','officer','admin') then raise exception 'Choose a valid club role.'; end if;
 if not public.pulse_account_active(p_user) or not exists(select 1 from public.club_memberships where club_id=p_club and user_id=p_user and status='active') then raise exception 'Active member required.'; end if;
 if p_role<>'admin' and exists(select 1 from public.club_memberships where club_id=p_club and user_id=p_user and role='admin')
 and (select count(*) from public.club_memberships where club_id=p_club and role='admin' and status='active' and public.pulse_account_active(user_id))<=1 then
 raise exception 'Appoint another administrator or delete this club first.';
 end if;
 update public.club_memberships set role=p_role where club_id=p_club and user_id=p_user;
end $$;
revoke all on function public.set_club_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_club_member_role(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
