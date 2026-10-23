// @ts-nocheck -- Deployed and checked by Deno, separate from the Expo app.
/* global Deno */
/* eslint-disable import/no-unresolved */
import { ImageMagick, initializeImageMagick, MagickFormat } from 'npm:@imagemagick/magick-wasm@0.0.30';
import { authenticate, adminClient, headers, respond } from '../_shared/profile/http.ts';
import { readLimitedBody, imageDimensions, MAX_IMAGE_BYTES } from '../_shared/profile/core.mjs';

const wasm = await Deno.readFile(new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')));
await initializeImageMagick(wasm);
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return respond({ error: 'POST required.' }, 405);
  let auth;
  try { auth = await authenticate(request); } catch { return respond({ error: 'Sign in required.' }, 401); }
  try {
    const bytes = await readLimitedBody(request, MAX_IMAGE_BYTES);
    imageDimensions(bytes);
    const { data: path, error } = await auth.client.rpc('register_profile_avatar');
    if (error) return respond({ error: 'Unable to prepare this photo. Your account may be unavailable or too many uploads are pending.' }, 409);
    // Decode and re-encode: only real raster data is published; EXIF/GPS is stripped.
    const normalized = ImageMagick.read(bytes, image => {
      if (image.width * image.height > 4000000 || ![MagickFormat.Jpeg, MagickFormat.Png, MagickFormat.WebP].includes(image.format)) throw new Error('Unsupported photo.');
      image.autoOrient(); image.resize(512, 512); image.strip(); image.quality = 85;
      return image.write(MagickFormat.Jpeg, result => new Uint8Array(result));
    });
    const admin = adminClient();
    const upload = await admin.storage.from('profile-avatars').upload(path, normalized, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
    if (upload.error) return respond({ error: 'Unable to upload photo. Please retry.' }, 503);
    const { data: active, error: activeError } = await auth.client.rpc('pulse_account_active');
    if (activeError || !active) {
      await admin.storage.from('profile-avatars').remove([path]);
      return respond({ error: 'Account unavailable.' }, 403);
    }
    const ready = await admin.from('profile_avatar_objects').update({ ready: true }).eq('path', path);
    if (ready.error) return respond({ error: 'Unable to prepare photo. Please retry.' }, 503);
    return respond({ path });
  } catch (reason) {
    const message = reason instanceof Error && /^(Choose|Request too large|Empty request)/.test(reason.message) ? reason.message : 'This photo could not be processed. Choose another JPEG, PNG, or WebP.';
    return respond({ error: message }, 400);
  }
});
