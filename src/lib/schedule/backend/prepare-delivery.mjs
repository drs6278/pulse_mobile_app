import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Stages a complete, reviewable delivery inside src. Installing the staged files
// into the parent repository requires filesystem approval in restricted sessions.
const here = path.dirname(fileURLToPath(import.meta.url));
const scheduleRoot = path.resolve(here, '..');
const output = path.resolve(here, '../../../.schedule-delivery');
const write = async (name, contents) => { const target = path.join(output, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, contents); };
const files = ['types.ts', 'time.ts', 'validation.ts', 'import/csv.ts', 'import/ics.ts', 'import/utf8.ts', 'import/process-source.ts'];
for (const name of files) {
  const source = await fs.readFile(path.join(scheduleRoot, name), 'utf8');
  let javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  javascript = javascript.replace(/from (['"])(\.[^'"]+)\1/g, (_match, quote, specifier) => `from ${quote}${specifier}.js${quote}`);
  await write(`supabase/functions/_shared/schedule/${name.replace(/\.ts$/, '.js')}`, `// Generated from src/lib/schedule/${name}; regenerate with prepare-delivery.mjs.\n${javascript}`);
}
for (const name of ['schedule-source', 'schedule-source-cleanup']) {
  await write(`supabase/functions/${name}/index.ts`, `// @ts-nocheck -- Deno runtime entrypoint, generated from src/lib/schedule/backend/${name}.mjs.\n${await fs.readFile(path.join(here, `${name}.mjs`), 'utf8')}`);
  await write(`supabase/functions/${name}/deno.json`, JSON.stringify({ imports: { '@supabase/supabase-js': 'npm:@supabase/supabase-js@2.117.3', luxon: 'npm:luxon@3.7.2', 'ical.js': 'npm:ical.js@2.2.1', papaparse: 'npm:papaparse@5.7.0' } }, null, 2) + '\n');
}
await write('supabase/migrations/202610210003_schedule_review.sql', await fs.readFile(path.join(here, '202610210003_schedule_review.sql')));
await write('docs/SCHEDULE_REVIEW.md', await fs.readFile(path.join(here, 'README.md')));
await write('scripts/verify-schedule-review-web.cjs', await fs.readFile(path.join(here, 'verify-review-web.cjs')));
console.log(`Staged schedule migration, Edge Functions, shared parsers, and deployment documentation in ${output}`);
