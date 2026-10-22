# Schedule review, private sources, and management

This extends the scheduling implementation described in `docs/SCHEDULING.md`.
The source document is `cmpsi475/user_stories.docx`, D02 and sections 6/9.

## Requirement coverage

| Requirement | Implementation |
| --- | --- |
| Manual entry and editing | Shared editor with separate dates/times, timezone, type, weekly recurrence, and availability blocking |
| Exported file import | Private ICS/CSV upload, authenticated backend validation, editable tentative entries, explicit confirmation |
| Correct extraction mistakes | Field errors can be corrected; malformed structures and unsupported ICS rules remain rejected |
| Recurrence and timezones | Existing bounded weekly/RDATE/EXDATE and moved/cancelled occurrence support; original occurrence identities retained |
| Conflict detection | Nonblocking warnings against busy classes, commitments, selected imports, and going RSVPs; incomplete checks are disclosed |
| View commitments and events | Existing day/week calendar and availability; settings lists all entries independent of visible dates |
| Delete schedules and files | Individual entry, import batch, all imports, and entire schedule deletion; Storage cleanup is retryable |
| Private schedules | Owner RLS, owner-aware foreign keys, private bucket, authenticated function calls |
| Personal calendar export | Existing native export and web ICS download retained |
| Screenshots/images/PDF | Explicitly deferred by product decision; not offered as supported formats |
| Direct university integration | Excluded by the source document |

## Deploy

1. Review existing migrations and `docs/SCHEDULING.md` preflight. Apply `202610210003_schedule_review.sql` after the original scheduling migration, first against staging. It adds `schedule_sources`, source metadata/fingerprint on imports, private Storage policies, reviewed import RPCs, and `clear_schedule()`.
2. From the project root run `node src/lib/schedule/backend/prepare-delivery.mjs`. This generates `.schedule-delivery` inside `src`, with a `supabase` and `docs` tree. Copy those staged files to the matching project-root locations. Regenerate/copy after shared parser changes. No extra package installation is needed; the generator uses the installed TypeScript compiler. Generated server parsers use the same source and pinned dependency versions as client tests.
3. Deploy `schedule-source` with `npx supabase functions deploy schedule-source`. Leave JWT gateway verification enabled. The handler also verifies the user token and uses the user's RLS permissions.
4. Set a random server-only `SCHEDULE_CLEANUP_SECRET` of at least 32 characters using Supabase secrets. Deploy `schedule-source-cleanup` using `npx supabase functions deploy schedule-source-cleanup --no-verify-jwt`. This endpoint accepts only POST requests authenticated with that secret. It uses the server-only service role solely for source cleanup. Never place these secrets in `EXPO_PUBLIC_*` variables.
5. Configure Supabase Cron (or an existing trusted scheduler) to POST to `/functions/v1/schedule-source-cleanup` every minute, using `Authorization: Bearer <SCHEDULE_CLEANUP_SECRET>` from a server-side secret store. Do not embed the secret in committed SQL. Retry on non-200 responses or a nonzero `failed` count; continue successive runs while `more` is true. Each call removes at most 100 sources. Alert if the oldest queued/expired source remains for over 15 minutes.
6. Verify the upload→parse→correct→confirm flow and cross-user denial against staging before shipping the app. Missing uploads/functions show an actionable error; there is no silent local-only import fallback.

Source registration/cleanup, reviewed commits, and clear-schedule use narrowly scoped definer RPCs with fixed search paths, revoked public/anonymous execution, explicit authenticated-owner checks, and owner-aware source foreign keys. The client cannot directly change the cleanup ledger. Source removal cannot finalize while its Storage object still exists. The existing row editors also retain explicit owner/version guards.

## Retention and failure behavior

Sources are private UTF-8 ICS/CSV objects capped at 2 MiB and 2,000 records. Browser/native MIME associations vary, so the client assigns the canonical format MIME and the backend checks MIME plus parsed content. Native cache copies are deleted after reading. No university credentials or OCR provider are used.

Unconfirmed objects expire after 24 hours and are deleted on the next scheduled run. Save/discard immediately queues source cleanup; the app attempts immediate removal, and the worker retries failures. Source metadata is removed after successful object deletion. The cleanup ledger survives schedule/account deletion, so failed deletions and abandoned sources remain available to the worker. Deleted account sources expire within the same 24-hour window.

At most ten source records may be pending per user, including cleanup retries. Existing import records retain their labels after source cleanup. Legacy three-argument import callers remain compatible; all confirmed entries continue to receive database validation. New clients pass `p_source` to the four-argument RPC.

Confirmed imports are atomic and fingerprinted. Retrying the same key/payload returns the same batch even after source cleanup. Reusing the key for changed selections fails. After an uncertain attempt the preview is frozen; discard/reimport to change it. Correcting a changed source requires fresh update selection. Corrections never save automatically.

Whole-series editing preserves imported COUNT/UNTIL/WKST/RDATE/EXDATE. Toggling weekly repeat off/on replaces its weekly rule. Existing occurrence overrides require explicit consent to remove on a whole-series save. Per-occurrence editing changes times or cancels the occurrence; metadata editing uses the whole series. Clear-schedule removes all manual/imported classes and commitments, exceptions, and imports; preferences, RSVPs, and personal-calendar exports remain.

Conflict comparisons are half-open, so adjacent commitments do not conflict. Work is bounded at 10,000 expanded intervals and 20,000 overlap comparisons. Partial checks, invalid timing, or unavailable RSVPs never produce a claim that the schedule is free. Conflicts warn without blocking saving.

## Validation

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:database`, and `node src/lib/schedule/backend/test-review-database.mjs`.
For the updated 360px browser workflow, run `npx expo export --platform all --output-dir src/.schedule-build`, then `node scripts/verify-schedule-review-web.cjs` after generating/copying the delivery. It intercepts all HTTP API calls and blocks remote WebSockets, using synthetic state for upload, correction, commit, cleanup, manual editing, and clear-schedule checks. Screenshots stay in ignored `src/.schedule-smoke`.
The new database tests use disposable PGlite with a minimal Storage-policy harness; they do not contact a hosted backend. Test native file providers/calendar permissions on iOS and Android development builds and run the existing web smoke workflow after an Expo export. Storage service MIME enforcement and deployed Deno execution additionally require staging validation.

References: [Expo SDK 57 DocumentPicker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/), [Supabase Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), [Edge Function dependencies](https://supabase.com/docs/guides/functions/dependencies).
