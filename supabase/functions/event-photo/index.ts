// @ts-nocheck -- Deployed and checked by Deno, separate from the Expo app.
/* global Deno */
/* eslint-disable import/no-unresolved */
import { ImageMagick, initializeImageMagick, MagickFormat } from 'npm:@imagemagick/magick-wasm@0.0.30';
import { authenticate, adminClient, headers, respond } from '../_shared/profile/http.ts';
import { readLimitedBody, imageDimensions, MAX_IMAGE_BYTES } from '../_shared/profile/core.mjs';

const BUCKET = 'event-photos';
const MAX_EDGE = 1600;
const wasm = await Deno.readFile(new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')));
await initializeImageMagick(wasm);

// POST /event-photo?event=<id> with image bytes. Replaces the event's photo;
// the previous object is removed later by profile-maintenance.
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return respond({ error: 'POST required.' }, 405);
  let auth;
  try { auth = await authenticate(request); } catch { return respond({ error: 'Sign in required.' }, 401); }
  const eventId = new URL(request.url).searchParams.get('event');
  if (!eventId || eventId.length > 100 || eventId.includes('/')) return respond({ error: 'Choose an event.' }, 400);
  try {
    // Read as the caller, so event visibility rules apply before any work.
    const { data: event, error: eventError } = await auth.client.from('events').select('id::text,created_by,pulse_cancelled').eq('id', eventId).maybeSingle();
    if (eventError || !event || event.created_by !== auth.user.id || event.pulse_cancelled) {
      return respond({ error: 'Only the original poster can add a photo to this event.' }, 403);
    }
    const bytes = await readLimitedBody(request, MAX_IMAGE_BYTES);
    imageDimensions(bytes);
    // Decode and re-encode: only real raster data is published; EXIF/GPS is stripped.
    const normalized = ImageMagick.read(bytes, image => {
      if (image.width * image.height > 4000000 || ![MagickFormat.Jpeg, MagickFormat.Png, MagickFormat.WebP].includes(image.format)) throw new Error('Unsupported photo.');
      image.autoOrient();
      if (image.width > MAX_EDGE || image.height > MAX_EDGE) image.resize(MAX_EDGE, MAX_EDGE);
      image.strip(); image.quality = 82;
      return image.write(MagickFormat.Jpeg, result => new Uint8Array(result));
    });
    const path = `${event.id}/${crypto.randomUUID()}.jpg`;
    const admin = adminClient();
    const upload = await admin.storage.from(BUCKET).upload(path, normalized, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
    if (upload.error) return respond({ error: 'Unable to upload photo. Please retry.' }, 503);
    // Attach as the caller: ownership, timing, and account state are rechecked in SQL.
    const attached = await auth.client.rpc('set_event_photo', { p_id: event.id, p_path: path });
    if (attached.error) {
      await admin.storage.from(BUCKET).remove([path]);
      return respond({ error: attached.error.message || 'Unable to attach photo. Please retry.' }, 409);
    }
    return respond({ path });
  } catch (reason) {
    const message = reason instanceof Error && /^(Choose|Request too large|Empty request)/.test(reason.message) ? reason.message : 'This photo could not be processed. Choose another JPEG, PNG, or WebP photo.';
    return respond({ error: message }, 400);
  }
});
