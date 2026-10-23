# Profiles, account security, and deletion

Implements `../../user_stories.md` D01 (US10/US51, US11/US53, US25, US52), D09 profile reporting (US55) and blocking. Photos, bios, and signed-in student profiles are the approved additions. Existing event date/time work is preserved.

## Experience

The account icon opens `/profile`. `/edit-profile` saves public name/bio/photo and private self-reported age in one versioned transaction. `/student-profile?id=<user UUID>` shows public fields and upcoming events allowed by existing visibility policies plus the new blocking/age restrictions. An organizer link on event details opens that profile. There is no anonymous directory, public email, public age, attendance history, or schedule disclosure.

`/settings` contains account security, schedule preferences, blocked students, and deletion. `/account-deletion` is an anonymous information/sign-in page for external deletion requests; after sign-in it leads to the same authenticated deletion flow. Host this exported page on your existing web host and supply its production URL in Play Console. This change does not create or publish a separate site.

Profile controls use minimum 48px targets, scalable text, keyboard-accessible controls, labels, and inline errors. Display names are 1–60 Unicode code points; bios are optional plain text up to 280. Neither is a unique handle. Existing users receive the neutral name “Pulse student”; no email-derived fallback is published. Foreground refreshes retain unsaved drafts and preserve their baseline version; concurrent changes require a reload rather than silently overwriting newer values. Multi-step mutations use a fixed original-session token.

Photos use the already installed Expo DocumentPicker, with an image-only system file selector. Installing a new image-picker dependency was unavailable in the restricted environment. JPEG/PNG/WebP are capped at 5 MiB and 4 million pixels. The Edge Function checks signatures/dimensions, fully decodes, resizes within 512×512, orients and strips metadata, then stores JPEG only. Selecting/cancelling is supported; the previous photo remains until the final profile transaction succeeds. No direct client avatar writes are permitted. The private Storage read endpoint enforces the same profile visibility rules; the app does not use public or long-lived signed avatar URLs or disk caching.

## Deployment order

1. Inspect staging schema, existing events RLS/grants, `auth.users` hooks, Storage policies, and any existing `profiles`/club tables. Apply the existing scheduling, event-creation, and schedule-review migrations first. This migration deliberately fails on colliding profile tables rather than overwriting unknown live data. The anonymous live-schema inspection endpoint was unavailable (HTTP 401); hosted schema compatibility has not been verified.
2. Apply `supabase/migrations/202610230001_profiles.sql` to staging, then run the two-user checks below. It creates public/private profiles, reports, blocks, upload/deletion ledgers, backfill/provisioning, restrictive event/RSVP/account policies, and the private `profile-avatars` bucket. Existing permissive event policies remain responsible for public/private/club visibility. Restrictive policies additionally enforce active accounts, mutual blocks, and age eligibility. Anonymous event reads are denied, including through legacy broad policies.
3. Deploy `profile-avatar` and `profile-account` with JWT verification enabled. Both also validate identity with Auth. They use pinned Supabase JS 2.117.3. The avatar function uses `@imagemagick/magick-wasm@0.0.30` and its packaged `magick.wasm`, initialized using the official Supabase WASM example. Verify the asset is included by the CLI and execute a real staging upload before release; no local Deno/Supabase runtime was available for that integration check.
4. Set a random **server-only** `PROFILE_MAINTENANCE_SECRET` of at least 32 characters. Deploy `profile-maintenance --no-verify-jwt`. It accepts only POST with `Authorization: Bearer <PROFILE_MAINTENANCE_SECRET>`. Never put the service-role key or this secret in `EXPO_PUBLIC_*` variables.
5. Schedule a POST to `/functions/v1/profile-maintenance` every minute from Supabase Cron or your trusted scheduler, retrieving the secret from a server-side secret store. It handles up to five deletion requests and 100 expired noncurrent avatars per invocation. Retry non-200 responses. Alert on failed deletion requests or a request older than 15 minutes, and escalate well before the displayed 24-hour completion target. Do not enable the app's deletion flow without a functioning worker and these alerts.
6. In Supabase Auth, enable secure password changes and requiring the current password, configure your password policy and email delivery, and verify the nonce flow on a session older than the recent-login window. The screen sends `current_password` and supports a nonce challenge; it does not weaken the backend policy with a separate client policy. Test account deletion password proof against Auth rate limits as well.
7. Deploy the app only after the migration and functions pass staging checks. The account boundary deliberately fails closed when no current private profile can be loaded. Missing migrations show a retryable setup error; they do not synthesize a local profile. Native photo-provider permissions/cancellation, VoiceOver/TalkBack, and real email delivery require device/staging verification.

