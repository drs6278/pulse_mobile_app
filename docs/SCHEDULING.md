# Pulse scheduling

For the current editable previews, private temporary uploads, retention policy, and clear-schedule setup, see [Schedule review completion](SCHEDULE_REVIEW.md).

Scheduling reuses Supabase Auth, the existing Supabase database, Expo Router, React contexts, and the Pulse UI. SQLite remains native authentication storage only. There is no second schedule database or offline write queue.

## Backend setup and deployment

The migration is **not automatically applied by the app**. The public Supabase key cannot inspect privileged schema metadata. No hosted migration was applied during implementation.

1. Run `supabase/preflight.sql` in the project's SQL editor with an authorized database account. Review the existing `events` columns, primary key, grants, RLS policies, and any existing scheduling/RSVP tables. Never put database or service-role secrets in `EXPO_PUBLIC_*` variables.
2. Review `supabase/migrations/202610190001_scheduling.sql` against those results. It requires an existing `public.events` table with `id`, `title`, `event_date`, `location`, and `category`, existing event RLS, and a UUID, bigint, integer, text, or unbounded varchar primary key. Existing compatible remote scheduling tables must be reconciled before applying this migration.
3. Apply first to an isolated staging copy. The migration is transactional and additive to `events`. It uses `pulse_*` temporal fields to avoid overwriting unknown legacy columns. The RSVP foreign-key type is derived from the actual event ID type. The migration fails rather than disabling/replacing existing event policies.
4. Verify existing event publisher authorization and `anon`/`authenticated` event grants separately. This migration does not invent host ownership or broaden event grants. Its private tables enforce owner-only RLS and owner-aware foreign keys. The original row operations use caller permissions. The schedule-review migration adds narrowly scoped definer functions with explicit owner checks; see SCHEDULE_REVIEW.md.
5. Update the authoritative event publisher to supply either verified `pulse_starts_at`/`pulse_ends_at` UTC instants or `pulse_all_day_start`/`pulse_all_day_end` date values (exclusive end), plus `pulse_timezone`. Mark cancellation with `pulse_cancelled`. A trigger increments `pulse_revision` when relevant event details change. Do not fabricate times for date-only events.
6. Deploy the migration before enabling the new app. Before backend setup, scheduling screens show a setup error while existing event discovery/details retain their legacy date-only query fallback.

Client row/domain interfaces describe this migration contract. They are **not generated declarations of the uninspected hosted schema**. Once privileged schema access is available, generate full database types using the team's Supabase workflow and reconcile the contract before deployment.

For read-only public API introspection, `npm run inspect:backend` prints only exposed schema definitions, never credentials or row data. The configured server may reject that endpoint with “Secret API key required”; use the SQL preflight instead. Do not substitute a secret into the app environment.

## Event creation

The Create tab lets signed-in students post events. Apply `supabase/migrations/202610210001_event_creation.sql` **after** the scheduling migration, again via a staging copy first. It:

- adds `events.created_by` (defaults to `auth.uid()`),
- gives `events.id` a server-side generator only when it has no default or identity,
- grants `authenticated` column-level INSERT on title, location, category, date and `pulse_*` time fields only, so clients cannot pick IDs, owners, revisions or cancellation,
- adds an `event_insert_own` policy requiring `created_by = auth.uid()`.

Before applying, check the preflight's `events` columns for other NOT NULL columns without defaults; the app does not supply them and inserts would fail. The form takes local `YYYY-MM-DDTHH:mm:ss` times plus an IANA timezone, and the app stores UTC `pulse_starts_at`/`pulse_ends_at`, `pulse_timezone`, and the local start date as `event_date`. Editing and cancelling posted events are not supported yet. Until the migration is applied, posting shows a setup message.

## Data model and flows

