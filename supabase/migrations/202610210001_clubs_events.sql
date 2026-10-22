-- Phase 2. Apply after 202610190001_scheduling.sql; test on a disposable database first.
begin;
create table public.clubs (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 description text not null default '' check(length(description)<=4000), created_by uuid references auth.users(id) on delete set null,
 version integer not null default 1, created_at timestamptz not null default now()
);
create table public.club_memberships (
 club_id uuid not null references public.clubs(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check(role in ('admin','officer','member')), primary key(club_id,user_id)
);
create index club_memberships_user on public.club_memberships(user_id,club_id);
alter table public.events add column pulse_owner_id uuid references auth.users(id) on delete set null,
 add column pulse_club_id uuid references public.clubs(id), add column pulse_description text not null default '',
 add column pulse_visibility text not null default 'public' check(pulse_visibility in ('public','private','club_only')),
 add column pulse_status text not null default 'published' check(pulse_status in ('draft','published','cancelled')),
 add constraint pulse_club_visibility check(pulse_visibility <> 'club_only' or pulse_club_id is not null),
 add constraint pulse_description_length check(length(pulse_description)<=8000);
create table public.event_invitations (
 event_id text not null, user_id uuid not null references auth.users(id) on delete cascade, primary key(event_id,user_id)
);
create table public.event_changes (
 id bigint generated always as identity primary key, event_id text not null, revision integer not null,
 actor_id uuid references auth.users(id) on delete set null, changed_at timestamptz not null default now(), snapshot jsonb not null
);
-- Private retry ledger: only save_event can access it.
create table public.event_create_requests (
 user_id uuid not null references auth.users(id) on delete cascade, request_key text not null check(length(request_key) between 1 and 120),
 event_id text, primary key(user_id,request_key)
);
alter table public.event_create_requests enable row level security;
revoke all on public.event_create_requests from public,anon,authenticated;
-- Helpers read membership without recursive membership RLS. No caller-supplied identity.
create function public.club_role(p_club uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.club_memberships where club_id=p_club and user_id=auth.uid()
$$;
create function public.can_manage_event(p_owner uuid,p_club uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and case when p_club is null then p_owner=auth.uid() else coalesce(public.club_role(p_club) in ('admin','officer'),false) end
$$;
create function public.can_view_event(p_id text,p_owner uuid,p_club uuid,p_status text,p_visibility text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.can_manage_event(p_owner,p_club) or
 (p_status <> 'draft' and (p_visibility='public' or (p_visibility='club_only' and public.club_role(p_club) is not null)
 or (p_visibility='private' and exists(select 1 from public.event_invitations where event_id=p_id and user_id=auth.uid())))))
$$;
alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.event_invitations enable row level security;
alter table public.event_changes enable row level security;
revoke all on public.clubs,public.club_memberships,public.event_invitations,public.event_changes from anon,authenticated;
grant select on public.clubs,public.club_memberships,public.event_invitations,public.event_changes to authenticated;
create policy clubs_read on public.clubs for select to authenticated using(true);
create policy membership_read on public.club_memberships for select to authenticated using(user_id=auth.uid() or public.club_role(club_id) is not null);
create policy invitations_read on public.event_invitations for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.events e where e.id::text=event_id and public.can_manage_event(e.pulse_owner_id,e.pulse_club_id)));
create policy changes_read on public.event_changes for select to authenticated using(exists(select 1 from public.events e where e.id::text=event_id and public.can_manage_event(e.pulse_owner_id,e.pulse_club_id)));
-- Replace legacy permissive policies: a pre-existing USING(true) must not leak private events.
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='events' loop
 execute format('drop policy %I on public.events',p.policyname); end loop;
end $$;
alter table public.events enable row level security;
revoke all on public.events from anon;
revoke insert,update,delete on public.events from authenticated;
grant select on public.events to authenticated;
create policy events_read on public.events for select to authenticated using(public.can_view_event(id::text,pulse_owner_id,pulse_club_id,pulse_status,pulse_visibility));

create function public.create_club(p_name text,p_description text) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into public.clubs(name,description,created_by) values(trim(p_name),p_description,auth.uid()) returning id into v;
 insert into public.club_memberships values(v,auth.uid(),'admin'); return v;
end $$;
create function public.save_club(p_club uuid,p_version integer,p_name text,p_description text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.clubs where id=p_club for update;
 if public.club_role(p_club) is distinct from 'admin' then raise exception 'Only club admins can edit the club'; end if;
 update public.clubs set name=trim(p_name),description=p_description,version=version+1 where id=p_club and version=p_version;
 if not found then raise exception 'Club changed. Refresh before saving.'; end if;
end $$;
create function public.set_club_member(p_club uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare v_current_role text; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 perform 1 from public.clubs where id=p_club for update;
 if not found then raise exception 'Club unavailable'; end if;
 select role into v_current_role from public.club_memberships where club_id=p_club and user_id=p_user;
 if p_user=auth.uid() and ((p_role='member' and v_current_role is null) or p_role is null) then null;
 elsif public.club_role(p_club) is distinct from 'admin' then raise exception 'Only admins can change roles or remove members'; end if;
 if p_role is not null and p_role not in ('admin','officer','member') then raise exception 'Invalid role'; end if;
 if v_current_role='admin' and p_role is distinct from 'admin' and (select count(*) from public.club_memberships where club_id=p_club and role='admin')<=1 then
 raise exception 'Appoint another admin before removing the last admin'; end if;
 if p_role is null then delete from public.club_memberships where club_id=p_club and user_id=p_user;
 else
 if v_current_role is null and not(p_user=auth.uid() and p_role='member') then raise exception 'The user must join before receiving a role'; end if;
 insert into public.club_memberships values(p_club,p_user,p_role) on conflict(club_id,user_id) do update set role=excluded.role;
 end if;
end $$;
-- Supply IDs only when the existing schema has no generator, preserving bigint/text/UUID schemas.
do $$ declare t text; d text; begin
 select data_type,column_default into t,d from information_schema.columns where table_schema='public' and table_name='events' and column_name='id';
 if d is null and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='id' and is_identity='YES') then
 if t in ('bigint','integer') then
 create sequence public.pulse_event_id_seq;
 perform setval('public.pulse_event_id_seq',greatest(coalesce((select max(id::text::bigint) from public.events),0)+1,1),false);
 alter table public.events alter column id set default nextval('public.pulse_event_id_seq');
 elsif t='uuid' then alter table public.events alter column id set default gen_random_uuid();
 elsif t in ('text','character varying') then alter table public.events alter column id set default gen_random_uuid()::text;
 else raise exception 'Unsupported event ID type %',t; end if;
 end if;
end $$;
create function public.save_event(p_id text,p_revision integer,p_draft jsonb,p_request_key text default null) returns text language plpgsql security definer set search_path='' as $$
declare old_event public.events; saved public.events; v public.events; result_id text; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_id is null and p_request_key is not null then
 insert into public.event_create_requests(user_id,request_key) values(auth.uid(),p_request_key) on conflict do nothing;
 select event_id into result_id from public.event_create_requests where user_id=auth.uid() and request_key=p_request_key for update;
 if result_id is not null then return result_id; end if;
 end if;
 v:=jsonb_populate_record(null::public.events,p_draft);
 if v.pulse_club_id is not null then perform 1 from public.clubs where id=v.pulse_club_id for update; end if;
 if p_id is not null then
 select * into old_event from public.events where id::text=p_id for update;
 if not found or not coalesce(public.can_manage_event(old_event.pulse_owner_id,old_event.pulse_club_id),false) then raise exception 'Event unavailable or permission denied'; end if;
 if old_event.pulse_revision<>p_revision then raise exception 'Event changed. Refresh before saving.'; end if;
 if old_event.pulse_club_id is distinct from v.pulse_club_id then raise exception 'The organizer cannot change after creation'; end if;
 if old_event.pulse_status='cancelled' and v.pulse_status<>'cancelled' then raise exception 'Cancelled events cannot be republished'; end if;
 if old_event.pulse_status='published' and v.pulse_status='draft' then raise exception 'Published events cannot return to draft'; end if;
 end if;
 if not coalesce(public.can_manage_event(auth.uid(),v.pulse_club_id),false) then raise exception 'Club officer or admin role required'; end if;
 if v.title is null or length(trim(v.title)) not between 1 and 160 or v.location is null or length(trim(v.location)) not between 1 and 500 or v.category is null or length(trim(v.category)) not between 1 and 80 then raise exception 'Title, location and category are required'; end if;
 if v.pulse_starts_at is null or v.pulse_ends_at is null or v.pulse_ends_at<=v.pulse_starts_at then raise exception 'Valid start and end times are required'; end if;
 if v.pulse_timezone is null or not exists(select 1 from pg_timezone_names where name=v.pulse_timezone) then raise exception 'Valid timezone required'; end if;
 if v.pulse_status is null or v.pulse_visibility is null then raise exception 'Status and visibility required'; end if;
 if p_id is null and v.pulse_status='cancelled' then raise exception 'Create a draft or published event first'; end if;
 if p_id is null then
 insert into public.events(title,location,category,event_date,pulse_owner_id,pulse_club_id,pulse_description,pulse_visibility,pulse_status,pulse_starts_at,pulse_ends_at,pulse_timezone,pulse_cancelled)
 values(trim(v.title),trim(v.location),v.category,(v.pulse_starts_at at time zone v.pulse_timezone)::date,auth.uid(),v.pulse_club_id,coalesce(v.pulse_description,''),v.pulse_visibility,v.pulse_status,v.pulse_starts_at,v.pulse_ends_at,v.pulse_timezone,false) returning * into saved;
 else
 update public.events set title=trim(v.title),location=trim(v.location),category=v.category,event_date=(v.pulse_starts_at at time zone v.pulse_timezone)::date,
 pulse_description=coalesce(v.pulse_description,''),pulse_visibility=v.pulse_visibility,pulse_status=v.pulse_status,pulse_starts_at=v.pulse_starts_at,pulse_ends_at=v.pulse_ends_at,pulse_timezone=v.pulse_timezone,
 pulse_all_day_start=null,pulse_all_day_end=null,pulse_cancelled=(v.pulse_status='cancelled'),pulse_revision=old_event.pulse_revision+1 where id::text=p_id returning * into saved;
 end if;
 result_id:=saved.id::text;
 if p_id is null and p_request_key is not null then update public.event_create_requests set event_id=result_id where user_id=auth.uid() and request_key=p_request_key; end if;
 insert into public.event_changes(event_id,revision,actor_id,snapshot) values(result_id,saved.pulse_revision,auth.uid(),to_jsonb(saved));
 return result_id;
end $$;
create function public.set_event_invitation(p_event text,p_user uuid,p_invited boolean) returns void language plpgsql security definer set search_path='' as $$
declare e public.events; begin
 select * into e from public.events where id::text=p_event for update;
 if not found or not coalesce(public.can_manage_event(e.pulse_owner_id,e.pulse_club_id),false) then raise exception 'Event management permission required'; end if;
 if p_invited then insert into public.event_invitations values(p_event,p_user) on conflict do nothing;
 else delete from public.event_invitations where event_id=p_event and user_id=p_user; end if;
end $$;
-- Restrictive eligibility gate composes with the existing owner RSVP policies.
create policy rsvp_published_insert on public.event_rsvps as restrictive for insert to authenticated with check(exists(select 1 from public.events e where e.id=event_rsvps.event_id and e.pulse_status='published' and not e.pulse_cancelled));
create policy rsvp_published_update on public.event_rsvps as restrictive for update to authenticated using(true) with check(status='cancelled' or exists(select 1 from public.events e where e.id=event_rsvps.event_id and e.pulse_status='published' and not e.pulse_cancelled));
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('club_role','can_manage_event','can_view_event','create_club','save_club','set_club_member','save_event','set_event_invitation') loop
 execute format('revoke all on function %s from public,anon',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
create index pulse_events_club on public.events(pulse_club_id);
create index pulse_events_owner on public.events(pulse_owner_id);
create index pulse_event_changes_event on public.event_changes(event_id,revision);
commit;

