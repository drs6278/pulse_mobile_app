import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
process.on('uncaughtException', error => { console.error(error.message, error.query ?? '', error.where ?? ''); process.exitCode = 1; });

// Disposable database only. No environment credentials or hosted mutations.
const read = name => fs.readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const migrations = await Promise.all(['202610190001_scheduling', '202610210001_event_creation', '202610210003_schedule_review', '202610230001_profiles'].map(read));
const setupMigration = await read('202610230002_profile_setup');
const preflight = await fs.readFile(new URL('../supabase/preflight.sql', import.meta.url), 'utf8');
const postflight = await fs.readFile(new URL('../supabase/profile-postflight.sql', import.meta.url), 'utf8');
const alice = '00000000-0000-0000-0000-000000000001', bob = '00000000-0000-0000-0000-000000000002', carol = '00000000-0000-0000-0000-000000000003';
for (const type of ['uuid', 'bigint', 'text']) {
  const db = new PGlite();
  const identity = async (user, role = 'authenticated') => db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); select set_config('request.jwt.claim.role','${role}',false); set role ${role}`);
  const count = async table => (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
  const save = (name = 'Alice', bio = 'Student', age = 'unknown', version = 1, path = null, change = false) => db.query('select public.save_profile($1,$2,$3,$4,$5,$6)', [name, bio, age, version, path, change]);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      grant usage on schema auth,public,storage to authenticated,anon,service_role;
      grant execute on function auth.uid(),auth.role() to authenticated,anon,service_role;
      insert into auth.users values('${alice}'),('${bob}');
      create table public.events(id ${type} primary key,title text,event_date date,location text,category text);
      alter table public.events enable row level security;
      grant select on public.events to authenticated,anon;
      create policy existing_events_read on public.events for select using(true);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant select,insert,delete on storage.objects to authenticated;
      grant all on storage.objects to service_role;
    `);
    await db.exec(preflight);
    await assert.rejects(db.exec(postflight), /Missing table or RLS/);
    for (const migration of migrations) await db.exec(migration);
    // Exercise the upgrade against both untouched and customized legacy users.
    const legacyUsers = [4, 5, 6, 7].map(value => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`);
    for (const user of legacyUsers) await db.query('insert into auth.users values($1)', [user]);
    await db.query("update public.profiles set display_name='Custom name' where user_id=$1", [legacyUsers[0]]);
    await db.query("update public.profiles set bio='Custom bio' where user_id=$1", [legacyUsers[1]]);
    await db.query("update public.profiles set avatar_path='existing/photo.jpg' where user_id=$1", [legacyUsers[2]]);
    await db.query("update public.private_profiles set age_band='18_to_20' where user_id=$1", [legacyUsers[3]]);
    await db.query('update public.profiles set version=2 where user_id=$1', [bob]);
    await db.exec(setupMigration);
    for (const user of [bob, ...legacyUsers]) {
      assert.ok((await db.query('select profile_setup_completed_at from public.private_profiles where user_id=$1', [user])).rows[0].profile_setup_completed_at, 'customized profiles stay complete');
    }
    assert.equal((await db.query('select display_name from public.profiles where user_id=$1', [bob])).rows[0].display_name, 'Pulse student', 'deliberately saved names are preserved');
    for (const user of legacyUsers) await db.query('delete from auth.users where id=$1', [user]);
    assert.equal((await db.query('select display_name from public.profiles where user_id=$1', [alice])).rows[0].display_name, '', 'untouched generated names are cleared');
    assert.equal((await db.query('select profile_setup_completed_at from public.private_profiles where user_id=$1', [alice])).rows[0].profile_setup_completed_at, null);
    await db.exec(preflight);
    await db.exec(postflight);
    // Recovery checks must reject incomplete installs without changing data.
    for (const [damage, expected] of [
      [`delete from public.profiles where user_id='${alice}'`, /missing public\/private profile backfill/],
      ['alter table auth.users disable trigger provision_profile', /Missing or disabled Auth profile provisioning trigger/],
      ['revoke select on public.private_profiles from authenticated', /Unexpected profile read\/write grants/],
    ]) {
      await db.exec(`begin; ${damage}`);
      await assert.rejects(db.exec(postflight), expected);
      await db.exec('rollback');
    }
    await db.exec(postflight);
    assert.equal(await count('profiles'), 2, 'existing users are backfilled');
    await db.query('insert into auth.users values($1)', [carol]);
    assert.equal(await count('profiles'), 3, 'new users are provisioned by trigger');
    assert.equal((await db.query('select display_name from public.profiles where user_id=$1', [carol])).rows[0].display_name, '', 'signup does not invent a name');
    assert.equal((await db.query('select profile_setup_completed_at from public.private_profiles where user_id=$1', [carol])).rows[0].profile_setup_completed_at, null);
    await identity(bob);
    assert.equal(await count('profiles'), 1, 'incomplete profiles are hidden from other users');
    await identity(carol);
    assert.equal((await db.query('select user_id from public.profiles where user_id=$1', [carol])).rows.length, 1, 'owner can load their incomplete profile');
    await assert.rejects(save('  ', '', 'unknown'), /1–60/);
    await assert.rejects(save('Carol', '', null), /Choose an age/);
    await assert.rejects(save('Carol', 'a'.repeat(281), 'unknown'), /check constraint/);
    await assert.rejects(save('Carol', '', 'unknown', 999), /changed/);
    assert.equal((await db.query('select profile_setup_completed_at from public.private_profiles where user_id=$1', [carol])).rows[0].profile_setup_completed_at, null, 'failed setup never marks completion');
    await save('Carol', '', 'unknown');
    const completedAt = (await db.query('select profile_setup_completed_at from public.private_profiles where user_id=$1', [carol])).rows[0].profile_setup_completed_at;
    assert.ok(completedAt, 'explicit prefer not to say completes setup');
    await save('Carol updated', '', 'unknown', 2);
    assert.equal(String((await db.query('select profile_setup_completed_at from public.private_profiles where user_id=$1', [carol])).rows[0].profile_setup_completed_at), String(completedAt), 'normal edits preserve completion time');
    await db.exec('reset role');
    const eventId = type === 'uuid' ? '00000000-0000-0000-0000-000000000010' : type === 'bigint' ? '10' : 'event-10';
    await db.query('insert into public.events(id,title,event_date,created_by,pulse_age_min) values($1,$2,$3,$4,21)', [eventId, '21+ concert', '2026-11-01', bob]);
    await identity(carol);
    assert.equal(await count('events'), 0, 'explicit prefer not to say does not unlock age-restricted events');
    await identity(alice);
    assert.equal(await count('profiles'), 3);
    assert.equal(await count('private_profiles'), 1);
    assert.equal(await count('events'), 0, 'unknown age cannot read restricted events');
    await assert.rejects(db.query('update public.profiles set display_name=$1 where user_id=$2', ['Spoof', bob]), /permission denied/);
    await assert.rejects(db.query("update public.private_profiles set account_state='active'"), /permission denied/);
    await assert.rejects(db.query('update public.private_profiles set profile_setup_completed_at=now()'), /permission denied/);
    await assert.rejects(save('Alice', '', '21_plus', 999), /changed/);
    await assert.rejects(save('Alice', '', 'bad_age'), /Choose an age/);
    assert.equal((await db.query('select version from public.profiles where user_id=$1', [alice])).rows[0].version, 1, 'invalid age rolls back public update');
    await save(' Alice ', ' A bio ', '21_plus');
    assert.ok((await db.query('select profile_setup_completed_at from public.private_profiles where user_id=$1', [alice])).rows[0].profile_setup_completed_at);
    assert.equal(await count('events'), 1);
    await db.query("insert into public.event_rsvps(user_id,event_id,status) values($1,$2,'going')", [alice, eventId]);
    await db.query('select public.set_user_block($1,true)', [bob]);
    assert.equal(await count('events'), 0, 'direct event reads respect blocks');
    assert.equal(await count('profiles'), 2, 'blocked profile is hidden');
    assert.equal((await db.query('select * from public.list_blocked_profiles()')).rows[0].user_id, bob);
    await db.query("update public.event_rsvps set status='cancelled' where event_id=$1", [eventId]);
    await assert.rejects(db.query("update public.event_rsvps set status='going' where event_id=$1", [eventId]), /row-level security/);
    await identity(bob);
    assert.equal((await db.query('select * from public.profiles where user_id=$1', [alice])).rows.length, 0, 'block is mutual');
    await identity(alice);
    await db.query('select public.set_user_block($1,false)', [bob]);
    const report = (await db.query('select public.report_profile($1,$2,$3) id', [bob, 'impersonation', 'Private report'])).rows[0].id;
    await assert.rejects(db.query('select * from public.profile_reports'), /permission denied/);
    await assert.rejects(db.query('select public.moderate_profile($1,$2,$3)', [report, 'suspend', 'client']), /permission denied/);
    await identity('', 'service_role');
    await db.query('select public.moderate_profile($1,$2,$3)', [report, 'hide', 'test moderator']);
    await identity(alice);
    assert.equal((await db.query('select * from public.profiles where user_id=$1', [bob])).rows.length, 0);
    await identity('', 'service_role');
    await db.query('select public.moderate_profile($1,$2,$3)', [report, 'restore', 'test moderator']);
    await identity(alice);
    const path = (await db.query('select public.register_profile_avatar() path')).rows[0].path;
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('profile-avatars',$1)", [path]), /row-level security/);
    await identity('', 'service_role');
    await db.query("insert into storage.objects(bucket_id,name) values('profile-avatars',$1)", [path]);
    await db.query('update public.profile_avatar_objects set ready=true where path=$1', [path]);
    await identity(alice);
    await save('Alice', 'A bio', '21_plus', 2, path, true);
    await identity(bob);
    assert.equal((await db.query("select * from storage.objects where bucket_id='profile-avatars'")).rows.length, 1);
    await db.query('select public.set_user_block($1,true)', [alice]);
    assert.equal((await db.query("select * from storage.objects where bucket_id='profile-avatars'")).rows.length, 0, 'avatar bytes obey blocking');
    await db.query('select public.set_user_block($1,false)', [alice]);
    await identity(alice);
    const abandoned = (await db.query('select public.register_profile_avatar() path')).rows[0].path;
    await identity('', 'service_role');
    await db.exec("update public.profile_avatar_objects set created_at=now()-interval '2 hours',ready=true");
    const cleanup = (await db.query('select * from public.claim_profile_avatar_cleanup()')).rows;
    assert.equal(cleanup.length, 1, 'cleanup never claims currently displayed avatar');
    assert.equal(cleanup[0].path, abandoned);
    await identity(alice);
    await assert.rejects(save('Alice', '', '21_plus', 3, abandoned, true), /Photo unavailable/);
    await identity('', 'service_role');
    // Canonical clubs: preserve shared content and atomically appoint a successor.
    await db.exec(`reset role; create table public.clubs(id uuid primary key,created_by uuid references auth.users(id));
      create table public.club_memberships(club_id uuid references public.clubs(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,role text,status text default 'active',primary key(club_id,user_id));
      grant all on public.clubs,public.club_memberships to service_role;`);
    await identity('', 'service_role');
    const clubId = '00000000-0000-0000-0000-000000000099';
    await db.query('insert into public.clubs values($1,$2)', [clubId, alice]);
    await db.query("insert into public.club_memberships(club_id,user_id,role) values($1,$2,'admin'),($1,$3,'officer')", [clubId, alice, bob]);
    await db.query('select public.begin_profile_deletion($1)', [alice]);
    assert.equal((await db.query('select created_by from public.clubs')).rows[0].created_by, bob);
    assert.equal((await db.query('select role from public.club_memberships where user_id=$1', [bob])).rows[0].role, 'admin');
    await identity(alice);
    assert.equal(await count('events'), 0, 'old JWT loses event access immediately');
    assert.equal(await count('profiles'), 0);
    await assert.rejects(save(), /unavailable/);
    await assert.rejects(db.query("select public.create_schedule_source('late.csv','csv')"), /unavailable/);
    await identity('', 'service_role');
    assert.equal((await db.query('select public.claim_profile_deletion() id')).rows[0].id, alice);
    await assert.rejects(db.query('select public.purge_profile_data($1)', [alice]), /private files/);
    await db.query('delete from storage.objects where name=$1', [path]);
    await db.query('select public.purge_profile_data($1)', [alice]);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1', [alice]);
    assert.equal((await db.query('select count(*)::int n from public.profiles where user_id=$1', [alice])).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from public.clubs')).rows[0].n, 1);
    await identity('', 'anon');
    assert.equal(await count('events'), 0, 'legacy broad event policy cannot expose age-restricted events to anon');
    await assert.rejects(db.query('select * from public.profiles'), /permission denied/);
    await assert.rejects(db.query('select public.begin_profile_deletion($1)', [bob]), /permission denied/);
    console.log(`PASS profiles: privacy, age, blocks, reports, moderation, photo races, club transfer, and deletion (${type} event IDs)`);
  } finally { await db.close(); }
}
