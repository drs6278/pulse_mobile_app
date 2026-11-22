// Requires psql and a disposable, migrated PostgreSQL test database. Never use
// a production URL. No database URL is printed or passed on the command line.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

if (!process.env.PULSE_CLUB_TEST_DATABASE_URL) {
  console.log('SKIP club concurrency: set PULSE_CLUB_TEST_DATABASE_URL to a disposable migrated PostgreSQL database and install psql.');
} else {
  const alice = randomUUID(), bob = randomUUID(), charlie = randomUUID();
  let club;
  const query = sql => new Promise((resolve, reject) => {
    const child = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...process.env, PGDATABASE: process.env.PULSE_CLUB_TEST_DATABASE_URL }, windowsHide: true,
    });
    let output = '', errors = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { errors += data; });
    child.on('error', () => reject(new Error('Unable to launch psql for local concurrency checks.')));
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors.trim())));
    child.stdin.end(`set statement_timeout='15s'; ${sql}`);
  });
  const as = (user, sql) => `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true); ${sql}; commit;`;
  // The marker proves the first transaction holds the lock before the second
  // starts. Both use independent server sessions, rather than PGlite's queue.
  const hold = (sql, marker) => new Promise((resolve, reject) => {
    const child = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { env: { ...process.env, PGDATABASE: process.env.PULSE_CLUB_TEST_DATABASE_URL }, windowsHide: true });
    let output = '', ready = false;
    const completion = new Promise((done, fail) => {
      child.on('error', () => fail(new Error('Unable to launch psql.')));
      child.on('close', code => code === 0 ? done() : fail(new Error('Lock-holder transaction failed.')));
    });
    completion.then(() => { if (!ready) reject(new Error('Lock-holder did not emit its readiness marker.')); }, reject);
    child.stderr.resume();
    child.stdout.on('data', data => {
      output += data;
      if (!ready && output.includes(marker)) { ready = true; resolve({ completion }); }
    });
    child.stdin.end(`set statement_timeout='15s'; ${sql}`);
  });
  try {
    await query(`insert into auth.users(id) values('${alice}'),('${bob}'),('${charlie}'); update public.private_profiles set profile_setup_completed_at=now(),age_band='21_plus' where user_id in ('${alice}','${bob}','${charlie}');`);
    club = (await query(as(alice, `select public.save_club('{"name":"Concurrency test","description":"Disposable test fixture"}')`))).split('\n').at(-1);
    await query(as(bob, `select public.manage_club_member('${club}','join')`));
    await query(as(alice, `select public.set_club_member_role('${club}','${bob}','admin')`));
    const draft = JSON.stringify({ title: 'Concurrency test', location: 'Test', category: 'Other', event_date: '2099-01-01', pulse_starts_at: '2099-01-01T12:00:00Z', pulse_ends_at: '2099-01-01T13:00:00Z', pulse_timezone: 'UTC', pulse_age_min: 0, pulse_visibility: 'club_only' });
    const event = (await query(as(alice, `select public.create_club_event('${club}','${draft}')`))).split('\n').at(-1);
    // Leave commits first; a waiting RSVP must observe the lost membership.
    const { completion } = await hold(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${bob}',true); select public.manage_club_member('${club}','leave'); select 'LOCK_READY'; select pg_sleep(2); commit;`, 'LOCK_READY');
    const started = performance.now();
    await assert.rejects(query(as(bob, `select public.set_event_rsvp('${event}','going')`)), /unavailable/);
    assert.ok(performance.now() - started > 1000, 'RSVP must actually wait for the other transaction');
    await completion;
    await query(as(bob, `select public.manage_club_member('${club}','join')`));
    await query(as(alice, `select public.set_club_member_role('${club}','${bob}','admin')`));
    // Two simultaneous departures cannot leave zero administrators.
    const outcomes = await Promise.allSettled([query(as(alice, `select public.manage_club_member('${club}','leave')`)), query(as(bob, `select public.manage_club_member('${club}','leave')`))]);
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(await query(`select count(*) from public.club_memberships where club_id='${club}' and role='admin' and status='active'`), '1');
    const admin = await query(`select user_id from public.club_memberships where club_id='${club}' and role='admin'`);
    const publicDraft = draft.replace('club_only','public');
    const anotherEvent = (await query(as(admin, `select public.create_club_event('${club}','${publicDraft}')`))).split('\n').at(-1);
    // A public RSVP commits first; the waiting visibility change must cancel it.
    const attending = await hold(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${charlie}',true); select public.set_event_rsvp('${anotherEvent}','going'); select 'RSVP_READY'; select pg_sleep(2); commit;`, 'RSVP_READY');
    await query(as(admin, `select public.edit_pulse_event('${anotherEvent}',1,'${draft}')`));
    await attending.completion;
    assert.equal(await query(`select status from public.event_rsvps where event_id='${anotherEvent}' and user_id='${charlie}'`), 'cancelled');
    // The reverse ordering must deny a new RSVP after the visibility change.
    const finalEvent = (await query(as(admin, `select public.create_club_event('${club}','${publicDraft}')`))).split('\n').at(-1);
    const narrowing = await hold(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${admin}',true); select public.edit_pulse_event('${finalEvent}',1,'${draft}'); select 'PRIVATE_READY'; select pg_sleep(2); commit;`, 'PRIVATE_READY');
    await assert.rejects(query(as(charlie, `select public.set_event_rsvp('${finalEvent}','going')`)), /unavailable/);
    await narrowing.completion;
    console.log('PASS independent PostgreSQL sessions: RSVP versus departure, both visibility race orderings, and concurrent last-admin departure.');
  } finally {
    if (club) await query(`delete from public.events where club_id='${club}'; delete from public.clubs where id='${club}';`);
    await query(`delete from auth.users where id in ('${alice}','${bob}','${charlie}');`);
  }
}