- `schedule_series`: private single or weekly class/commitment definitions, local wall times, IANA zone, bounded semester, source UID, normalized content key, and optimistic version.
- `schedule_exceptions`: cancellation or replacement times keyed by the **original** recurrence identity; moving an occurrence retains its identity.
- `schedule_imports`: import ownership, label, request key, and date. ICS/CSV sources are uploaded privately for backend validation and deleted after save/discard; see SCHEDULE_REVIEW.md.
- `schedule_preferences`: display zone, availability hours, minimum gap, and optional category interests.
- `event_rsvps`: one relationship per student/event with going/cancelled state; current event details are joined, not copied into schedule records.

`src/lib/schedule` contains pure validation, recurrence, import, availability, and ranking logic. Repositories perform authenticated queries and RPC writes. Providers own request/user lifetimes; UI components do not own persistent copies of events. Route files stay thin.

Reads paginate explicitly and fail on configured caps instead of silently returning incomplete availability. Results are hidden during refresh/failure, and late responses/mutation completions cannot enter another user's session. The authenticated provider tree is keyed by user ID. Calendar refetches on focus, foreground, explicit refresh, and every 60 seconds while focused and active.

## Calendar and editing

Calendar is available in the bottom navigation. Week mode provides a readable seven-day overview and a virtualized selected-day agenda. Day mode, Today, Previous, and Next change the visible range. Entries open their original Pulse event or schedule editor.

Manual and preview editors use separate local date/time fields and an IANA timezone; persisted wall times use `YYYY-MM-DDTHH:mm:ss`. Weekly classes support weekdays, interval, semester end, and imported COUNT/UNTIL/WKST. End must follow start and be within seven days. Semester bounds cannot exceed 366 days. All-day entries use midnight boundaries with an exclusive end date.

Opening an occurrence edits its times or cancels only that occurrence. “Edit entire series” changes the master. Whole-series edits with exceptions require explicitly allowing removal of those exception changes. “This and following” editing and per-occurrence title/location overrides are not supported in v1.

Changing display timezone does not change existing classes' timezones. Weekly recurrence retains wall-clock time across DST. Skipped local recurrence times do not consume COUNT; invalid manual times are rejected. Ambiguous local times use the first occurrence and are disclosed in the editor/import preview.

## Import contract

Choose `.ics` or `.csv`; correct entries and review timezone, semester bounds, validation, duplicates, overlaps, and selected updates before saving. Native file copies are deleted after reading. Web uses browser File APIs, without importing native file/SQLite/calendar modules.

Limits: 2 MiB per file, 2,000 records, one-year bounded terms, and bounded timezone comparison/occurrence work. Preview pages show 25 entries at a time to bound mobile rendering. Unsupported constructs produce actionable errors instead of an approximate schedule.

ICS supports single/all-day events, WEEKLY rules with BYDAY/INTERVAL/WKST/COUNT or UNTIL, EXDATE, date-valued RDATE, cancellation exceptions, and moved occurrences. Custom timezone identifiers, EXRULE, positional/monthly recurrence, THISANDFUTURE, period-valued RDATE, and per-occurrence metadata overrides are rejected. Embedded IANA timezone definitions must agree with current runtime rules. Floating times use the explicitly confirmed import timezone.

CSV is UTF-8 (BOM accepted), with this template:

```csv
title,kind,location,days,start_time,end_time,start_date,end_date,timezone
Computer Science,class,Library,MO|WE|FR,09:00,09:50,2026-10-26,2026-12-11,America/New_York
Study group,commitment,Library,,17:00,18:00,2026-10-27,2026-10-27,America/New_York
```

Required columns: title, start_time, end_time, start_date. Optional columns have documented defaults in the preview: class kind, empty location, confirmed timezone, and chosen semester end. Weekly start dates align forward to the first selected weekday. Empty days means one-off. Overnight CSV rows require explicit end date/time confirmation in the preview editor. Quoted commas/newlines are parsed; unknown headers and invalid row fields are reported.

Synthetic files are in `tests/fixtures/schedules`.

