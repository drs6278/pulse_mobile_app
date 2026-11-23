begin;
create table public.club_reviews (
 id uuid primary key default gen_random_uuid(),
 club_id uuid references public.clubs on delete cascade,
 event_id uuid references public.events on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 stars integer not null check(stars between 1 and 5),
 body text not null check(char_length(body)<=2000),
 check(num_nonnulls(club_id,event_id)=1),
 unique nulls not distinct(club_id,event_id,user_id)
);
create table public.event_private_feedback (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 2000)
);
create table public.club_reports (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs on delete cascade,
 reporter_id uuid not null references auth.users on delete cascade,
 reason text not null check(char_length(btrim(reason)) between 1 and 1000),
 reviewed_at timestamptz,
 unique(club_id,reporter_id)
);
create table public.organizer_messages (
 sender_id uuid not null references auth.users on delete cascade,
 request_id uuid not null,
 club_id uuid references public.clubs on delete cascade,
 event_id uuid references public.events on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 primary key(sender_id,request_id),
 check(num_nonnulls(club_id,event_id)=1)
);
create table public.organizer_message_recipients (
 sender_id uuid,
 request_id uuid,
 user_id uuid references auth.users on delete cascade,
 read_at timestamptz,
 primary key(sender_id,request_id,user_id),
 foreign key(sender_id,request_id) references public.organizer_messages on delete cascade
);
create index organizer_message_inbox on public.organizer_message_recipients(user_id,read_at);
create table public.organizer_mutes (
 user_id uuid not null references auth.users on delete cascade,
 club_id uuid references public.clubs on delete cascade,
 sender_id uuid references auth.users on delete cascade,
 check(num_nonnulls(club_id,sender_id)=1),
 unique nulls not distinct(user_id,club_id,sender_id)
);
do $$ declare relation text; begin
 foreach relation in array array['club_reviews','event_private_feedback','club_reports','organizer_messages','organizer_message_recipients','organizer_mutes'] loop
 execute format('alter table public.%I enable row level security',relation);
 execute format('revoke all on public.%I from public,anon,authenticated',relation);
 end loop;
end $$;

