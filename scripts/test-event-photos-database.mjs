import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { cleanupEventPhotos } from '../supabase/functions/_shared/profile/core.mjs';

// Disposable PostgreSQL only; no credentials or hosted writes.
const read = name => fs.readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const migrations = await Promise.all(['202610190001_scheduling', '202610210001_event_creation', '202610210003_schedule_review', '202610230001_profiles', '202610230002_profile_setup', '202610280001_event_edit_notifications', '202611080001_event_photos'].map(read));
const alice = '00000000-0000-0000-0000-000000000001', bob = '00000000-0000-0000-0000-000000000002';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

for (const type of ['uuid', 'bigint', 'text']) {
  const db = new PGlite();
  const identity = user => db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  const admin = () => db.exec('reset role');
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
      grant select on public.events to authenticated;
      create policy event_read on public.events for select to authenticated using(true);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,created_at timestamptz not null default now(),unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant select,insert,delete on storage.objects to authenticated;
      grant all on storage.objects to service_role;
    `);
    for (const migration of migrations) await db.exec(migration);
    await db.exec(`update public.private_profiles set profile_setup_completed_at=now(),age_band='21_plus'`);
    const starts = new Date(Date.now() + 86400000).toISOString(), ends = new Date(Date.now() + 90000000).toISOString();
    await identity(alice);
    const event = (await db.query(`insert into public.events(title,location,category,event_date,pulse_starts_at,pulse_ends_at,pulse_timezone) values('Concert','Hall','Music',$1,$2,$3,'UTC') returning id::text`, [starts.slice(0, 10), starts, ends])).rows[0].id;
    const path = `${event}/${uuid(1)}.jpg`, replacement = `${event}/${uuid(2)}.jpg`;
    const attach = value => db.query('select public.set_event_photo($1,$2)', [event, value]);
    const photoOf = async () => (await db.query('select pulse_image_path p, pulse_revision r from public.events where id::text=$1', [event])).rows[0];

    // Clients cannot write the bucket or the column directly.
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('event-photos',$1)", [path]), /row-level security/);
    await assert.rejects(db.query('update public.events set pulse_image_path=$1 where id::text=$2', [path, event]), /permission denied/);
    await assert.rejects(attach(path), /Upload the photo/, 'objects must exist before attaching');

    await admin();
    await db.query("insert into storage.objects(bucket_id,name) values('event-photos',$1),('event-photos',$2),('event-photos',$3)", [path, replacement, `other/${uuid(3)}.jpg`]);
    await identity(alice);
    await assert.rejects(attach(`other/${uuid(3)}.jpg`), /Upload the photo/, 'paths must belong to this event');
    await attach(path);
    assert.deepEqual(await photoOf(), { p: path, r: 1 }, 'attaching does not bump the revision');

    await identity(bob);
    await assert.rejects(attach(replacement), /original poster/);
    assert.equal((await db.query("select name from storage.objects where bucket_id='event-photos'")).rows.length, 1, 'only referenced photos are readable');
    await admin();
    await db.query("update public.private_profiles set age_band='under_18' where user_id=$1", [bob]);
    await db.query('update public.events set pulse_age_min=21 where id::text=$1', [event]);
    await identity(bob);
    assert.equal((await db.query("select name from storage.objects where bucket_id='event-photos'")).rows.length, 0, 'photos follow event age rules');

    await identity(alice);
    await attach(replacement);
    await attach(null);
    assert.deepEqual(await photoOf(), { p: null, r: 1 }, 'removing clears the column');
    await attach(replacement);

    // Cleanup claims only unreferenced objects past the grace period.
    await admin();
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('event-photos','bad path')").then(() => db.query("update public.events set pulse_image_path='bad path' where id::text=$1", [event])), /pulse_image_path_format/);
    await db.query("delete from storage.objects where name='bad path'");
    const claim = async () => (await db.query('select path from public.claim_event_photo_cleanup() order by path')).rows.map(row => row.path);
    assert.deepEqual(await claim(), [], 'fresh uploads are protected');
    await db.query("update storage.objects set created_at=now()-interval '2 hours' where bucket_id='event-photos'");
    assert.deepEqual(await claim(), [path, `other/${uuid(3)}.jpg`].sort(), 'the attached replacement is kept');
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false)`);
    await assert.rejects(claim(), /permission denied/, 'clients cannot list cleanup candidates');

    // Once the event starts, the photo is locked like the rest of the event.
    await admin();
    await db.query("update public.events set pulse_starts_at=now()-interval '1 hour',pulse_ends_at=now()+interval '1 hour' where id::text=$1", [event]);
    await identity(alice);
    await assert.rejects(attach(null), /before the event starts/);
    console.log(`${type}: ok`);
  } finally { await db.close(); }
}

// Maintenance removes exactly the claimed paths.
const removed = [];
const client = {
  rpc: async name => ({ data: name === 'claim_event_photo_cleanup' ? [{ path: 'a/1.jpg' }, { path: 'a/2.jpg' }] : null, error: null }),
  storage: { from: bucket => ({ remove: async paths => { removed.push({ bucket, paths }); return { data: [], error: null }; } }) },
};
assert.deepEqual(await cleanupEventPhotos(client), { eventPhotosRemoved: 2 });
assert.deepEqual(removed, [{ bucket: 'event-photos', paths: ['a/1.jpg', 'a/2.jpg'] }]);
const empty = { rpc: async () => ({ data: [], error: null }), storage: { from: () => { throw new Error('should not touch storage'); } } };
assert.deepEqual(await cleanupEventPhotos(empty), { eventPhotosRemoved: 0 });
const failing = { rpc: async () => ({ data: null, error: new Error('function does not exist') }) };
await assert.rejects(cleanupEventPhotos(failing), /does not exist/);
console.log('cleanup: ok');