Same UID/content and duplicate rows are skipped. Changed source UIDs are unselected until explicitly chosen for update; selected updates replace occurrence exceptions. Equivalent content from another source is flagged as duplicate. Idempotent commits are atomic. After a failed/uncertain attempt the request's selections are frozen, so Retry repeats the same payload/key. Discard/reimport to choose a different payload. A stale version or concurrent unique-key match rolls back the entire batch and requires review again.

Deleting an import cascades to entries it owns and their exceptions. Skipped existing duplicates retain original ownership. Deleting all imports preserves manual entries and RSVPs; an imported entry edited later remains part of its original import until individually deleted.

## Availability and recommendations

Intervals are half-open `[start,end)`: adjacent entries do not conflict. Busy classes/commitments and going active RSVPs are merged, then subtracted from preference hours. Defaults: 08:00–22:00, 30-minute minimum gap, zero travel buffer.

Missing/invalid timing, failed schedule/RSVP loads, and unavailable RSVP relationships yield unknown compatibility, never a free-time claim. Availability does not read unrelated device calendars. Canceled events do not occupy time.

Activities on Calendar query the complete bounded period independently of discovery pagination, apply current category filters, exclude going/canceled events, and rank compatibility, category interest, start time, and stable ID. The Calendar date selection defines this period. “Fits my schedule only” excludes unknown and conflicting candidates. Top 20 results are displayed after ranking all retrieved candidates.

## Personal calendar export

Native uses Expo SDK 57's current `ExpoCalendar`/`ExpoCalendarEvent` object methods. Calendar access is requested only after the explicit export action. Read/write access is needed to list writable calendars, verify mapped IDs, and update/remove previous exports. No reminders access is requested, and device calendar entries are never uploaded.

Export rereads the Pulse event before writing. Native mappings live in AsyncStorage under user/event/calendar keys. A marker search recovers interrupted mapping writes within a bounded one-year search around the event. Repeated exports update a matching entry; removal is explicit. Manual calendar changes, reinstall, events moved beyond the recovery window, or external sync may prevent absolute duplicate guarantees. A mismatch never overwrites an unrelated calendar entry.

Web downloads ICS with a stable UID and revision. Calendar applications control import/update/duplicate behavior; Pulse cannot inspect browser users' device calendars. Exports are snapshots and never continuously synchronize. Canceling an RSVP does not silently delete a native export.

`expo-calendar` is unsupported in Expo Go for SDK 57. Build a new development binary with the configured plugin before device validation, for example `npx eas-cli@latest build --profile development` using the team's EAS configuration. No generated native projects are hand-edited.

## Validation commands

```sh
npm run lint
npm run typecheck
npm test
npm run test:database
npx expo export --platform all --output-dir .expo/scheduling-build
node scripts/verify-scheduling-web.cjs
```

Expo generates typed route declarations during `npx expo start --offline`; run it once after adding routes if `.expo/types/router.d.ts` is stale. Jest transforms dynamic imports only in tests; application code retains lazy loading.

Database tests use fresh in-memory PGlite PostgreSQL instances and **never load .env or contact a hosted database**. They exercise migration execution, three event key types, RLS, ownership foreign keys, optimistic versions, import rollback/idempotency, and RSVP cancellation.

The optional browser smoke script serves `.expo/scheduling-build`, launches headless Chromium, and intercepts all Supabase requests with synthetic responses. It exercises authenticated calendar/manual save/RSVP/import/settings/missing-schema handling and a 360px layout. Set `PULSE_CHROME_PATH` if the default locally installed Chromium path is unavailable. Screenshots and browser state stay under ignored `.expo/scheduling-smoke`.

Still required before release: run the migration against a staging copy of the actual schema, verify authoritative event ingestion, and test native file providers/calendar permissions on real iOS/Android development builds. JavaScript exports do not validate native signing, OS permissions, or device behavior.
