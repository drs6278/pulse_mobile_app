// @ts-nocheck -- Deployed and checked by Deno, separate from the Expo app.
/* global Deno */
/* eslint-disable import/no-unresolved */
import { adminClient, respond } from '../_shared/profile/http.ts';
import { cleanupProfileAvatars, processProfileDeletions } from '../_shared/profile/core.mjs';

// Scheduler only. Deploy --no-verify-jwt; authenticate with a separate server secret.
Deno.serve(async request => {
  if (request.method !== 'POST') return respond({ error: 'POST required.' }, 405);
  const secret = Deno.env.get('PROFILE_MAINTENANCE_SECRET');
  if (!secret || secret.length < 32 || request.headers.get('Authorization') !== `Bearer ${secret}`) return respond({ error: 'Unauthorized.' }, 401);
  try {
    const client = adminClient();
    const deletions = await processProfileDeletions(client);
    const avatars = await cleanupProfileAvatars(client);
    return respond({ ...deletions, ...avatars }, deletions.failed ? 503 : 200);
  } catch { return respond({ error: 'Maintenance failed. Retry on the next scheduled run.' }, 503); }
});
