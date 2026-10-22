// @ts-nocheck -- Deno runtime entrypoint, generated from src/lib/schedule/backend/schedule-source-cleanup.mjs.
/* global Deno */
/* eslint-disable import/no-unresolved -- Deno deployment imports are resolved after generation. */
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { cleanupScheduleSources } from '../_shared/schedule/import/process-source.js';

// Deploy with gateway JWT checks disabled; only the scheduler secret is accepted.
Deno.serve(async request => {
  const secret = Deno.env.get('SCHEDULE_CLEANUP_SECRET');
  if (request.method !== 'POST') return new Response('POST required', { status: 405 });
  if (!secret || secret.length < 32 || request.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  const client = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    return Response.json(await cleanupScheduleSources(client), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Source cleanup failed; retry on the next scheduled run.' }, { status: 500 });
  }
});
