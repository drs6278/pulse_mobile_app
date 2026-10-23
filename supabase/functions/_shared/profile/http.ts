// @ts-nocheck -- Deno Edge Runtime; the app's TypeScript config does not resolve npm: imports.
/* global Deno */
/* eslint-disable import/no-unresolved */
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
export const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
export const respond = (body, status = 200) => Response.json(body, { status, headers });
export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authenticate(request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Sign in required.');
  const client = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Error('Sign in required.');
  return { client, user: data.user, token: authorization.slice(7) };
}
