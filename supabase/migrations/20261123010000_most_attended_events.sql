-- "Most going" feed sort. Same filters and paging as list_top_events, ranked by
-- RSVP count. Runs as the caller so event RLS (age, blocks, club visibility)
-- still decides which events appear; the count comes from event_going_count,
-- which only ever exposes a total.
create function public.list_most_attended_events(p_start date,p_end date,p_categories text[],p_title text,p_offset integer default 0) returns setof public.events
language sql stable security invoker set search_path='' as $$
 select e.* from public.events e where e.event_date>=p_start and (p_end is null or e.event_date<=p_end)
 and (cardinality(p_categories)=0 or e.category=any(p_categories)) and (p_title='' or e.title ilike '%'||p_title||'%')
 order by public.event_going_count(e.id::text) desc,e.event_date,e.id limit 20 offset greatest(p_offset,0)
$$;
revoke all on function public.list_most_attended_events(date,date,text[],text,integer) from public,anon;
grant execute on function public.list_most_attended_events(date,date,text[],text,integer) to authenticated;
