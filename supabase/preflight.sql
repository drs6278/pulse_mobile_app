-- Read-only: run in the Supabase SQL editor before reviewing/applying migration.
select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns where table_schema='public'
and table_name in ('events','event_rsvps','schedule_series','schedule_imports','schedule_exceptions','schedule_preferences')
order by table_name,ordinal_position;
select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='events';
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated') order by table_name,grantee;
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.events'::regclass;