create function public.club_profile_available(p_club uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.pulse_account_active() and exists(select 1 from public.clubs where id=p_club and deleted_at is null)
$$;

create function public.can_review_club_event(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.community_event_visible(p_event) and exists(
 select 1 from public.events e join public.event_rsvps r on r.event_id=e.id
 where e.id=p_event and not e.pulse_cancelled and coalesce(e.pulse_ends_at,(e.event_date+1)::timestamptz)<=now()
 and r.user_id=auth.uid() and r.status='going')
$$;

create function public.save_club_review(p_club uuid,p_event uuid,p_stars integer,p_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.pulse_account_active() or num_nonnulls(p_club,p_event)<>1 then raise exception 'Choose a review target.'; end if;
 if p_club is not null then perform 1 from public.clubs where id=p_club for update;
 else perform public.lock_event_club(p_event::text);
 perform 1 from public.events where id=p_event for update; end if;
 if p_stars is null then
 delete from public.club_reviews where club_id is not distinct from p_club and event_id is not distinct from p_event and user_id=auth.uid();
 return;
 end if;
 if not (case when p_club is not null then public.community_active_member(p_club)
 else public.can_review_club_event(p_event) end) then raise exception 'You are not eligible to review this yet.'; end if;
 insert into public.club_reviews(club_id,event_id,user_id,stars,body) values(p_club,p_event,auth.uid(),p_stars,btrim(p_body))
 on conflict(club_id,event_id,user_id) do update set stars=excluded.stars,body=excluded.body;
end $$;

create function public.list_club_reviews(p_club uuid,p_event uuid,p_offset integer default 0)
returns table(id uuid,display_name text,stars int,body text,own boolean)
language sql stable security definer set search_path='' as $$
 select r.id,p.display_name,r.stars,r.body,r.user_id=auth.uid() from public.club_reviews r join public.profiles p on p.user_id=r.user_id
 where r.club_id is not distinct from p_club and r.event_id is not distinct from p_event
 and (case when p_club is not null then public.club_profile_available(p_club) else public.community_event_visible(p_event) end)
 and public.pulse_profile_visible(r.user_id)
 order by (r.user_id=auth.uid()) desc,r.id limit 20 offset greatest(0,p_offset)
$$;

create function public.club_rating(p_club uuid) returns table(average numeric,total bigint)
language sql stable security definer set search_path='' as $$
 select round(avg(stars),1),count(*) from public.club_reviews where club_id=p_club
 and public.club_profile_available(p_club) and public.pulse_profile_visible(user_id)
$$;

create function public.send_event_feedback(p_event uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.community_event_visible(p_event) then raise exception 'Event unavailable.'; end if;
 insert into public.event_private_feedback(event_id,user_id,body) values(p_event,auth.uid(),btrim(p_body));
end $$;

create function public.list_event_feedback(p_event uuid,p_offset integer default 0)
returns table(id uuid,body text)
language sql stable security definer set search_path='' as $$
 select f.id,f.body from public.event_private_feedback f where f.event_id=p_event and public.pulse_account_active()
 and ((f.user_id=auth.uid() and public.community_event_visible(p_event)) or public.community_can_edit_event(p_event))
 order by f.id limit 20 offset greatest(0,p_offset)
$$;

create function public.report_club(p_club uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.club_profile_available(p_club) then raise exception 'Club unavailable.'; end if;
 insert into public.club_reports(club_id,reporter_id,reason) values(p_club,auth.uid(),btrim(p_reason)) on conflict do nothing;
end $$;
create function public.list_club_reports() returns table(id uuid,name text,reason text)
language sql stable security definer set search_path='' as $$
 select r.id,c.name,r.reason from public.club_reports r join public.clubs c on c.id=r.club_id
 where public.community_moderator() and r.reviewed_at is null and c.deleted_at is null order by r.id limit 50
$$;
create function public.moderate_club_report(p_report uuid,p_remove boolean) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not public.community_moderator() then raise exception 'Moderator access required.'; end if;
 update public.club_reports set reviewed_at=now() where id=p_report and reviewed_at is null returning club_id into target;
 if target is null then raise exception 'Report already reviewed.'; end if;
 if p_remove then
 update public.clubs set deleted_at=now() where id=target and deleted_at is null;
 update public.events set pulse_cancelled=true,pulse_revision=pulse_revision+1 where club_id=target and not pulse_cancelled;
 end if;
end $$;

create function public.set_organizer_mute(p_club uuid,p_sender uuid,p_muted boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.pulse_account_active() or num_nonnulls(p_club,p_sender)<>1 then raise exception 'Invalid mute target.'; end if;
 if p_muted then insert into public.organizer_mutes values(auth.uid(),p_club,p_sender) on conflict do nothing;
 else delete from public.organizer_mutes where user_id=auth.uid() and club_id is not distinct from p_club and sender_id is not distinct from p_sender;
 end if;
end $$;

create function public.list_organizer_mutes() returns table(club_id uuid,sender_id uuid,name text)
language sql stable security definer set search_path='' as $$
 select m.club_id,m.sender_id,coalesce(c.name,nullif(p.display_name,''),'Pulse user')
 from public.organizer_mutes m left join public.clubs c on c.id=m.club_id
 left join public.profiles p on p.user_id=m.sender_id and public.pulse_profile_visible(m.sender_id)
 where m.user_id=auth.uid() and public.pulse_account_active()
 order by 3,m.club_id,m.sender_id
$$;

create function public.send_organizer_message(p_club uuid,p_event uuid,p_request uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if num_nonnulls(p_club,p_event)<>1 then raise exception 'Choose a single audience.'; end if;
 if p_club is not null then perform 1 from public.clubs where id=p_club for update;
 else perform public.lock_event_club(p_event::text);
 perform 1 from public.events where id=p_event for update; end if;
 if not public.pulse_account_active() or not (case when p_club is not null then public.community_club_admin(p_club)
 else public.community_can_edit_event(p_event) end) then raise exception 'Organizer access required.'; end if;
 insert into public.organizer_messages(sender_id,request_id,club_id,event_id,body)
 values(auth.uid(),p_request,p_club,p_event,btrim(p_body)) on conflict do nothing;
 if not found then return; end if;
 insert into public.organizer_message_recipients(sender_id,request_id,user_id)
 select auth.uid(),p_request,a.user_id from (
 select m.user_id from public.club_memberships m where m.club_id=p_club and m.status='active'
 union select r.user_id from public.event_rsvps r where r.event_id=p_event and r.status='going'
 ) a where a.user_id<>auth.uid() and public.pulse_account_active(a.user_id)
 and not public.pulse_users_blocked(a.user_id)
 and not exists(select 1 from public.organizer_mutes where user_id=a.user_id and
 (sender_id=auth.uid() or club_id=coalesce(p_club,(select club_id from public.events where id=p_event))));
end $$;

create function public.list_organizer_messages(p_offset integer default 0,p_unread boolean default false)
returns table(sender_id uuid,request_id uuid,club_id uuid,event_id uuid,body text,read_at timestamptz,unread_count bigint)
language sql stable security definer set search_path='' as $$
 select m.sender_id,m.request_id,coalesce(m.club_id,e.club_id),m.event_id,m.body,r.read_at,
 count(*) filter(where r.read_at is null) over()
 from public.organizer_message_recipients r join public.organizer_messages m using(sender_id,request_id)
 left join public.events e on e.id=m.event_id
 where r.user_id=auth.uid() and public.pulse_account_active() and public.pulse_account_active(m.sender_id)
 and not public.pulse_users_blocked(m.sender_id) and (not p_unread or r.read_at is null)
 and (case when m.club_id is not null then public.community_active_member(m.club_id) else public.community_event_visible(m.event_id) end)
 and not exists(select 1 from public.organizer_mutes u where u.user_id=auth.uid() and
 (u.sender_id=m.sender_id or u.club_id=coalesce(m.club_id,e.club_id)))
 order by m.created_at desc,m.sender_id,m.request_id limit 20 offset greatest(0,p_offset)
$$;

create function public.read_organizer_messages(p_sender uuid default null,p_request uuid default null) returns void
language sql security definer set search_path='' as $$
 update public.organizer_message_recipients set read_at=now() where user_id=auth.uid()
 and read_at is null and ((p_sender is null and p_request is null) or (sender_id=p_sender and request_id=p_request))
$$;

do $$ declare signature regprocedure; begin
 for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('club_profile_available','can_review_club_event','save_club_review','list_club_reviews','club_rating',
 'send_event_feedback','list_event_feedback','report_club','list_club_reports','moderate_club_report',
 'set_organizer_mute','list_organizer_mutes','send_organizer_message','list_organizer_messages','read_organizer_messages') loop
 execute format('revoke all on function %s from public,anon',signature);
 execute format('grant execute on function %s to authenticated',signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
