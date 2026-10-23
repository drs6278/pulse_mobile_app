-- Read-only: run in the Supabase SQL editor before reviewing/applying migration.
select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns where table_schema='public'
and table_name in ('events','event_rsvps','schedule_series','schedule_imports','schedule_exceptions','schedule_preferences',
  'schedule_sources','profiles','private_profiles','user_blocks','profile_reports','profile_moderation_actions',
  'profile_avatar_objects','account_deletion_requests','clubs','club_memberships')
order by table_name,ordinal_position;
select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p') order by c.relname;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname in ('public','storage') order by schemaname,tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated') order by table_name,grantee;
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid=to_regclass('public.events');

-- These are inventory results, not proof of migration completeness. Compare with
-- each migration before skipping it; partial installations require review.
select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by p.proname,arguments;
select n.nspname as schema_name,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname in ('auth','public') order by n.nspname,c.relname,t.tgname;
select id,public,file_size_limit,allowed_mime_types from storage.buckets
where id in ('schedule-sources','profile-avatars');

-- Dashboard-only deployments may have no CLI migration-history table.
-- Notices contain version identifiers only, never SQL bodies or user data.
do $$ declare migration_version text; begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'No CLI migration history. Compare schema inventory against migration SQL.';
  else
    for migration_version in execute 'select version::text from supabase_migrations.schema_migrations order by version' loop
      raise notice 'Recorded migration: %', migration_version;
    end loop;
  end if;
end $$;
