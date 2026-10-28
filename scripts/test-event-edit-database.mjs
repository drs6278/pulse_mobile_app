import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PostgreSQL only; no credentials or hosted writes.
const read = name => fs.readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const migrations = await Promise.all(['202610190001_scheduling', '202610210001_event_creation', '202610210003_schedule_review', '202610230001_profiles', '202610230002_profile_setup', '202610280001_event_edit_notifications'].map(read));
const postflight = await fs.readFile(new URL('../supabase/event-edit-postflight.sql', import.meta.url), 'utf8');
const alice = '00000000-0000-0000-0000-000000000001', bob = '00000000-0000-0000-0000-000000000002', carol = '00000000-0000-0000-0000-000000000003';
for (const type of ['uuid', 'bigint', 'text']) {
  const db = new PGlite();
  const identity = user => db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      grant usage on schema auth,public,storage to authenticated,anon,service_role;
      grant execute on function auth.uid(),auth.role() to authenticated,anon,service_role;
      insert into auth.users values('${alice}'),('${bob}'),('${carol}');
      create table public.events(id ${type} primary key,title text,event_date date,location text,category text);
      alter table public.events enable row level security;
      grant select on public.events to authenticated;
      create policy event_read on public.events for select to authenticated using(true);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant select,insert,delete on storage.objects to authenticated;
    `);
    for (const migration of migrations) await db.exec(migration);
    await db.exec(`update public.private_profiles set profile_setup_completed_at=now(),age_band='21_plus'`);
    const starts = new Date(Date.now() + 86400000).toISOString(), ends = new Date(Date.now() + 90000000).toISOString();
    const draft = { title: 'New title', location: 'New hall', category: 'Music', pulse_starts_at: starts, pulse_ends_at: ends, pulse_timezone: 'UTC', pulse_age_min: 18 };
    await identity(alice);
    const event = (await db.query(`insert into public.events(title,location,category,event_date,pulse_starts_at,pulse_ends_at,pulse_timezone) values('Original','Hall','Food',$1,$2,$3,'UTC') returning id::text`, [starts.slice(0,10),starts,ends])).rows[0].id;
    await db.query('insert into public.event_rsvps values($1,$2,$3)', [alice,event,'going']);
    await identity(bob);
    await db.query('insert into public.event_rsvps values($1,$2,$3)', [bob,event,'going']);
    await identity(carol);
    await db.query('insert into public.event_rsvps values($1,$2,$3)', [carol,event,'cancelled']);
    const edit = (revision, values = draft) => db.query('select public.edit_pulse_event($1,$2,$3)', [event,revision,JSON.stringify(values)]);
    await assert.rejects(edit(1), /original poster/);
    await identity(alice);
    await assert.rejects(db.query("update public.events set title='Spoof' where id::text=$1", [event]), /permission denied/);
    await assert.rejects(edit(1,{ ...draft, pulse_ends_at: starts }), /future start/);
    await edit(1);
    assert.equal((await db.query('select pulse_revision from public.events where id::text=$1',[event])).rows[0].pulse_revision, 2);
    assert.equal((await db.query('select count(*)::int n from public.event_notifications')).rows[0].n, 0, 'poster excluded');
    await assert.rejects(edit(1), /changed/);
    await edit(2); // A no-op creates neither revision nor notification.
    await edit(2,{ ...draft, category: 'Arts' });
    assert.equal((await db.query('select pulse_revision from public.events where id::text=$1',[event])).rows[0].pulse_revision, 3, 'category-only revision');
    await identity(bob);
    let notifications = (await db.query('select * from public.event_notifications order by created_at')).rows;
    assert.equal(notifications.length, 2);
    assert.equal(notifications[0].changes.title.before, 'Original');
    assert.equal(notifications[0].changes.title.after, 'New title');
    assert.equal(notifications[0].changes.pulse_age_min.after, 18);
    assert.deepEqual(Object.keys(notifications[1].changes), ['category']);
    assert.equal((await db.query('select status from public.event_rsvps')).rows[0].status, 'going');
    await assert.rejects(db.query("insert into public.event_notifications(user_id,event_id,event_title,changes) values($1,$2,'Forged','{}')", [bob,event]), /permission denied/);
    await assert.rejects(db.query("update public.event_notifications set event_title='Forged'"), /permission denied/);
    await db.query('update public.event_notifications set read_at=now() where id=$1', [notifications[0].id]);
    assert.equal((await db.query('select count(*)::int n from public.event_notifications where read_at is null')).rows[0].n, 1);
    await db.query('update public.event_notifications set read_at=now() where read_at is null');
    assert.equal((await db.query('select count(*)::int n from public.event_notifications where read_at is null')).rows[0].n, 0);
    await db.query('select public.set_user_block($1,true)',[alice]);
    assert.equal((await db.query('select count(*)::int n from public.event_notifications')).rows[0].n, 0, 'blocking hides event update details');
    await db.query('select public.set_user_block($1,false)',[alice]);
    await identity(carol);
    assert.equal((await db.query('select count(*)::int n from public.event_notifications')).rows[0].n, 0, 'cancelled RSVP excluded');
    assert.equal((await db.query('update public.event_notifications set read_at=null returning id')).rows.length, 0, 'other inbox protected');
    await db.exec('reset role');
    await db.query("update public.events set pulse_starts_at=now()-interval '1 minute' where id::text=$1", [event]);
    await identity(alice);
    await assert.rejects(edit(4), /before they start/);
    await db.exec('reset role; set role anon');
    await assert.rejects(edit(4), /permission denied/);
    await db.exec('reset role');
    await db.exec(postflight);
    console.log(`PASS event editing, revisions, RSVP preservation, inbox RLS and read controls (${type} IDs)`);
  } finally { await db.close(); }
}
