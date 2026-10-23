-- Apply after 202610230001_profiles, before releasing the required-setup client.
begin;

alter table public.private_profiles add column profile_setup_completed_at timestamptz;
alter table public.profiles alter column display_name drop default;
alter table public.profiles drop constraint profiles_display_name_check;
-- Empty names exist only while setup is incomplete. save_profile requires a name.
alter table public.profiles add constraint profiles_display_name_check
  check (display_name=btrim(display_name) and char_length(display_name) between 0 and 60 and display_name !~ '[[:cntrl:]]');

-- Preserve every customized profile, including a deliberately saved default name.
update public.private_profiles p set profile_setup_completed_at=now()
from public.profiles v where v.user_id=p.user_id and not (
  v.display_name='Pulse student' and v.version=1 and v.bio='' and v.avatar_path is null and p.age_band='unknown'
);
update public.profiles v set display_name=''
from public.private_profiles p where p.user_id=v.user_id and p.profile_setup_completed_at is null;

create or replace function public.provision_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.private_profiles(user_id) values(new.id);
  insert into public.profiles(user_id,display_name) values(new.id,'');
  return new;
end $$;

create or replace function public.save_profile(p_name text,p_bio text,p_age text,p_version integer,p_avatar text default null,p_change_avatar boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.pulse_account_active() then raise exception 'Account unavailable'; end if;
  -- Serialize setup completion, normal profile saves, uploads, and deletion.
  perform 1 from public.private_profiles where user_id=auth.uid() and account_state='active' for update;
  if not found then raise exception 'Account unavailable'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 or p_name ~ '[[:cntrl:]]' then
    raise exception 'Use 1–60 characters without line breaks.';
  end if;
  if p_age is null or p_age not in ('unknown','under_18','18_to_20','21_plus') then
    raise exception 'Choose an age eligibility option.';
  end if;
  if p_change_avatar and p_avatar is not null and not exists(select 1 from public.profile_avatar_objects a join storage.objects o on o.bucket_id='profile-avatars' and o.name=a.path where a.path=p_avatar and a.user_id=auth.uid() and a.ready and not a.cleanup_requested) then raise exception 'Photo unavailable. Choose the photo again.'; end if;
  update public.profiles set display_name=btrim(p_name),bio=btrim(p_bio),avatar_path=case when p_change_avatar then p_avatar else avatar_path end,version=version+1,updated_at=now()
    where user_id=auth.uid() and version=p_version;
  if not found then raise exception 'Profile changed. Reload before saving.'; end if;
  update public.private_profiles set age_band=p_age,profile_setup_completed_at=coalesce(profile_setup_completed_at,now()) where user_id=auth.uid();
end $$;

create or replace function public.pulse_profile_visible(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.pulse_account_active(auth.uid()) and exists(select 1 from public.private_profiles
    where user_id=p_user and account_state='active' and (user_id=auth.uid() or
      (profile_setup_completed_at is not null and not profile_hidden and not public.pulse_users_blocked(p_user))))
$$;

notify pgrst, 'reload schema';
commit;