## Deletion and club compatibility

The deletion endpoint verifies the current password using a separate nonpersistent Auth client. It atomically resolves club administration, marks the account `deleting`, and enqueues a durable request. Global sign-out revokes refresh sessions; restrictive RLS also denies previously issued access tokens immediately for protected data. Source-creation definer RPCs have an additional account-state trigger guard.

The checked-in backend has individual events and no club migration. The deletion adapter supports D07-style `clubs(id, ...)` and `club_memberships(club_id, user_id, role, status?)`, with UUID users and roles `admin`, `officer`, `member`. Optional owner columns recognized are `creator_user_id`, `created_by`, `owner_id`, and `creator_id`. Shared clubs transfer to an active admin, officer, or member, in that priority and stable UUID order. Clubs without another member are removed. If only inactive members remain, deletion is rejected before account changes so an operator can resolve ownership. Unrecognized schemas, including additional event-to-Auth creator FKs beyond `created_by`, fail closed and need a reviewed adapter before release; do not bypass this check. Club-hosted event content is retained, with the departing creator reference removed. Existing club FKs must cascade sole-club content appropriately or be adapted before deployment.

The worker deletes private Storage objects through the Storage API, then cancels/removes personally hosted events, schedules, source records and other personal data, then deletes the Auth user. Cascades remove profiles, preferences, RSVPs and blocks. Report details associated with the deleted user are cleared; moderation subject identifiers are cleared. A pseudonymous deletion key is retained for retry diagnostics for 30 days, then removed. Active avatar uploads delay final purge for up to ten minutes to avoid orphan races; interrupted requests retry safely. Abandoned or replaced avatars are marked for cleanup after one hour under the same account lock as profile saves, preventing a cleanup/save race. A currently selected avatar is never claimed by cleanup.

The UI's 24-hour completion statement is an operational target, not a guarantee independent of scheduler availability. Before publishing, document the actual backup retention, privacy policy, and support contact for your deployment. This implementation removes data from active systems; it cannot change hosted backup expiry or externally exported calendar copies.

## Moderation operations

Only trusted Dashboard/server operators can read `profile_reports` and invoke `moderate_profile`; ordinary clients cannot self-grant moderation through metadata. Query open reports ordered by `created_at`. Execute, with actual UUIDs and the operator's identity:

```sql
select public.moderate_profile('<report UUID>', 'hide', '<operator identity>');
```

Actions are `hide` (hide the profile), `suspend` (deny account access), `restore`, and `dismiss`. Every action is audited. Reports allow ten submissions per account per hour. Blocking is mutual for profile and personally hosted event access; existing RSVP records remain owned by the attendee and can be cancelled even when their event is hidden. Refresh event/RSVP data after age or block changes.

Monitor and respond to the queue; a database table alone is not an operational moderation process. Set a support contact and response schedule before public launch. Advanced automated image/text moderation remains deferred per D09. Review the entire app's content safeguards against store requirements before submission; these profile controls alone do not establish app-wide compliance.

## Validation

```text
npm run lint -- --no-cache
npm run typecheck
npm test -- --watch=false
node scripts/test-profiles-database.mjs
node scripts/test-profile-maintenance.mjs
npm run test:database
node src/lib/schedule/backend/test-review-database.mjs
npx expo export --platform all --output-dir .expo/profile-build
```

The SQL harness uses disposable PGlite only, across UUID/bigint/text event IDs. It covers backfill/signup, private ownership, denied public writes and privilege escalation, atomic/versioned updates, age filtering, two-sided blocks, hidden-event RSVP cancellation, private reports, moderator-only actions, private avatar reads, cleanup/save exclusion, club handoff, stale-token denial, deletion cleanup order, and anonymous denial. Maintenance tests inject fake clients and cover Storage failure, Auth-not-found retries, upload limits, and ledger cleanup. Component tests cover validation, draft retention, concurrent-version saves, password nonces, and deletion confirmation. A deployed two-user staging run must additionally verify Storage service behavior, real token revocation, Edge Runtime/WASM execution, email codes, and scheduler retries.

Local Chromium verification was attempted with debugging and HTTP-only rendering, but the environment denied the debugging WebSocket and Chromium's GPU/network subprocesses exited with access-denied errors. No browser screenshot or successful interactive smoke run is claimed. iOS, Android, and web exports and the component/database suites were verified independently.

## Primary references

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase user deletion and token lifetime](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
- [Supabase WASM image processing](https://supabase.com/docs/guides/functions/examples/image-manipulation)
- [Expo SDK 57 DocumentPicker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/)
- [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Google Play deletion requests](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)
