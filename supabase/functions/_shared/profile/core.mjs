// Runtime-independent maintenance logic; tested without network or server credentials.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function readLimitedBody(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Request too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty request.');
  const parts = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error('Request too large.'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
// Inspect dimensions before allocating a decoded pixel buffer. Never trust filename/MIME.
export function imageDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start, count) => String.fromCharCode(...bytes.subarray(start, start + count));
  let width = 0, height = 0, format = '';
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
    width = view.getUint32(16); height = view.getUint32(20); format = 'png';
  } else if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216) {
    format = 'jpeg'; let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1]; offset += 2;
      if (marker === 255) { offset--; continue; }
      if (marker === 217 || marker === 218) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if ([192, 193, 194].includes(marker) && size >= 8) { height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break; }
      offset += size;
    }
  } else if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    format = 'webp'; const chunk = ascii(12, 4);
    if (chunk === 'VP8X') { width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16); height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16); }
    else if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) { width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383; }
    else if (chunk === 'VP8L' && bytes[20] === 47) { const bits = view.getUint32(21, true); width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1; }
  }
  if (!width || !height || !format) throw new Error('Choose a valid JPEG, PNG, or WebP photo.');
  if (width > 8192 || height > 8192 || width * height > 4000000) throw new Error('Choose a photo with no more than 4 million pixels.');
  return { width, height, format };
}
function checked(result) { if (result.error) throw result.error; return result.data; }
export async function removeUserFiles(client, user) {
  for (const bucket of ['profile-avatars', 'schedule-sources']) {
    let empty = false;
    for (let batch = 0; batch < 20; batch++) {
      const files = checked(await client.storage.from(bucket).list(user, { limit: 100, offset: 0 }));
      if (!files?.length) { empty = true; break; }
      if (files.some(file => !file.id || file.name.includes('/'))) throw new Error('Unexpected nested upload path; review cleanup.');
      checked(await client.storage.from(bucket).remove(files.map(file => `${user}/${file.name}`)));
    }
    if (!empty) throw new Error('More files remain; retry cleanup.');
  }
}
export async function processProfileDeletions(client, limit = 5) {
  let completed = 0, failed = 0; const seen = new Set();
  for (let index = 0; index < limit; index++) {
    const user = checked(await client.rpc('claim_profile_deletion'));
    if (!user) break;
    if (seen.has(user)) {
      checked(await client.from('account_deletion_requests').update({ status: 'failed', updated_at: new Date().toISOString(), last_error: 'cleanup_retry_required' }).eq('user_id', user));
      break;
    }
    seen.add(user);
    try {
      await removeUserFiles(client, user);
      checked(await client.rpc('purge_profile_data', { p_user: user }));
      // Deletion is idempotent: Auth may have succeeded before a previous worker timed out.
      const result = await client.auth.admin.deleteUser(user);
      if (result.error && result.error.code !== 'user_not_found' && result.error.status !== 404) throw result.error;
      checked(await client.from('account_deletion_requests').update({ status: 'complete', last_error: null, updated_at: new Date().toISOString() }).eq('user_id', user));
      completed++;
    } catch {
      checked(await client.from('account_deletion_requests').update({ status: 'failed', last_error: 'cleanup_retry_required', updated_at: new Date().toISOString() }).eq('user_id', user));
      failed++;
    }
  }
  return { completed, failed };
}
export async function cleanupProfileAvatars(client) {
  const objects = checked(await client.rpc('claim_profile_avatar_cleanup'));
  let removed = 0;
  for (const object of objects ?? []) {
    checked(await client.storage.from('profile-avatars').remove([object.path]));
    checked(await client.from('profile_avatar_objects').delete().eq('path', object.path)); removed++;
  }
  // Requests retain only a pseudonymous user key for 30 days to support safe retries.
  checked(await client.from('account_deletion_requests').delete().eq('status', 'complete').lt('updated_at', new Date(Date.now() - 30 * 86400000).toISOString()));
  return { removed };
}
