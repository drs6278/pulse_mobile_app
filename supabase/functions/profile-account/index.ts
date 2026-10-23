// @ts-nocheck -- Deployed and checked by Deno, separate from the Expo app.
/* global Deno */
/* eslint-disable import/no-unresolved */
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { authenticate, adminClient, headers, respond } from '../_shared/profile/http.ts';
import { readLimitedBody } from '../_shared/profile/core.mjs';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return respond({ error: 'POST required.' }, 405);
  let auth;
  try { auth = await authenticate(request); } catch { return respond({ error: 'Sign in required.' }, 401); }
  try {
    const body = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 4096)));
    if (typeof body.password !== 'string' || !body.password || !auth.user.email) return respond({ error: 'Enter your current password.' }, 400);
    // Isolated client: proof of password must not replace the caller's session.
    const proofClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const proof = await proofClient.auth.signInWithPassword({ email: auth.user.email, password: body.password });
    if (proof.error || proof.data.user?.id !== auth.user.id) return respond({ error: 'Password verification failed. Please try again.' }, 403);
    try {
      const admin = adminClient();
      const result = await admin.rpc('begin_profile_deletion', { p_user: auth.user.id });
      if (result.error) {
        const message = /club/i.test(result.error.message) ? 'Your club ownership needs review before deletion. Please ask a club administrator to transfer ownership or resolve inactive membership, then retry. Your account has not been deleted.' : 'Unable to accept deletion. Please try again.';
        return respond({ error: message }, 409);
      }
      // RLS denies all access immediately, even if token revocation is delayed.
      await admin.auth.admin.signOut(auth.token, 'global');
      return respond({ accepted: true, completion: 'within_24_hours' }, 202);
    } finally { await proofClient.auth.signOut({ scope: 'local' }); }
  } catch { return respond({ error: 'Unable to verify this deletion request. Please try again.' }, 400); }
});
