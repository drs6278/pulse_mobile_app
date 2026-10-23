import assert from 'node:assert/strict';
import { imageDimensions, readLimitedBody, processProfileDeletions, cleanupProfileAvatars } from '../supabase/functions/_shared/profile/core.mjs';

const png = new Uint8Array(24);
png.set([137, 80, 78, 71, 13, 10, 26, 10]); png.set([73, 72, 68, 82], 12);
new DataView(png.buffer).setUint32(16, 512); new DataView(png.buffer).setUint32(20, 256);
assert.deepEqual(imageDimensions(png), { width: 512, height: 256, format: 'png' });
assert.throws(() => imageDimensions(new TextEncoder().encode('<svg>fake JPEG</svg>')), /valid JPEG/);
new DataView(png.buffer).setUint32(16, 100000);
assert.throws(() => imageDimensions(png), /million pixels/);
const small = new Request('http://example.invalid', { method: 'POST', body: 'hello' });
assert.equal(new TextDecoder().decode(await readLimitedBody(small, 8)), 'hello');
await assert.rejects(readLimitedBody(new Request('http://example.invalid', { method: 'POST', body: 'too long' }), 4), /too large/);

function clientHarness({ failStorage = false, missingUser = false } = {}) {
  const calls = [], updates = [];
  let claim = 0, removed = false;
  const client = {
    rpc: async name => {
      calls.push(name);
      if (name === 'claim_profile_deletion') return { data: claim++ === 0 ? 'alice' : null, error: null };
      if (name === 'claim_profile_avatar_cleanup') return { data: [{ path: 'alice/old.jpg', user_id: 'alice' }], error: null };
      return { data: null, error: null };
    },
    from: table => ({
      update: patch => ({ eq: async () => { updates.push({ table, patch }); return { error: null }; } }),
      delete: () => ({ eq: () => ({ lt: async () => ({ error: null }), then: resolve => resolve({ error: null }) }) }),
    }),
    storage: { from: bucket => ({
      list: async () => ({ data: bucket === 'profile-avatars' && !removed ? [{ id: 'object', name: 'photo.jpg' }] : [], error: null }),
      remove: async paths => { calls.push(['remove', bucket, paths]); if (failStorage) return { error: new Error('storage unavailable') }; removed = true; return { error: null }; },
    }) },
    auth: { admin: { deleteUser: async user => { calls.push(['deleteAuth', user]); return { error: missingUser ? { code: 'user_not_found', status: 404 } : null }; } } },
  };
  return { client, calls, updates };
}
const failed = clientHarness({ failStorage: true });
assert.deepEqual(await processProfileDeletions(failed.client), { completed: 0, failed: 1 });
assert(!failed.calls.includes('purge_profile_data'), 'Storage failure must prevent database purge');
assert(!failed.calls.some(call => Array.isArray(call) && call[0] === 'deleteAuth'), 'Storage failure must preserve Auth for retry');
assert.equal(failed.updates[0].patch.status, 'failed');
const success = clientHarness({ missingUser: true });
assert.deepEqual(await processProfileDeletions(success.client), { completed: 1, failed: 0 }, 'retry succeeds if Auth deletion already completed');
assert(success.calls.indexOf('purge_profile_data') < success.calls.findIndex(call => Array.isArray(call) && call[0] === 'deleteAuth'));
assert.equal(success.updates[0].patch.status, 'complete');
assert.deepEqual(await cleanupProfileAvatars(clientHarness().client), { removed: 1 });
console.log('PASS maintenance: byte limits, raster checks, bounded dimensions, Storage-before-Auth ordering, failed cleanup, retry idempotency, and abandoned-avatar cleanup');
