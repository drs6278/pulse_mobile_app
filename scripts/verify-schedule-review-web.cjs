// Headless browser + intercepted synthetic APIs only; never writes hosted data.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
process.loadEnvFile('.env');
const root = path.resolve('src/.schedule-build');
const output = path.resolve('src/.schedule-smoke');
const api = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL);
const chromePath = process.env.PULSE_CHROME_PATH || path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1208/chrome-win64/chrome.exe');
if (!fs.existsSync(chromePath)) throw new Error('Set PULSE_CHROME_PATH to a Chromium executable.');
fs.mkdirSync(output, { recursive: true });
const user = { id: '00000000-0000-0000-0000-000000000001', email: 'synthetic@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const today = new Date().toISOString().slice(0, 10);
const event = { id: 'event-1', title: 'Synthetic campus concert', description: 'Synthetic', category: 'Music', location: 'Hall', event_date: today, pulse_starts_at: `${today}T14:00:00Z`, pulse_ends_at: `${today}T15:00:00Z`, pulse_timezone: 'UTC', pulse_cancelled: false, pulse_revision: 1, pulse_status: 'published', pulse_visibility: 'public', pulse_creator_user_id: user.id, pulse_organizer_type: 'individual', pulse_capacity: null, pulse_all_day_start: null, pulse_all_day_end: null };
let rows = [{ id: '00000000-0000-0000-0000-000000000002', user_id: user.id, import_id: null, version: 1, content_key: 'synthetic', title: 'Synthetic class', kind: 'class', location: 'Library', start_local: `${today}T09:00:00`, end_local: `${today}T10:00:00`, timezone: 'UTC', term_end: today, recurrence: null, rdates: [], exdates: [], source_uid: null, all_day: false, busy: true }];
let rsvps = [], imports = [], sources = [], missingSchema = false;
const writes = [];
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : path.extname(pathname) ? pathname : pathname + '.html'));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.writeHead(404).end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
  response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(response);
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  const { parseScheduleSource } = await import(pathToFileURL(path.resolve('src/.schedule-delivery/supabase/functions/_shared/schedule/import/process-source.js')).href);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--disable-gpu', '--remote-debugging-port=9225', `--user-data-dir=${path.join(output, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let target;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { target = await (await fetch('http://127.0.0.1:9225/json/new?about:blank', { method: 'PUT' })).json(); break; } catch { await pause(100); }
    }
    assert(target, 'Chromium did not start.');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let next = 0; const pending = new Map(), errors = [];
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++next;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) { const task = pending.get(message.id); if (task) { pending.delete(message.id); if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result); } return; }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      if (message.method === 'Fetch.requestPaused') void respond(message.params).catch(error => errors.push(error.message));
      if (message.method === 'Page.fileChooserOpened') void call('DOM.setFileInputFiles', { files: [path.resolve('tests/fixtures/schedules/fall.csv')], backendNodeId: message.params.backendNodeId }).catch(error => errors.push(error.message));
    };
    async function respond({ requestId, request }) {
      const url = new URL(request.url);
      if (url.origin === origin) { await call('Fetch.continueRequest', { requestId }); return; }
      if (url.origin !== api.origin) { await call('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); return; }
      let body = [], status = 200;
      const route = url.pathname.split('/').pop();
      if (request.method === 'OPTIONS') body = {};
      else if (url.pathname.includes('/storage/v1/')) {
        writes.push('storage-' + request.method);
        body = { Key: 'synthetic', name: 'synthetic' };
      } else if (request.method === 'POST') {
        writes.push(route); const payload = JSON.parse(request.postData || '{}');
        if (route === 'save_schedule') {
          const saved = { ...payload.p_draft, id: payload.p_id || '00000000-0000-0000-0000-000000000003', user_id: user.id, version: 1, import_id: null };
          rows = rows.filter(item => item.id !== saved.id); rows.push(saved); body = saved;
        } else if (route === 'event_rsvps') { rsvps = [{ event_id: event.id, status: payload.status, event }]; body = rsvps; }
        else if (route === 'create_schedule_source') {
          const id = '00000000-0000-0000-0000-000000000099'; body = { id, object_path: `${user.id}/${id}.csv`, label: payload.p_label, format: payload.p_format }; sources.push(body);
        } else if (route === 'schedule-source') body = payload.action === 'cleanup' ? { removed: sources.length, failed: 0 } : parseScheduleSource(fs.readFileSync('tests/fixtures/schedules/fall.csv', 'utf8'), 'csv', payload.timezone, payload.termEnd);
        else if (route === 'finish_schedule_source_cleanup' || route === 'discard_schedule_source') { sources = []; body = null; }
        else if (route === 'commit_schedule_import') {
          const id = '00000000-0000-0000-0000-000000000004'; imports.push({ id, label: payload.p_label, created_at: new Date().toISOString() });
          for (const [i, item] of payload.p_entries.entries()) rows.push({ ...item.draft, id: `import-${i}`, user_id: user.id, version: 1, import_id: id }); body = id;
        } else if (route === 'clear_schedule') { rows = []; imports = []; body = null; }
        else { status = 400; body = { message: `Unexpected synthetic write ${route}` }; }
      } else if (route === 'schedule_series') body = rows;
      else if (route === 'schedule_exceptions') body = [];
      else if (route === 'schedule_imports') body = imports;
      else if (route === 'schedule_preferences') body = [{ user_id: user.id, timezone: 'UTC', day_start: '08:00', day_end: '22:00', minimum_gap: 30, categories: [], version: 1 }];
      else if (route === 'event_rsvps') body = rsvps;
      else if (route === 'events') body = url.searchParams.has('id') ? event : [event];
      else if (route === 'user') body = user;
      else if (route === 'clubs' || route === 'club_memberships') body = [];
      else { status = 400; body = { message: `Unexpected synthetic request ${route}` }; }
      if (missingSchema && request.method !== 'OPTIONS' && route.startsWith('schedule_')) { status = 404; body = { code: 'PGRST205', message: 'Synthetic missing schema' }; }
      await call('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' }, { name: 'Access-Control-Expose-Headers', value: 'Content-Range' }, { name: 'Content-Range', value: '0-0/1' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
    }
    await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['wss://*', 'ws://*'] });
    await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await call('Page.setInterceptFileChooserDialog', { enabled: true });
    await call('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
    await call('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800, role: 'authenticated' })).toString('base64url'), 'synthetic'].join('.');
    const session = { access_token: token, refresh_token: 'synthetic', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user };
    const storageKey = `sb-${api.hostname.split('.')[0]}-auth-token`;
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem(${JSON.stringify(storageKey)},${JSON.stringify(JSON.stringify(session))});` });
    async function evaluate(expression) { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
    async function waitFor(text) { for (let i = 0; i < 150; i++) { if (await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return; await pause(100); } await screenshot('failure'); throw new Error(`Missing browser content: ${text}\n${await evaluate('document.body.innerText.slice(-4000)')}`); }
    async function visit(route, text) { await call('Page.navigate', { url: origin + route }); await waitFor(text); assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Horizontal overflow'); }
    async function click(label) { for (let i = 0; i < 100; i++) { if (await evaluate(`(()=>{const el=document.querySelector('[aria-label='+CSS.escape(${JSON.stringify(label)})+']');if(!el||el.getAttribute('aria-disabled')==='true')return false;el.click();return true;})()`)) return; await pause(100); } throw new Error(`Missing enabled control ${label}`); }
    async function input(label, value) { await evaluate(`(()=>{const el=document.querySelector('[aria-label='+CSS.escape(${JSON.stringify(label)})+']');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); }
    async function screenshot(name) { const shot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(shot.data, 'base64')); }
    await visit('/calendar', 'Synthetic class'); await screenshot('calendar');
    await visit('/schedule-entry', 'Start date (YYYY-MM-DD)'); await input('Title', 'Synthetic new commitment');
    await click('Save entry'); await waitFor('Your calendar'); assert(writes.includes('save_schedule'));
    await visit('/schedule-entry?id=00000000-0000-0000-0000-000000000002', 'Edit schedule entry');
    await waitFor('Editing a single class or commitment.'); await input('Title', 'Edited synthetic class'); await click('Save entry'); await waitFor('Your calendar');
    assert(rows.some(item => item.title === 'Edited synthetic class'), 'One-off title edit did not save');
    await visit('/event?id=event-1', 'Synthetic campus concert'); await click('RSVP — I’m going'); await waitFor('Cancel RSVP'); assert(writes.includes('event_rsvps'));
    await visit('/import-schedule', 'Choose ICS or CSV file'); await click('Choose ICS or CSV file'); await waitFor('Computer Science');
    assert(writes.includes('create_schedule_source') && writes.includes('storage-POST') && writes.includes('schedule-source'), 'Upload/parse missing');
    assert(!writes.includes('commit_schedule_import'), 'Import saved before review');
    await click('Correct entry: Computer Science'); await input('Title', 'Corrected Computer Science');
    await screenshot('import-correction'); await click('Confirm timezone, selections and updates'); await click('Save 2 selected entries'); await waitFor('Your calendar');
    assert(rows.some(item => item.title === 'Corrected Computer Science'), 'Corrected preview not saved');
    assert(writes.includes('storage-DELETE') && writes.includes('finish_schedule_source_cleanup'), 'Source cleanup missing');
    await visit('/schedule-settings', 'Manage schedule entries'); await input('Find a class or commitment', 'Corrected'); await waitFor('Corrected Computer Science'); await screenshot('management');
    await click('Clear entire schedule'); assert(rows.length > 0, 'Clear must require confirmation'); await click('Keep entire schedule'); assert(rows.length > 0);
    await click('Clear entire schedule'); await click('Confirm clear entire schedule'); await waitFor('Your schedule has no classes or commitments.');
    assert.equal(rows.length, 0); assert.equal(imports.length, 0); assert.equal(rsvps[0].status, 'going');
    missingSchema = true; await visit('/calendar', 'Scheduling is not set up on this server yet.');
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log('PASS synthetic 360px browser: calendar, manual save/edit, RSVP, private import/correction/commit/cleanup, management, confirmed clear, RSVP preservation, missing schema');
  } finally { if (socket) socket.close(); chrome.kill(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
