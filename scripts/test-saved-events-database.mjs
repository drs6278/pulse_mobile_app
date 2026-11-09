import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await fs.readFile(new URL('../supabase/migrations/202611020001_saved_events.sql', import.meta.url), 'utf8');
const alice = '00000000-0000-0000-0000-000000000001';
const bob = '00000000-0000-0000-0000-000000000002';
for (const type of ['uuid', 'bigint', 'text']) {
  const db = new PGlite();
  const event = type === 'uuid' ? '10000000-0000-0000-0000-000000000001' : '9007199254740993';
  const hidden = type === 'uuid' ? '10000000-0000-0000-0000-000000000002' : '9007199254740994';
  const identity = user => db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values('${alice}'),('${bob}');
      create function auth.uid() returns uuid language sql stable as $$select current_setting('request.jwt.claim.sub')::uuid$$;
      create function public.pulse_account_active() returns boolean language sql stable as $$select true$$;
      grant usage on schema auth,public to authenticated;
      grant execute on function auth.uid() to authenticated;
      create table public.events(id ${type} primary key,visible boolean not null default true);
      insert into public.events values('${event}',true),('${hidden}',false);
      alter table public.events enable row level security;
      grant select on public.events to authenticated;
      create policy visible_events on public.events for select to authenticated using(visible);`);
    await db.exec(migration);
    await identity(alice);
    const save = (user, id) => db.query('insert into public.saved_events(user_id,event_id) values($1,$2) on conflict(user_id,event_id) do nothing', [user,id]);
    await save(alice,event);
    await save(alice,event);
    assert.equal((await db.query('select count(*)::int n from public.saved_events')).rows[0].n,1,'duplicate save is idempotent');
    await assert.rejects(save(bob,event), /row-level security/);
    await assert.rejects(save(alice,hidden), /row-level security/);
    await assert.rejects(db.query('update public.saved_events set created_at=now()'), /permission denied/);
    await identity(bob);
    assert.equal((await db.query('select count(*)::int n from public.saved_events')).rows[0].n,0,'inboxes are private');
    assert.equal((await db.query('delete from public.saved_events returning event_id')).rows.length,0,'cannot unsave another account');
    await save(bob,event);
    await db.exec(`reset role; update public.events set visible=false where id='${event}'`);
    await identity(alice);
    const joined = await db.query('select s.event_id::text,e.id from public.saved_events s left join public.events e on e.id=s.event_id');
    assert.equal(joined.rows[0].id,null,'hidden events do not leak through bookmarks');
    assert.equal((await db.query('delete from public.saved_events returning event_id')).rows.length,1,'hidden bookmark can be removed');
    await db.exec(`reset role; delete from public.events where id='${event}'`);
    assert.equal((await db.query('select count(*)::int n from public.saved_events')).rows[0].n,0,'event deletion cleans bookmarks');
    console.log(`PASS saved events: ownership, duplicates, visibility, removal and cascade (${type})`);
  } finally { await db.close(); }
}
