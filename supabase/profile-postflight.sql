-- Read-only assertions. Run as the Dashboard SQL editor administrator after
-- applying prerequisites and profiles. This does not replace signed-in tests.
do $$ declare object_name text; begin
  foreach object_name in array array[
    'schedule_preferences','schedule_series','schedule_exceptions','schedule_imports','schedule_sources',
    'events','event_rsvps','profiles','private_profiles','user_blocks','profile_reports',
    'profile_moderation_actions','profile_avatar_objects','account_deletion_requests'
  ] loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.' || object_name) and relrowsecurity) then
      raise exception 'Missing table or RLS: public.%', object_name;
    end if;
  end loop;
  foreach object_name in array array[
    'save_profile(text,text,text,integer,text,boolean)', 'pulse_account_active(uuid)',
    'pulse_profile_visible(uuid)', 'list_blocked_profiles()', 'set_user_block(uuid,boolean)',
    'report_profile(uuid,text,text)', 'profile_deletion_preview()', 'begin_profile_deletion(uuid)',
    'register_profile_avatar()', 'claim_profile_deletion()', 'purge_profile_data(uuid)',
    'claim_profile_avatar_cleanup()', 'clear_schedule()', 'create_schedule_source(text,text)'
  ] loop
    if to_regprocedure('public.' || object_name) is null then
      raise exception 'Missing function: public.%', object_name;
    end if;
  end loop;
  -- Compile the exact column selections used by loadOwnProfile, even on empty tables.
  perform user_id,age_band,account_state,profile_hidden,profile_setup_completed_at,created_at from public.private_profiles limit 0;
  perform user_id,display_name,bio,avatar_path,version,updated_at from public.profiles limit 0;
  if exists(select 1 from auth.users u left join public.private_profiles p on p.user_id=u.id
    left join public.profiles v on v.user_id=u.id where p.user_id is null or v.user_id is null) then
    raise exception 'Existing Auth users are missing public/private profile backfill';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
    and tgname='provision_profile' and tgenabled in ('O','A')
    and tgfoid=to_regprocedure('public.provision_profile()')) then
    raise exception 'Missing or disabled Auth profile provisioning trigger';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='private_profiles'
    and policyname='private_profile_owner') or
    not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles'
    and policyname='profile_reader') then
    raise exception 'Missing profile read policies';
  end if;
  if not has_table_privilege('authenticated','public.private_profiles','SELECT') or
    not has_table_privilege('authenticated','public.profiles','SELECT') or
    has_table_privilege('anon','public.private_profiles','SELECT') or
    has_table_privilege('anon','public.profiles','SELECT') or
    has_table_privilege('authenticated','public.private_profiles','UPDATE') or
    has_table_privilege('authenticated','public.profiles','UPDATE') then
    raise exception 'Unexpected profile read/write grants';
  end if;
  if not exists(select 1 from storage.buckets where id='profile-avatars' and not public) then
    raise exception 'Missing private profile-avatars bucket';
  end if;
  raise notice 'Profile structural checks passed. Complete signed-in verification in the handoff.';
end $$;
