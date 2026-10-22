import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Isolated PostgreSQL only: no credentials, network, or deployed database.
const migrations = await Promise.all(['202610190001_scheduling.sql', '202610210001_clubs_events.sql', '202610210002_discovery_rsvp.sql'].map(name => fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')));
const users = [1,2,3,4].map(n => `00000000-0000-0000-0000-00000000000${n}`);
for (const type of ['uuid', 'bigint', 'text']) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      create table public.events(id ${type} primary key,title text,event_date date,location text,category text);
      alter table public.events enable row level security;`);
    for (const u of users) await db.query('insert into auth.users values($1)', [u]);
    for (const migration of migrations) await db.exec(migration);
    const asUser = async n => { await db.exec('reset role; set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[n]]); };
    await asUser(0);
    const draft = { title: 'Campus Jazz Night', location: 'Student Hall', category: 'Music', pulse_description: 'Live acoustic concert', pulse_visibility: 'public', pulse_status: 'published', pulse_starts_at: '2099-10-26T18:00Z', pulse_ends_at: '2099-10-26T19:00Z', pulse_timezone: 'UTC' };
    const id = (await db.query('select public.save_event(null,0,$1::jsonb) id',[JSON.stringify(draft)])).rows[0].id;
    await db.query('select public.set_event_capacity($1,1)', [id]);
    const rsvp = async status => (await db.query('select public.set_event_rsvp($1,$2) status', [id,status])).rows[0].status;
    assert.equal(await rsvp('going'),'going');
    assert.equal(await rsvp('going'),'going');
    await asUser(1); assert.equal(await rsvp('going'),'waitlisted');
    await asUser(2); assert.equal(await rsvp('going'),'waitlisted');
    await asUser(1); assert.equal(await rsvp('going'),'waitlisted');
    assert.equal((await db.query("select count(*)::int n from public.events where pulse_search @@ websearch_to_tsquery('simple','acoustic')")).rows[0].n,1);
    const stats = (await db.query('select * from public.event_attendance($1::text[])',[[id]])).rows[0];
    assert.equal(Number(stats.going),1); assert.equal(Number(stats.waitlisted),2);
    await assert.rejects(db.query("update public.event_rsvps set status='going'"),/permission denied/);
    await assert.rejects(db.query('select public.set_event_capacity($1,5)',[id]),/permission/);
    await assert.rejects(db.query('select public.promote_event_waitlist($1)',[id]),/permission denied/);
    await asUser(0); assert.equal(await rsvp('cancelled'),'cancelled');
    await asUser(1); assert.equal(await rsvp('going'),'going'); // earliest promoted
    await asUser(0); await db.query('select public.set_event_capacity($1,2)',[id]);
    await asUser(2); assert.equal(await rsvp('going'),'going');
    await asUser(0); await assert.rejects(db.query('select public.set_event_capacity($1,1)',[id]),/lower than/);
    await db.query('select public.set_event_capacity($1,2)',[id]);
    await asUser(0); assert.equal(await rsvp('going'),'waitlisted');
    await asUser(3); assert.equal(await rsvp('going'),'waitlisted');
    await asUser(0); assert.equal(await rsvp('cancelled'),'cancelled'); assert.equal(await rsvp('going'),'waitlisted');
    await asUser(1); await rsvp('cancelled');
    await asUser(3); assert.equal(await rsvp('going'),'going'); // rejoin moved user 0 behind user 3
    await asUser(0);
    // Private event: revoke the first queued invite, then promote the next eligible user.
    const privateId = (await db.query('select public.save_event(null,0,$1::jsonb) id',[JSON.stringify({...draft,pulse_visibility:'private'})])).rows[0].id;
    await db.query('select public.set_event_capacity($1,1)',[privateId]);
    for (const u of users.slice(1)) await db.query('select public.set_event_invitation($1,$2,true)',[privateId,u]);
    await db.query("select public.set_event_rsvp($1,'going')",[privateId]);
    for (const n of [1,2]) { await asUser(n); await db.query("select public.set_event_rsvp($1,'going')",[privateId]); }
    await asUser(0); await db.query('select public.set_event_invitation($1,$2,false)',[privateId,users[1]]);
    await db.query("select public.set_event_rsvp($1,'cancelled')",[privateId]);
    await asUser(1); assert.equal((await db.query('select * from public.event_attendance($1::text[])',[[privateId]])).rows.length,0);
    assert.equal((await db.query('select status from public.event_rsvps where event_id::text=$1',[privateId])).rows[0].status,'cancelled');
    await asUser(2); assert.equal((await db.query('select status from public.event_rsvps where event_id::text=$1',[privateId])).rows[0].status,'going');
    await asUser(0);
    const revision = (await db.query('select pulse_revision from public.events where id::text=$1',[id])).rows[0].pulse_revision;
    await db.query('select public.save_event($1,$2,$3::jsonb)',[id,revision,JSON.stringify({...draft,pulse_status:'cancelled'})]);
    await asUser(2); assert.equal((await db.query('select status from public.event_rsvps where event_id::text=$1',[id])).rows[0].status,'cancelled');
    await assert.rejects(rsvp('going'),/unavailable/);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.event_attendance($1::text[])',[[id]]),/permission denied/);
    console.log(`PASS discovery search, capacity, idempotency, FIFO promotion, eligibility, cancellation and RLS (${type})`);
  } catch (error) { console.error(error.message, error.where ?? ''); process.exitCode = 1; break; }
  finally { await db.close(); }
}
