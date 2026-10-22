import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Copies only the reviewed generated delivery to this project's parent folders.
// This is local installation, not a hosted migration or function deployment.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const staged = path.join(root, 'src/.schedule-delivery');
async function copyTree(directory, relative = '') {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    if (item.name === '.gitignore') continue;
    const name = path.join(relative, item.name);
    if (item.isDirectory()) { await copyTree(path.join(directory, item.name), name); continue; }
    if (!/^(supabase|docs|scripts)[\\/]/.test(name)) throw new Error(`Unexpected delivery file: ${name}`);
    const destination = path.resolve(root, name);
    if (!destination.startsWith(root + path.sep)) throw new Error('Delivery path escapes project root.');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(staged, name), destination);
  }
}
await copyTree(staged);
const readme = path.join(root, 'README.md');
let readmeText = await fs.readFile(readme, 'utf8');
if (!readmeText.includes('docs/SCHEDULE_REVIEW.md')) {
  readmeText += '\n## Schedule import and editing completion\n\nEditable ICS/CSV previews, private temporary uploads, conflict warnings, entry management, and clear-schedule support are implemented. Apply the additional migration, deploy both Edge Functions, and configure source cleanup before using file imports. See [Schedule review deployment and validation](docs/SCHEDULE_REVIEW.md). Image/PDF imports are deferred.\n';
  await fs.writeFile(readme, readmeText);
}
const schedulingDoc = path.join(root, 'docs/SCHEDULING.md');
let doc = await fs.readFile(schedulingDoc, 'utf8');
if (!doc.includes('SCHEDULE_REVIEW.md')) doc = doc.replace('# Pulse scheduling', '# Pulse scheduling\n\nFor the current editable previews, private temporary uploads, retention policy, and clear-schedule setup, see [Schedule review completion](SCHEDULE_REVIEW.md).');
doc = doc.replace('Raw ICS/CSV files are not uploaded.', 'ICS/CSV sources are uploaded privately for backend validation and deleted after save/discard; see SCHEDULE_REVIEW.md.');
doc = doc.replace('Manual editing accepts local `YYYY-MM-DDTHH:mm:ss` times and an IANA timezone.', 'Manual and preview editors use separate local date/time fields and an IANA timezone; persisted wall times use `YYYY-MM-DDTHH:mm:ss`.');
doc = doc.replace('Choose `.ics` or `.csv`; review timezone, semester bounds, validation, duplicates, and selected updates before saving.', 'Choose `.ics` or `.csv`; correct entries and review timezone, semester bounds, validation, duplicates, overlaps, and selected updates before saving.');
doc = doc.replace('Overnight CSV rows require manual entry with an explicit next-day end.', 'Overnight CSV rows require explicit end date/time confirmation in the preview editor.');
doc = doc.replace('RPCs run as the caller; none bypass RLS.', 'The original row operations use caller permissions. The schedule-review migration adds narrowly scoped definer functions with explicit owner checks; see SCHEDULE_REVIEW.md.');
await fs.writeFile(schedulingDoc, doc);
const lintConfigPath = path.join(root, 'eslint.config.js');
const lintConfig = await fs.readFile(lintConfigPath, 'utf8');
if (!lintConfig.includes('src/.schedule-*/**')) {
  const updated = lintConfig.replace('ignores: ["dist/*"]', 'ignores: ["dist/*", "src/.schedule-*/**", "supabase/functions/**"]');
  if (updated === lintConfig) throw new Error('Review ESLint ignores before adding generated-artifact exclusions.');
  await fs.writeFile(lintConfigPath, updated);
}
console.log('Installed the local scheduling migration, generated Edge Functions, smoke test, and documentation. Hosted deployment was not performed.');
