begin;

-- Keep event writes behind checked RPCs rather than granting table DELETE.
create function public.delete_pulse_event(p_id text, p_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare target public.events%rowtype;
begin
  if auth.uid() is null or not public.pulse_account_active() then
    raise exception 'Sign in with an active account.';
  end if;
  select * into target from public.events where id::text=p_id for update;
  if not found then raise exception 'This event is no longer available.'; end if;
  if (target.club_id is null and target.created_by is distinct from auth.uid())
    or (target.club_id is not null and not public.community_club_admin(target.club_id)) then
    raise exception 'Only the organizer or a hosting club administrator can delete this event.';
  end if;
  if target.pulse_revision is distinct from p_revision then
    raise exception 'This event changed. Refresh before deleting it.';
  end if;
  delete from public.event_notifications where event_id=target.id::text;
  delete from public.events where id=target.id;
end $$;
revoke all on function public.delete_pulse_event(text,integer) from public,anon;
grant execute on function public.delete_pulse_event(text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
