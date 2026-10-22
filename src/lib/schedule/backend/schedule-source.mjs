/* global Deno */
/* eslint-disable import/no-unresolved -- Deno deployment imports are resolved after generation. */
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { processScheduleSource, cleanupScheduleSources } from '../_shared/schedule/import/process-source.js';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

// Supabase performs gateway JWT verification; also verify identity at the handler.
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return respond({ error: 'POST required.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Sign in required.' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) return respond({ error: 'Sign in required.' }, 401);
  try {
    if (Number(request.headers.get('Content-Length')) > 4096) return respond({ error: 'Request too large.' }, 413);
    const bodyText = await request.text();
    if (bodyText.length > 4096) return respond({ error: 'Request too large.' }, 413);
    const body = JSON.parse(bodyText);
    if (!body || typeof body !== 'object') return respond({ error: 'Invalid request.' }, 400);
    if (body.action === 'cleanup') return respond(await cleanupScheduleSources(client, data.user.id));
    return respond(await processScheduleSource(client, data.user.id, body));
  } catch (reason) {
    return respond({ error: reason instanceof Error ? reason.message : 'Unable to process this schedule.' }, 400);
  }
});
