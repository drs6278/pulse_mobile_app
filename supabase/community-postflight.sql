-- Read-only installation checks; no user data is returned.
select c.relname as table_name,c.relrowsecurity as rls_enabled,
 has_table_privilege('authenticated',c.oid,'INSERT') as direct_insert,
 has_table_privilege('authenticated',c.oid,'DELETE') as direct_delete
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('clubs','club_memberships','event_comments','community_votes','community_moderators','comment_reports','discussion_notifications')
order by c.relname;
select p.proname,p.prosecdef as security_definer,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('set_community_vote','save_event_comment','delete_event_comment','list_event_comments','report_event_comment','moderate_event_comment','save_club','manage_club_member','delete_club','create_club_event','cancel_club_event','get_discussion_comment','community_account_cleanup')
order by p.proname;
