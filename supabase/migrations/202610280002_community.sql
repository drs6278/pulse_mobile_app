begin;

create table public.clubs (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 100),
 description text not null check(length(btrim(description)) between 1 and 4000), category text not null default 'Other',
 contact text not null default '', website text not null default '' check(website='' or website ~ '^https://'),
 meeting_location text not null default '', image_url text not null default '' check(image_url='' or image_url ~ '^https://'),
 approval_required boolean not null default false, deleted_at timestamptz, created_at timestamptz not null default now()
);
create table public.club_memberships (
 club_id uuid not null references public.clubs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check(role in ('member','admin')),
 status text not null default 'active' check(status in ('active','pending')), primary key(club_id,user_id)
);
create index club_memberships_user on public.club_memberships(user_id,club_id);
alter table public.events add column club_id uuid references public.clubs(id);

create function public.community_club_admin(p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pulse_account_active() and exists(select 1 from public.club_memberships where club_id=p_club and user_id=auth.uid() and role='admin' and status='active')
$$;
create table public.event_comments (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
 parent_id uuid, author_id uuid references auth.users(id) on delete set null,
 body text not null check(length(body)<=2000), created_at timestamptz not null default now(), edited_at timestamptz,
 deleted_at timestamptz, unique(id,event_id), foreign key(parent_id,event_id) references public.event_comments(id,event_id),
 check(parent_id is null or parent_id<>id)
);
create index event_comments_thread on public.event_comments(event_id,parent_id,created_at desc,id);
create index event_comments_author on public.event_comments(author_id,created_at);
create table public.community_votes (
 user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid references public.events(id) on delete cascade, club_id uuid references public.clubs(id) on delete cascade,
 comment_id uuid references public.event_comments(id) on delete cascade,
 value smallint not null check(value in (-1,1)), check(num_nonnulls(event_id,club_id,comment_id)=1)
);
create unique index community_votes_event on public.community_votes(event_id,user_id) where event_id is not null;
create unique index community_votes_club on public.community_votes(club_id,user_id) where club_id is not null;
create unique index community_votes_comment on public.community_votes(comment_id,user_id) where comment_id is not null;
create table public.community_moderators(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.comment_reports (
 id uuid primary key default gen_random_uuid(), comment_id uuid not null references public.event_comments(id) on delete cascade,
 reporter_id uuid references auth.users(id) on delete set null, reason text not null check(length(reason) between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','removed','dismissed')), created_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz, unique(comment_id,reporter_id)
);
create table public.discussion_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 comment_id uuid not null references public.event_comments(id) on delete cascade,
 created_at timestamptz not null default now(), read_at timestamptz, unique(user_id,comment_id)
);
create index discussion_notifications_inbox on public.discussion_notifications(user_id,created_at desc);

create function public.community_event_visible(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=p_event and public.pulse_event_access(e.created_by,e.pulse_age_min))
$$;
create function public.community_comment_visible(p_comment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.event_comments c where c.id=p_comment and c.deleted_at is null and public.community_event_visible(c.event_id)
 and c.author_id is not null and public.pulse_account_active(c.author_id) and not public.pulse_users_blocked(c.author_id))
$$;
create function public.community_moderator() returns boolean language sql stable security definer set search_path='' as $$
 select public.pulse_account_active() and exists(select 1 from public.community_moderators where user_id=auth.uid())
$$;
create function public.community_target_visible(p_kind text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pulse_account_active() and case p_kind
 when 'event' then public.community_event_visible(p_id)
 when 'club' then exists(select 1 from public.clubs where id=p_id and deleted_at is null)
 when 'comment' then public.community_comment_visible(p_id) else false end
$$;

create function public.community_summary(p_kind text,p_ids uuid[]) returns table(id uuid,score bigint,my_vote smallint,comment_count bigint)
language sql stable security definer set search_path='' as $$
 select target.id, coalesce(sum(v.value),0)::bigint, coalesce(max(v.value) filter(where v.user_id=auth.uid()),0)::smallint,
 case when p_kind='event' then (select count(*) from public.event_comments c where c.event_id=target.id and public.community_comment_visible(c.id)) else 0 end
 from unnest(p_ids) target(id) left join public.community_votes v on
 (case p_kind when 'event' then v.event_id when 'club' then v.club_id when 'comment' then v.comment_id end)=target.id
 where cardinality(p_ids)<=100 and public.community_target_visible(p_kind,target.id) group by target.id
$$;
create function public.set_community_vote(p_kind text,p_id uuid,p_value smallint) returns table(id uuid,score bigint,my_vote smallint,comment_count bigint)
language plpgsql security definer set search_path='' as $$
begin
 if p_value not in (-1,0,1) or not public.community_target_visible(p_kind,p_id) then raise exception 'Voting unavailable.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_kind||p_id::text,0));
 delete from public.community_votes v where v.user_id=auth.uid() and (case p_kind when 'event' then v.event_id when 'club' then v.club_id when 'comment' then v.comment_id end)=p_id;
 if p_value<>0 then insert into public.community_votes(user_id,event_id,club_id,comment_id,value) values(auth.uid(),case when p_kind='event' then p_id end,case when p_kind='club' then p_id end,case when p_kind='comment' then p_id end,p_value); end if;
 return query select * from public.community_summary(p_kind,array[p_id]);
end $$;

create function public.save_event_comment(p_event uuid,p_body text,p_parent uuid default null,p_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved uuid; parent public.event_comments; host uuid;
begin
 if not public.community_event_visible(p_event) or length(btrim(p_body)) not between 1 and 2000 then raise exception 'Enter a comment of 1–2,000 characters on an accessible event.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'comment',0));
 if p_id is not null then
 update public.event_comments set body=btrim(p_body),edited_at=now() where id=p_id and event_id=p_event and author_id=auth.uid() and deleted_at is null returning id into saved;
 if saved is null then raise exception 'Comment cannot be edited.'; end if; return saved;
 end if;
 if (select count(*) from public.event_comments where author_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Please wait before posting again.'; end if;
 if p_parent is not null then
 select * into parent from public.event_comments where id=p_parent and event_id=p_event;
 if not found or not public.community_comment_visible(p_parent) then raise exception 'Reply target unavailable.'; end if;
 end if;
 insert into public.event_comments(event_id,parent_id,author_id,body) values(p_event,p_parent,auth.uid(),btrim(p_body)) returning id into saved;
 select created_by into host from public.events where id=p_event;
 insert into public.discussion_notifications(user_id,comment_id)
 select recipient,saved from (select case when p_parent is null then host else parent.author_id end recipient) t
 where recipient is not null and recipient<>auth.uid() and public.pulse_account_active(recipient) and not public.pulse_users_blocked(recipient)
 on conflict do nothing;
 return saved;
end $$;
create function public.delete_event_comment(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.event_comments set body='',deleted_at=now() where id=p_id and author_id=auth.uid() and public.community_event_visible(event_id);
 if not found then raise exception 'Comment cannot be deleted.'; end if;
end $$;
create function public.list_event_comments(p_event uuid,p_parent uuid default null,p_top boolean default false,p_offset integer default 0)
returns table(id uuid,parent_id uuid,author_id uuid,body text,created_at timestamptz,edited_at timestamptz,display_name text,avatar_path text,score bigint,my_vote smallint,reply_count bigint)
language sql stable security definer set search_path='' as $$
 select c.id,c.parent_id,case when public.community_comment_visible(c.id) then c.author_id end,
 case when public.community_comment_visible(c.id) then c.body else '[Comment unavailable]' end,c.created_at,c.edited_at,
 case when public.community_comment_visible(c.id) then coalesce(p.display_name,'Pulse member') else 'Unavailable' end,
 case when public.community_comment_visible(c.id) then p.avatar_path end,
 coalesce((select sum(v.value) from public.community_votes v where v.comment_id=c.id),0)::bigint,
 coalesce((select v.value from public.community_votes v where v.comment_id=c.id and v.user_id=auth.uid()),0)::smallint,
 (select count(*) from public.event_comments child where child.parent_id=c.id)
 from public.event_comments c left join public.profiles p on p.user_id=c.author_id
 where c.event_id=p_event and c.parent_id is not distinct from p_parent and public.community_event_visible(p_event)
 order by case when p_top then coalesce((select sum(v.value) from public.community_votes v where v.comment_id=c.id),0) end desc,c.created_at desc,c.id
 limit 20 offset greatest(p_offset,0)
$$;
create function public.report_event_comment(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.community_comment_visible(p_id) or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Report unavailable.'; end if;
 insert into public.comment_reports(comment_id,reporter_id,reason) values(p_id,auth.uid(),btrim(p_reason)) on conflict(comment_id,reporter_id) do nothing;
end $$;
create function public.moderate_event_comment(p_report uuid,p_remove boolean) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not public.community_moderator() then raise exception 'Moderator access required.'; end if;
 update public.comment_reports set status=case when p_remove then 'removed' else 'dismissed' end,reviewed_by=auth.uid(),reviewed_at=now() where id=p_report and status='pending' returning comment_id into target;
 if target is null then raise exception 'Report already reviewed.'; end if;
 if p_remove then update public.event_comments set body='',deleted_at=now() where id=target; end if;
end $$;

create function public.save_club(p_draft jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 if not public.pulse_account_active() then raise exception 'Active account required.'; end if;
 if p_id is not null and not public.community_club_admin(p_id) then raise exception 'Club administrator required.'; end if;
 if p_id is null then
 insert into public.clubs(name,description) values(p_draft->>'name',p_draft->>'description') returning id into saved;
 insert into public.club_memberships(club_id,user_id,role) values(saved,auth.uid(),'admin');
 else saved:=p_id; end if;
 update public.clubs set name=btrim(p_draft->>'name'),description=btrim(p_draft->>'description'),category=coalesce(p_draft->>'category','Other'),contact=coalesce(p_draft->>'contact',''),website=coalesce(p_draft->>'website',''),meeting_location=coalesce(p_draft->>'meeting_location',''),image_url=coalesce(p_draft->>'image_url',''),approval_required=coalesce((p_draft->>'approval_required')::boolean,false) where id=saved and deleted_at is null;
 if not found then raise exception 'Club unavailable.'; end if;
 return saved;
end $$;
create function public.manage_club_member(p_club uuid,p_action text,p_user uuid default auth.uid()) returns void language plpgsql security definer set search_path='' as $$
declare club public.clubs; admin boolean;
begin
 if not public.pulse_account_active() then raise exception 'Active account required.'; end if;
 select * into club from public.clubs where id=p_club and deleted_at is null for update;
 if not found then raise exception 'Club unavailable.'; end if;
 admin:=public.community_club_admin(p_club);
 if p_action='join' and p_user=auth.uid() then
 insert into public.club_memberships(club_id,user_id,status) values(p_club,auth.uid(),case when club.approval_required then 'pending' else 'active' end) on conflict do nothing; return;
 end if;
 if not admin and not(p_action='leave' and p_user=auth.uid()) then raise exception 'Club administrator required.'; end if;
 if p_action in ('leave','remove','demote') and exists(select 1 from public.club_memberships where club_id=p_club and user_id=p_user and role='admin') and (select count(*) from public.club_memberships where club_id=p_club and role='admin' and status='active')<=1 then raise exception 'Appoint another administrator or delete this club first.'; end if;
 if p_action='reject' then delete from public.club_memberships where club_id=p_club and user_id=p_user and status='pending';
 elsif p_action in ('leave','remove') then delete from public.club_memberships where club_id=p_club and user_id=p_user;
 elsif p_action='approve' then update public.club_memberships set status='active' where club_id=p_club and user_id=p_user;
 elsif p_action in ('promote','demote') then update public.club_memberships set role=case when p_action='promote' then 'admin' else 'member' end where club_id=p_club and user_id=p_user and status='active';
 else raise exception 'Unknown membership action.'; end if;
end $$;
create function public.delete_club(p_club uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.clubs where id=p_club for update;
 if not public.community_club_admin(p_club) then raise exception 'Club administrator required.'; end if;
 update public.clubs set deleted_at=now() where id=p_club;
 update public.events set pulse_cancelled=true,pulse_revision=pulse_revision+1 where club_id=p_club and coalesce(pulse_starts_at,event_date::timestamptz)>now();
 delete from public.club_memberships where club_id=p_club;
end $$;

alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.event_comments enable row level security;
alter table public.community_votes enable row level security;
alter table public.comment_reports enable row level security;
alter table public.community_moderators enable row level security;
alter table public.discussion_notifications enable row level security;
revoke all on public.clubs,public.club_memberships,public.event_comments,public.community_votes,public.comment_reports,public.community_moderators,public.discussion_notifications from public,anon,authenticated;
grant select on public.clubs,public.club_memberships,public.comment_reports,public.discussion_notifications to authenticated;
grant update(read_at) on public.discussion_notifications to authenticated;
grant all on public.clubs,public.club_memberships,public.event_comments,public.community_votes,public.comment_reports,public.community_moderators,public.discussion_notifications to service_role;
create policy clubs_read on public.clubs for select to authenticated using(public.pulse_account_active());
create policy memberships_read on public.club_memberships for select to authenticated using(public.pulse_account_active() and (user_id=auth.uid() or status='active' or public.community_club_admin(club_id)));
create policy reports_read on public.comment_reports for select to authenticated using(public.community_moderator());
create policy discussion_read on public.discussion_notifications for select to authenticated using(user_id=auth.uid() and public.community_comment_visible(comment_id));
create policy discussion_read_update on public.discussion_notifications for update to authenticated using(user_id=auth.uid() and public.community_comment_visible(comment_id)) with check(user_id=auth.uid());

-- All mutation functions use auth.uid(); no client-supplied actor is trusted.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('community_club_admin','community_event_visible','community_comment_visible','community_target_visible','community_moderator','community_summary','set_community_vote','save_event_comment','delete_event_comment','list_event_comments','report_event_comment','moderate_event_comment','save_club','manage_club_member','delete_club') loop
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;

create function public.list_community_clubs(p_top boolean default false,p_offset integer default 0,p_id uuid default null) returns setof public.clubs
language sql stable security definer set search_path='' as $$
 select c.* from public.clubs c where public.pulse_account_active() and (case when p_id is null then c.deleted_at is null else c.id=p_id end)
 order by case when p_top then coalesce((select sum(value) from public.community_votes where club_id=c.id),0) end desc,lower(c.name),c.id limit 20 offset greatest(p_offset,0)
$$;
create function public.community_can_edit_event(p_event uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pulse_account_active() and exists(select 1 from public.events e where e.id=p_event and not e.pulse_cancelled and e.pulse_starts_at>now() and
 case when e.club_id is null then e.created_by=auth.uid() else public.community_club_admin(e.club_id) and exists(select 1 from public.clubs where id=e.club_id and deleted_at is null) end)
$$;
-- Preserve the validated edit implementation and its attendee notifications.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.edit_pulse_event(text,integer,jsonb)'::regprocedure);
 if position('previous.created_by is distinct from auth.uid()' in definition)=0 then raise exception 'Unexpected event editor contract. Review before applying.'; end if;
 definition:=replace(definition,'previous.created_by is distinct from auth.uid()','not public.community_can_edit_event(previous.id)');
 execute definition;
end $$;
create function public.create_club_event(p_club uuid,p_draft jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 perform 1 from public.clubs where id=p_club and deleted_at is null for update;
 if not found or not public.community_club_admin(p_club) then raise exception 'Club administrator required.'; end if;
 insert into public.events(title,location,category,event_date,pulse_starts_at,pulse_ends_at,pulse_timezone,pulse_age_min,club_id)
 values(btrim(p_draft->>'title'),btrim(p_draft->>'location'),p_draft->>'category',(p_draft->>'event_date')::date,(p_draft->>'pulse_starts_at')::timestamptz,(p_draft->>'pulse_ends_at')::timestamptz,p_draft->>'pulse_timezone',coalesce((p_draft->>'pulse_age_min')::integer,0),p_club) returning id into saved;
 perform public.edit_pulse_event(saved::text,1,p_draft);
 return saved;
end $$;
create function public.cancel_club_event(p_event uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.events where id=p_event for update;
 if not public.community_can_edit_event(p_event) or not exists(select 1 from public.events where id=p_event and club_id is not null) then raise exception 'Club event cannot be cancelled.'; end if;
 update public.events set pulse_cancelled=true,pulse_revision=pulse_revision+1 where id=p_event;
end $$;
create function public.list_top_events(p_start date,p_end date,p_categories text[],p_title text,p_offset integer default 0) returns setof public.events
language sql stable security invoker set search_path='' as $$
 select e.* from public.events e where e.event_date>=p_start and (p_end is null or e.event_date<=p_end)
 and (cardinality(p_categories)=0 or e.category=any(p_categories)) and (p_title='' or e.title ilike '%'||p_title||'%')
 order by (select s.score from public.community_summary('event',array[e.id]) s) desc,e.event_date,e.id limit 20 offset greatest(p_offset,0)
$$;
create function public.list_discussion_notifications(p_offset integer default 0)
returns table(id uuid,event_id uuid,comment_id uuid,event_title text,body text,created_at timestamptz,read_at timestamptz)
language sql stable security definer set search_path='' as $$
 select n.id,c.event_id,c.id,e.title,c.body,n.created_at,n.read_at from public.discussion_notifications n
 join public.event_comments c on c.id=n.comment_id join public.events e on e.id=c.event_id
 where n.user_id=auth.uid() and public.community_comment_visible(c.id) order by n.created_at desc,n.id limit 20 offset greatest(p_offset,0)
$$;
create function public.list_comment_reports() returns table(id uuid,reason text,body text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select r.id,r.reason,c.body,r.created_at from public.comment_reports r join public.event_comments c on c.id=r.comment_id where public.community_moderator() and r.status='pending' order by r.created_at,r.id limit 50
$$;
create function public.get_discussion_comment(p_id uuid,p_event uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(row) from public.event_comments c cross join lateral public.list_event_comments(c.event_id,c.parent_id,false,
 (select count(*)::integer from public.event_comments sibling where sibling.event_id=c.event_id and sibling.parent_id is not distinct from c.parent_id and (sibling.created_at,sibling.id)>(c.created_at,c.id))) row
 where c.id=p_id and c.event_id=p_event and row.id=p_id and public.community_event_visible(c.event_id)
$$;
revoke all on function public.get_discussion_comment(uuid,uuid) from public,anon;
grant execute on function public.get_discussion_comment(uuid,uuid) to authenticated;
-- Remove authored text as soon as deletion starts, before eventual auth cleanup.
create or replace function public.resolve_profile_clubs(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare target record; successor uuid;
begin
 for target in select distinct club_id from public.club_memberships where user_id=p_user loop
 perform 1 from public.clubs where id=target.club_id for update;
 select m.user_id into successor from public.club_memberships m where m.club_id=target.club_id and m.user_id<>p_user and m.status='active' and public.pulse_account_active(m.user_id) order by (m.role='admin') desc,m.user_id limit 1;
 if successor is not null then update public.club_memberships set role='admin' where club_id=target.club_id and user_id=successor;
 elsif exists(select 1 from public.club_memberships where club_id=target.club_id and user_id=p_user and role='admin') then
 update public.clubs set deleted_at=now() where id=target.club_id;
 update public.events set pulse_cancelled=true where club_id=target.club_id and coalesce(pulse_starts_at,event_date::timestamptz)>now();
 end if;
 delete from public.club_memberships where club_id=target.club_id and user_id=p_user;
 end loop;
end $$;
create function public.community_account_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.account_state='deleting' and old.account_state is distinct from new.account_state then
 update public.event_comments set body='',author_id=null,deleted_at=now() where author_id=new.user_id;
 delete from public.community_votes where user_id=new.user_id;
 update public.comment_reports set reporter_id=null,reason='Account deleted' where reporter_id=new.user_id;
 end if;
 return new;
end $$;
create trigger community_account_cleanup after update of account_state on public.private_profiles for each row execute function public.community_account_cleanup();
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('list_community_clubs','community_can_edit_event','create_club_event','cancel_club_event','list_top_events','list_discussion_notifications','list_comment_reports') loop
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
revoke all on function public.community_account_cleanup() from public,anon,authenticated;
alter table public.clubs add constraint club_field_limits check(length(category)<=100 and length(contact)<=500 and length(website)<=500 and length(meeting_location)<=500 and length(image_url)<=500);
commit;
