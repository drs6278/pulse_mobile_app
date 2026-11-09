-- Event photos. Apply after 202610280001_event_edit_notifications.sql.
-- Bytes are uploaded only by the event-photo Edge Function, which re-encodes
-- them (stripping EXIF/GPS) before attaching them through set_event_photo.

alter table public.events add column if not exists pulse_image_path text;
alter table public.events add constraint pulse_image_path_format check (
  pulse_image_path is null or (length(pulse_image_path) <= 200
    and pulse_image_path ~ '^[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'));
create index if not exists events_image_path on public.events(pulse_image_path) where pulse_image_path is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('event-photos','event-photos',false,5242880,array['image/jpeg']);

-- A photo is readable exactly when its event is: the events read policies
-- (account state, age eligibility, blocks) apply to this subquery.
-- There are no client write policies; only the service role writes this bucket.
create policy event_photo_read on storage.objects for select to authenticated using(
  bucket_id='event-photos' and exists(select 1 from public.events e where e.pulse_image_path=name));

-- Attach or remove (p_path null) a photo. Same ownership and timing rules as
-- edit_pulse_event, but it neither bumps the revision nor notifies attendees,
-- so an open editor can still save.
create function public.set_event_photo(p_id text,p_path text)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.events%rowtype;
begin
  if auth.uid() is null or not public.pulse_account_active() then raise exception 'Sign in with an active account.'; end if;
  select * into previous from public.events where id::text=p_id for update;
  if not found or previous.created_by is distinct from auth.uid() then raise exception 'Only the original poster can change this event photo.'; end if;
  if previous.pulse_cancelled or coalesce(previous.pulse_starts_at,previous.pulse_all_day_start::timestamp at time zone previous.pulse_timezone,'-infinity'::timestamptz)<=clock_timestamp() then
    raise exception 'Event photos can only change before the event starts.';
  end if;
  if p_path is not null and (split_part(p_path,'/',1)<>p_id
    or not exists(select 1 from storage.objects o where o.bucket_id='event-photos' and o.name=p_path)) then
    raise exception 'Upload the photo before attaching it.';
  end if;
  update public.events set pulse_image_path=p_path where id=previous.id;
end $$;
revoke all on function public.set_event_photo(text,text) from public,anon;
grant execute on function public.set_event_photo(text,text) to authenticated;

-- Photos no event references: replaced, removed, or belonging to deleted
-- events (including account deletion). The hour of grace covers uploads that
-- have not been attached yet.
create function public.claim_event_photo_cleanup()
returns table(path text) language sql stable security definer set search_path='' as $$
  select o.name from storage.objects o
  where o.bucket_id='event-photos' and o.created_at<now()-interval '1 hour'
    and not exists(select 1 from public.events e where e.pulse_image_path=o.name)
  order by o.created_at limit 100
$$;
revoke all on function public.claim_event_photo_cleanup() from public,anon,authenticated;
grant execute on function public.claim_event_photo_cleanup() to service_role;

notify pgrst,'reload schema';
