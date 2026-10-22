begin;

create table public.schedule_sources (
  id uuid primary key default gen_random_uuid(),
  -- Keep this cleanup ledger even after account deletion, until Storage removal.
  user_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 200),
  format text not null check (format in ('ics','csv')),
  object_path text not null unique,
  parsed boolean not null default false,
  cleanup_requested boolean not null default false,
  created_at timestamptz not null default now(),
  unique(id,user_id),
  check (object_path = user_id::text || '/' || id::text || '.' || format)
);
create index schedule_sources_cleanup on public.schedule_sources(created_at);
alter table public.schedule_sources enable row level security;
revoke all on public.schedule_sources from public,anon,authenticated;
grant select on public.schedule_sources to authenticated;
grant all on public.schedule_sources to service_role;
create policy source_read on public.schedule_sources for select to authenticated using (user_id=(select auth.uid()));

alter table public.schedule_imports add column source_id uuid;
alter table public.schedule_imports add column payload_fingerprint text;
-- Source metadata is temporary; imports retain their label after cleanup.
alter table public.schedule_imports add constraint schedule_import_source_fk foreign key(source_id,user_id) references public.schedule_sources(id,user_id) on delete set null (source_id);

create function public.create_schedule_source(p_label text,p_format text) returns public.schedule_sources
language plpgsql security definer set search_path='' as $$
declare source public.schedule_sources; owner_id uuid := auth.uid(); new_id uuid := gen_random_uuid();
begin
  if owner_id is null or not exists(select 1 from auth.users where id=owner_id) then raise exception 'Sign in required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':schedule-source',0));
  if (select count(*) from public.schedule_sources where user_id=owner_id) >= 10 then raise exception 'Too many pending uploads. Discard a preview or wait for scheduled cleanup.'; end if;
  insert into public.schedule_sources(id,user_id,label,format,object_path)
    values(new_id,owner_id,p_label,p_format,owner_id::text || '/' || new_id::text || '.' || p_format) returning * into source;
  return source;
end $$;

create function public.mark_schedule_source_parsed(p_source uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.schedule_sources set parsed=true where id=p_source and user_id=auth.uid() and not cleanup_requested and created_at>now()-interval '24 hours';
  if not found then raise exception 'Upload unavailable'; end if;
end $$;

create function public.discard_schedule_source(p_source uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.schedule_sources set cleanup_requested=true where id=p_source and user_id=auth.uid();
end $$;

create function public.finish_schedule_source_cleanup(p_source uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  delete from public.schedule_sources where id=p_source
    and (user_id=auth.uid() or auth.role()='service_role')
    and (cleanup_requested or created_at<now()-interval '24 hours')
    and not exists(select 1 from storage.objects o where o.bucket_id='schedule-sources' and o.name=object_path);
end $$;

-- Deletion queues Storage cleanup in the same transaction. Storage bytes must be
-- deleted through its API, never by deleting rows directly from storage.objects.
create function public.queue_schedule_import_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.schedule_sources set cleanup_requested=true where id=old.source_id and user_id=old.user_id;
  return old;
end $$;
create trigger schedule_import_cleanup before delete on public.schedule_imports for each row execute function public.queue_schedule_import_cleanup();

drop function public.commit_schedule_import(text,text,jsonb);
create function public.commit_schedule_import(p_key text,p_label text,p_entries jsonb,p_source uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare batch uuid; fingerprint text := md5(p_label || p_entries::text); previous_fingerprint text; item jsonb; saved public.schedule_series; exception jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_key is null or length(p_key) not between 1 and 200 then raise exception 'Invalid import request key'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 2000 then raise exception 'Select 1-2000 entries'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_key,0));
  select id,payload_fingerprint into batch,previous_fingerprint from public.schedule_imports where user_id=auth.uid() and request_key=p_key;
  if batch is not null then
    if previous_fingerprint is not null and previous_fingerprint<>fingerprint then raise exception 'Import selections changed. Start a new preview.'; end if;
    return batch;
  end if;
  if p_source is not null then
    perform 1 from public.schedule_sources where id=p_source and user_id=auth.uid() and parsed and not cleanup_requested and created_at>now()-interval '24 hours' for update;
    if not found then raise exception 'Upload unavailable. Choose the file again.'; end if;
  end if;
  insert into public.schedule_imports(user_id,label,request_key,source_id,payload_fingerprint) values(auth.uid(),p_label,p_key,p_source,fingerprint) returning id into batch;
  for item in select jsonb_array_elements(p_entries) loop
    select * into saved from public.save_schedule((item->>'id')::uuid,coalesce((item->>'version')::integer,0),item->'draft',coalesce((item->>'clear_exceptions')::boolean,false));
    if item->>'id' is null then update public.schedule_series set import_id=batch where id=saved.id; end if;
    for exception in select jsonb_array_elements(coalesce(item->'exceptions','[]')) loop
      perform public.set_schedule_exception(saved.id,(select version from public.schedule_series where id=saved.id),exception->>'recurrence_key',(exception->>'cancelled')::boolean,exception->>'start_local',exception->>'end_local');
    end loop;
  end loop;
  update public.schedule_sources set cleanup_requested=true where id=p_source and user_id=auth.uid();
  return batch;
end $$;

create function public.clear_schedule() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from public.schedule_series where user_id=auth.uid();
  delete from public.schedule_imports where user_id=auth.uid();
  update public.schedule_sources set cleanup_requested=true where user_id=auth.uid();
end $$;

revoke all on function public.create_schedule_source(text,text),public.mark_schedule_source_parsed(uuid),public.discard_schedule_source(uuid),public.finish_schedule_source_cleanup(uuid),public.queue_schedule_import_cleanup(),public.commit_schedule_import(text,text,jsonb,uuid),public.clear_schedule() from public,anon;
grant execute on function public.create_schedule_source(text,text),public.mark_schedule_source_parsed(uuid),public.discard_schedule_source(uuid),public.finish_schedule_source_cleanup(uuid),public.commit_schedule_import(text,text,jsonb,uuid),public.clear_schedule() to authenticated;
grant execute on function public.finish_schedule_source_cleanup(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('schedule-sources','schedule-sources',false,2097152,array['text/calendar','text/csv']);
create policy schedule_source_upload on storage.objects for insert to authenticated with check (
  bucket_id='schedule-sources' and exists(select 1 from public.schedule_sources s where s.user_id=(select auth.uid()) and s.object_path=name and not s.cleanup_requested and s.created_at>now()-interval '24 hours')
);
create policy schedule_source_download on storage.objects for select to authenticated using (
  bucket_id='schedule-sources' and exists(select 1 from public.schedule_sources s where s.user_id=(select auth.uid()) and s.object_path=name)
);
create policy schedule_source_delete on storage.objects for delete to authenticated using (
  bucket_id='schedule-sources' and exists(select 1 from public.schedule_sources s where s.user_id=(select auth.uid()) and s.object_path=name and (s.cleanup_requested or s.created_at<now()-interval '24 hours'))
);
commit;
