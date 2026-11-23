-- Attendee count for the event page. RSVP rows stay readable only by their owner,
-- so this definer function returns just the total (never who is going), and only
-- for events the caller can already see (age, blocks, club-only visibility).
create function public.event_going_count(p_event text) returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from public.events e
 join public.event_rsvps r on r.event_id=e.id and r.status='going'
 where e.id::text=p_event
 and public.pulse_account_active()
 and public.community_event_visible(e.id)
 and public.pulse_account_active(r.user_id)
$$;
revoke all on function public.event_going_count(text) from public,anon;
grant execute on function public.event_going_count(text) to authenticated;
