// Read-only PostgREST schema inspection. Never prints credentials or row data.
try { process.loadEnvFile('.env'); } catch { /* CI may supply the environment. */ }
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Supabase public configuration is missing.');
fetch(`${url}/rest/v1/`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) })
  .then(async response => {
    const schema = await response.json();
    console.log('Schema HTTP status:', response.status);
    console.log(JSON.stringify(schema.definitions ?? { message: schema.message, code: schema.code }, null, 2));
    if (!response.ok) process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
