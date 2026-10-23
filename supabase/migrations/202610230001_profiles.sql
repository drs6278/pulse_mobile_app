-- Apply after event creation and schedule review, first against staging.
begin;

create table public.private_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  age_band text not null default 'unknown' check (age_band in ('unknown','under_18','18_to_20','21_plus')),
  account_state text not null default 'active' check (account_state in ('active','suspended','deleting')),
  profile_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Pulse student' check (display_name=btrim(display_name) and char_length(display_name) between 1 and 60 and display_name !~ '[[:cntrl:]]'),
  bio text not null default '' check (char_length(bio)<=280),
  avatar_path text,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create index user_blocks_target on public.user_blocks(blocked_id,blocker_id);
create table public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  subject_id uuid references auth.users(id) on delete set null,
  reason text not null check(reason in ('harassment','impersonation','inappropriate_content','spam','other')),
  details text not null default '' check(char_length(details)<=1000),
  status text not null default 'open' check(status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create index profile_reports_queue on public.profile_reports(status,created_at);
create table public.profile_moderation_actions (
  id uuid primary key default gen_random_uuid(), report_id uuid references public.profile_reports(id) on delete set null,
  subject_id uuid, actor text not null, action text not null, created_at timestamptz not null default now()
);
-- No Auth FK: cleanup records must survive a partially completed deletion.
create table public.profile_avatar_objects (
  path text primary key, user_id uuid not null, created_at timestamptz not null default now(),
  ready boolean not null default false, cleanup_requested boolean not null default false,
  check(path like user_id::text || '/%.jpg')
);
create table public.account_deletion_requests (
  user_id uuid primary key, status text not null default 'queued' check(status in ('queued','processing','failed','complete')),
  requested_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  attempts integer not null default 0, last_error text
);

create function public.provision_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.private_profiles(user_id) values(new.id);
  insert into public.profiles(user_id) values(new.id);
  return new;
end $$;
create trigger provision_profile after insert on auth.users for each row execute function public.provision_profile();
insert into public.private_profiles(user_id) select id from auth.users;
insert into public.profiles(user_id) select id from auth.users;

create function public.pulse_account_active(p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.private_profiles where user_id=p_user and account_state='active')
$$;
create function public.pulse_users_blocked(p_other uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_blocks where
    (blocker_id=auth.uid() and blocked_id=p_other) or (blocked_id=auth.uid() and blocker_id=p_other))
$$;
create function public.pulse_profile_visible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.pulse_account_active(auth.uid()) and exists(select 1 from public.private_profiles
    where user_id=p_user and account_state='active' and (user_id=auth.uid() or (not profile_hidden and not public.pulse_users_blocked(p_user))))
$$;
create function public.pulse_age_eligible(p_min integer) returns boolean language sql stable security definer set search_path='' as $$
  select public.pulse_account_active(auth.uid()) and (p_min=0 or exists(select 1 from public.private_profiles
    where user_id=auth.uid() and (age_band='21_plus' or (age_band='18_to_20' and p_min<=18))))
$$;
create function public.pulse_event_access(p_owner uuid,p_min integer) returns boolean language sql stable security definer set search_path='' as $$
  select public.pulse_account_active(auth.uid()) and
    (p_owner is null or (public.pulse_account_active(p_owner) and not public.pulse_users_blocked(p_owner))) and
    (p_owner=auth.uid() or public.pulse_age_eligible(p_min))
$$;

alter table public.private_profiles enable row level security;
alter table public.profiles enable row level security;
alter table public.user_blocks enable row level security;
alter table public.profile_reports enable row level security;
alter table public.profile_moderation_actions enable row level security;
alter table public.profile_avatar_objects enable row level security;
alter table public.account_deletion_requests enable row level security;
revoke all on public.private_profiles,public.profiles,public.user_blocks,public.profile_reports,public.profile_moderation_actions,public.profile_avatar_objects,public.account_deletion_requests from public,anon,authenticated;
grant select on public.private_profiles,public.profiles,public.user_blocks to authenticated;
grant all on public.private_profiles,public.profiles,public.user_blocks,public.profile_reports,public.profile_moderation_actions,public.profile_avatar_objects,public.account_deletion_requests to service_role;
create policy private_profile_owner on public.private_profiles for select to authenticated using(user_id=(select auth.uid()));
create policy profile_reader on public.profiles for select to authenticated using(public.pulse_profile_visible(user_id));
create policy block_owner on public.user_blocks for select to authenticated using(blocker_id=(select auth.uid()) and public.pulse_account_active());

create function public.save_profile(p_name text,p_bio text,p_age text,p_version integer,p_avatar text default null,p_change_avatar boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.pulse_account_active() then raise exception 'Account unavailable'; end if;
  -- Row lock also serializes avatar saves and deletion requests.
  perform 1 from public.private_profiles where user_id=auth.uid() and account_state='active' for update;
  if not found then raise exception 'Account unavailable'; end if;
  if p_change_avatar and p_avatar is not null and not exists(select 1 from public.profile_avatar_objects a join storage.objects o on o.bucket_id='profile-avatars' and o.name=a.path where a.path=p_avatar and a.user_id=auth.uid() and a.ready and not a.cleanup_requested) then raise exception 'Photo unavailable. Choose the photo again.'; end if;
  update public.profiles set display_name=btrim(p_name),bio=btrim(p_bio),avatar_path=case when p_change_avatar then p_avatar else avatar_path end,version=version+1,updated_at=now()
    where user_id=auth.uid() and version=p_version;
  if not found then raise exception 'Profile changed. Reload before saving.'; end if;
  update public.private_profiles set age_band=p_age where user_id=auth.uid();
end $$;

create function public.set_user_block(p_user uuid,p_blocked boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.pulse_account_active() or p_user=auth.uid() then raise exception 'Account unavailable'; end if;
  if p_blocked then
    if not public.pulse_account_active(p_user) then raise exception 'Profile unavailable'; end if;
    insert into public.user_blocks(blocker_id,blocked_id) values(auth.uid(),p_user) on conflict do nothing;
  else delete from public.user_blocks where blocker_id=auth.uid() and blocked_id=p_user;
  end if;
end $$;
create function public.list_blocked_profiles() returns table(user_id uuid,display_name text) language sql stable security definer set search_path='' as $$
  select b.blocked_id,p.display_name from public.user_blocks b join public.profiles p on p.user_id=b.blocked_id
    where b.blocker_id=auth.uid() and public.pulse_account_active() order by b.created_at desc
$$;
create function public.report_profile(p_user uuid,p_reason text,p_details text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if p_user=auth.uid() or not public.pulse_profile_visible(p_user) then raise exception 'Profile unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,42));
  if (select count(*) from public.profile_reports where reporter_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before sending another report.'; end if;
  insert into public.profile_reports(reporter_id,subject_id,reason,details) values(auth.uid(),p_user,p_reason,btrim(p_details)) returning id into result;
  return result;
end $$;
-- Only trusted Dashboard/server operators can execute moderation; never user metadata.
create function public.moderate_profile(p_report uuid,p_action text,p_actor text) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if p_action not in ('dismiss','hide','suspend','restore') or nullif(btrim(p_actor),'') is null then raise exception 'Invalid moderation action'; end if;
  select subject_id into target from public.profile_reports where id=p_report for update;
  if not found then raise exception 'Report unavailable'; end if;
  if p_action='hide' then update public.private_profiles set profile_hidden=true where user_id=target;
  elsif p_action='suspend' then update public.private_profiles set account_state='suspended',profile_hidden=true where user_id=target and account_state<>'deleting';
  elsif p_action='restore' then update public.private_profiles set account_state='active',profile_hidden=false where user_id=target and account_state<>'deleting'; end if;
  update public.profile_reports set status=case when p_action='dismiss' then 'dismissed' else 'resolved' end,resolved_at=now() where id=p_report;
  insert into public.profile_moderation_actions(report_id,subject_id,actor,action) values(p_report,target,p_actor,p_action);
end $$;

alter table public.events add column pulse_age_min integer not null default 0 check(pulse_age_min in (0,18,21));
grant insert(pulse_age_min) on public.events to authenticated;
-- Restrictive policies compose with, rather than replace, existing visibility policies.
create policy profile_event_read on public.events as restrictive for select to authenticated
  using(public.pulse_event_access(created_by,pulse_age_min));
create policy profile_event_anonymous on public.events as restrictive for all to anon using(false) with check(false);
create policy profile_event_write on public.events as restrictive for all to authenticated
  using(public.pulse_account_active()) with check(public.pulse_account_active());
create policy profile_rsvp_access on public.event_rsvps as restrictive for all to authenticated
  using(public.pulse_account_active()) with check(public.pulse_account_active() and
    (status='cancelled' or exists(select 1 from public.events e where e.id=event_id and not e.pulse_cancelled and public.pulse_age_eligible(e.pulse_age_min))));

-- Retired/suspended sessions cannot use scheduling or Storage even before JWT expiry.
do $$ declare t text; begin
  foreach t in array array['schedule_preferences','schedule_series','schedule_exceptions','schedule_imports','schedule_sources'] loop
    execute format('create policy profile_active on public.%I as restrictive for all to authenticated using(public.pulse_account_active()) with check(public.pulse_account_active())',t);
  end loop;
end $$;
create policy profile_active_storage on storage.objects as restrictive for all to authenticated
  using(public.pulse_account_active()) with check(public.pulse_account_active());
-- Existing SECURITY DEFINER source RPCs bypass RLS, so guard their writes too.
create function public.guard_profile_account() returns trigger language plpgsql set search_path='' as $$
begin
  if auth.uid() is not null and auth.role()<>'service_role' and not public.pulse_account_active() then raise exception 'Account unavailable'; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['schedule_preferences','schedule_series','schedule_exceptions','schedule_imports','schedule_sources','events','event_rsvps'] loop
    execute format('create trigger profile_account_guard before insert or update on public.%I for each row execute function public.guard_profile_account()',t);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('profile-avatars','profile-avatars',false,5242880,array['image/jpeg']);
create policy profile_avatar_read on storage.objects for select to authenticated using(
  bucket_id='profile-avatars' and exists(select 1 from public.profiles p where p.avatar_path=name and public.pulse_profile_visible(p.user_id))
);
-- Uploads use a validated Edge Function; no client INSERT/UPDATE grants/policies.
create function public.register_profile_avatar() returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
  perform 1 from public.private_profiles where user_id=auth.uid() and account_state='active' for update;
  if not found then raise exception 'Account unavailable'; end if;
  if (select count(*) from public.profile_avatar_objects where user_id=auth.uid())>=10 then raise exception 'Too many uploads. Please try again after cleanup.'; end if;
  result := auth.uid()::text || '/' || gen_random_uuid()::text || '.jpg';
  insert into public.profile_avatar_objects(path,user_id) values(result,auth.uid());
  return result;
end $$;
create function public.save_profile_avatar(p_path text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.private_profiles where user_id=auth.uid() and account_state='active' for update;
  if not found then raise exception 'Account unavailable'; end if;
  if p_path is not null and not exists(select 1 from public.profile_avatar_objects a join storage.objects o on o.bucket_id='profile-avatars' and o.name=a.path where a.path=p_path and a.user_id=auth.uid() and a.ready and not a.cleanup_requested) then raise exception 'Photo unavailable'; end if;
  update public.profiles set avatar_path=p_path,version=version+1,updated_at=now() where user_id=auth.uid() and version=p_version;
  if not found then raise exception 'Profile changed. Reload before saving.'; end if;
end $$;

create function public.claim_profile_avatar_cleanup() returns setof public.profile_avatar_objects language plpgsql security definer set search_path='' as $$
declare item record;
begin
  for item in select a.path,a.user_id from public.profile_avatar_objects a
    where a.created_at<now()-interval '1 hour' and not exists(select 1 from public.profiles p where p.avatar_path=a.path)
    order by a.created_at limit 100 loop
    perform 1 from public.private_profiles where user_id=item.user_id for update;
    if not exists(select 1 from public.profiles where avatar_path=item.path) then
      return query update public.profile_avatar_objects set cleanup_requested=true where path=item.path returning *;
    end if;
  end loop;
end $$;
create function public.profile_deletion_preview() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('hosted_events',(select count(*) from public.events where created_by=auth.uid()),
    'schedule_entries',(select count(*) from public.schedule_series where user_id=auth.uid())) where auth.uid() is not null
$$;
-- Only the server calls this after verifying the password against Auth.
create function public.begin_profile_deletion(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.private_profiles where user_id=p_user for update;
  if not found then raise exception 'Account unavailable'; end if;
  perform public.resolve_profile_clubs(p_user);
  update public.private_profiles set account_state='deleting' where user_id=p_user;
  insert into public.account_deletion_requests(user_id) values(p_user) on conflict(user_id) do nothing;
end $$;
-- Compatibility adapter for D07's club_id/user_id/role membership contract.
-- Resolve atomically before accepting deletion; unfamiliar schemas fail without data changes.
create function public.resolve_profile_clubs(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare club record; successor uuid; owner_column text; column_count integer; club_query text;
begin
  if to_regclass('public.clubs') is null and to_regclass('public.club_memberships') is null then return; end if;
  if exists(select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and c.conrelid='public.events'::regclass and c.confrelid='auth.users'::regclass and a.attname<>'created_by') then
    raise exception 'Club event creator references require a reviewed account-deletion adapter.';
  end if;
  select count(*) into column_count from information_schema.columns where table_schema='public' and table_name='club_memberships' and column_name in ('club_id','user_id','role');
  if column_count<>3 then raise exception 'Club schema requires an account-deletion adapter before deletion can proceed.'; end if;
  select column_name into owner_column from information_schema.columns where table_schema='public' and table_name='clubs'
    and column_name in ('creator_user_id','created_by','owner_id','creator_id') order by column_name limit 1;
  if owner_column is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='clubs' and column_name=owner_column and data_type<>'uuid') then raise exception 'Club owner schema requires review.'; end if;
  club_query := 'select distinct club_id from public.club_memberships where user_id=$1';
  if owner_column is not null then club_query := club_query || format(' union select id as club_id from public.clubs where %I=$1',owner_column); end if;
  for club in execute club_query using p_user loop
    -- Lock the club row to serialize two administrators deleting at the same time.
    execute 'select 1 from public.clubs where id=$1 for update' using club.club_id;
    execute 'select m.user_id from public.club_memberships m join public.private_profiles p on p.user_id=m.user_id
      where m.club_id=$1 and m.user_id<>$2 and p.account_state=''active''
      and coalesce(to_jsonb(m)->>''status'',''active'')=''active''
      order by case m.role when ''admin'' then 0 when ''officer'' then 1 else 2 end,m.user_id limit 1'
      into successor using club.club_id,p_user;
    if successor is null then
      -- A sole-member club can be removed. Preserve any club with remaining members.
      execute 'select count(*) from public.club_memberships where club_id=$1 and user_id<>$2' into column_count using club.club_id,p_user;
      if column_count>0 then raise exception 'A club administrator must resolve inactive club ownership before deletion. No account data has been removed.'; end if;
      execute 'delete from public.clubs where id=$1' using club.club_id;
    else
      execute 'update public.club_memberships set role=''admin'' where club_id=$1 and user_id=$2
        and not exists(select 1 from public.club_memberships m join public.private_profiles p on p.user_id=m.user_id
          where m.club_id=$1 and m.user_id<>$3 and m.role=''admin'' and p.account_state=''active''
          and coalesce(to_jsonb(m)->>''status'',''active'')=''active'')'
        using club.club_id,successor,p_user;
      if owner_column is not null then execute format('update public.clubs set %I=$1 where id=$2 and %I=$3',owner_column,owner_column) using successor,club.club_id,p_user; end if;
    end if;
  end loop;
  execute 'delete from public.club_memberships where user_id=$1' using p_user;
end $$;
create function public.claim_profile_deletion() returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  select user_id into result from public.account_deletion_requests
    where status in ('queued','failed') or (status='processing' and updated_at<now()-interval '10 minutes')
    order by updated_at for update skip locked limit 1;
  if result is null then return null; end if;
  update public.account_deletion_requests set status='processing',attempts=attempts+1,updated_at=now(),last_error=null where user_id=result;
  return result;
end $$;
create function public.purge_profile_data(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.account_deletion_requests where user_id=p_user and status='processing') then raise exception 'Deletion not claimed'; end if;
  if exists(select 1 from public.profile_avatar_objects where user_id=p_user and not ready and created_at>now()-interval '10 minutes') then raise exception 'An upload is finishing. Retry deletion shortly.'; end if;
  if exists(select 1 from storage.objects where bucket_id in ('profile-avatars','schedule-sources') and name like p_user::text || '/%') then raise exception 'Remove private files before deleting data'; end if;
  -- Club-hosted events belong to the club; preserve them after membership transfer.
  update public.events e set created_by=null where created_by=p_user and
    (coalesce(to_jsonb(e)->>'organizer_type',to_jsonb(e)->>'pulse_organizer_type','individual')='club'
      or coalesce(to_jsonb(e)->>'organizer_club_id',to_jsonb(e)->>'club_id') is not null);
  update public.events set pulse_cancelled=true where created_by=p_user;
  delete from public.events where created_by=p_user;
  delete from public.schedule_series where user_id=p_user;
  delete from public.schedule_imports where user_id=p_user;
  delete from public.schedule_sources where user_id=p_user;
  delete from public.profile_avatar_objects where user_id=p_user;
  -- Report details may contain personal information. Keep only aggregate audit metadata.
  update public.profile_reports set details='',reporter_id=null where reporter_id=p_user;
  update public.profile_reports set details='',subject_id=null where subject_id=p_user;
  update public.profile_moderation_actions set subject_id=null where subject_id=p_user;
end $$;

-- Default function privileges are PUBLIC; explicitly restrict every new helper/RPC.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('provision_profile','pulse_account_active','pulse_users_blocked','pulse_profile_visible','pulse_age_eligible','pulse_event_access','save_profile','set_user_block','list_blocked_profiles','report_profile','moderate_profile','guard_profile_account','register_profile_avatar','save_profile_avatar','claim_profile_avatar_cleanup','profile_deletion_preview','begin_profile_deletion','resolve_profile_clubs','claim_profile_deletion','purge_profile_data') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
grant execute on function public.pulse_account_active(uuid),public.pulse_users_blocked(uuid),public.pulse_profile_visible(uuid),public.pulse_age_eligible(integer),public.pulse_event_access(uuid,integer),public.save_profile(text,text,text,integer,text,boolean),public.set_user_block(uuid,boolean),public.list_blocked_profiles(),public.report_profile(uuid,text,text),public.register_profile_avatar(),public.save_profile_avatar(text,integer),public.profile_deletion_preview() to authenticated;
commit;
