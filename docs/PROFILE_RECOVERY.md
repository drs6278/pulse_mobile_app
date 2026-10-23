# Recover the “Profiles are not available” account screen

## Recovery applied October 23, 2026

The connected project `ngzieszcygbtvuudszjr` was inspected and the missing
schedule-review and profiles migrations were applied successfully. Migration
history matches repository versions `202610210003` and `202610230001`.
Postflight assertions passed; all six existing Auth users received both profile
records, and the nine events and six RSVPs were preserved. A transaction using
the authenticated role verified own-profile reads and private-profile isolation.
The PostgREST schema cache was refreshed. Actual device/session verification
remains necessary. No Edge Functions were deployed: uploads, file processing,
and account deletion still require the service setup described below.

The following sections retain the original diagnosis and recovery procedure.

### Required profile setup applied October 23, 2026

Migration `202610230002_profile_setup.sql` was applied to the same connected
project and its history was reconciled to repository version `202610230002`.
All six existing accounts had untouched generated profiles; their names were
cleared and setup remains required. The six Auth users, nine events, and six
RSVPs were preserved. Postflight assertions passed. An authenticated-role
transaction verified incomplete-profile isolation, rejection of a blank name
and missing age choice, and atomic versioned completion with “Prefer not to
say”; all verification writes were rolled back. The migration refreshed the
PostgREST schema cache. Device verification and the separate Edge Function
deployments described above remain outstanding.

The configured server returned `PGRST205` for `profiles`, `private_profiles`, and
`schedule_sources` during the October 23, 2026 read-only check. The API inventory
endpoint returned HTTP 401, so it cannot determine migration completeness.
This handoff makes no automatic hosted changes. A client rebuild alone will not
create the missing backend objects.

## 1. Inspect before applying SQL

Open the intended project's **SQL Editor** in Supabase Dashboard. The locally
linked project reference at diagnosis was `ngzieszcygbtvuudszjr`; confirm it
matches the app's configured Supabase URL. Validate against staging/a restored
copy first, and retain a database backup before updating the live project.

Run [preflight.sql](../supabase/preflight.sql) as the database administrator.
Review every result set and the migration-version notices. This script only
reads catalogs and bucket configuration; it does not expose user records.

Compare tables, columns, functions, grants, policies, and triggers with the
migration SQL below. A recorded version or a single matching table alone does
not establish a complete installation. If objects partially exist, differ from
the migration, or belong to another feature, stop and prepare a reviewed repair
for that schema. Do not drop tables, remove policies, or add blanket
`IF NOT EXISTS` clauses to force a migration through.

If all expected objects already exist, first run
`NOTIFY pgrst, 'reload schema';`, then retry the app. This distinguishes a stale
API schema cache from missing database objects.

## 2. Apply only missing migrations, in order

Open each required file and paste its **entire contents** into a separate SQL
Editor query. Each migration already contains `begin`/`commit`. Run one at a
time, require success, and rerun preflight before proceeding. If a query fails,
end any failed transaction with `ROLLBACK;` before further queries; do not run
later migrations until the cause is resolved. Skip a migration only after its
full installed schema has been verified.

| Order | SQL file | Main evidence to inspect (not an exhaustive completeness check) |
| --- | --- | --- |
| 1 | [Scheduling](../supabase/migrations/202610190001_scheduling.sql) | Schedule tables, RSVP table, event time columns, scheduling RPCs and policies |
| 2 | [Event creation](../supabase/migrations/202610210001_event_creation.sql) | `events.created_by`, event ID generator, insert column grants and `event_insert_own` policy |
| 3 | [Schedule review](../supabase/migrations/202610210003_schedule_review.sql) | `schedule_sources`, import source columns, four-argument import RPC, cleanup trigger and Storage policies |
| 4 | [Profiles](../supabase/migrations/202610230001_profiles.sql) | Public/private profile tables, Auth backfill/trigger, profile RPCs, restrictive account policies and private avatar bucket |
| 5 | [Required profile setup](../supabase/migrations/202610230002_profile_setup.sql) | Private completion timestamp, blank names for new accounts, legacy default cleanup, versioned completion and incomplete-profile visibility |

The scheduling migration expects the existing `events` table and enabled RLS;
it does not create a replacement events dataset. The profile migration needs
all three predecessors. Apply the required-setup migration next: it clears
untouched generated names and requires those users and future accounts to
choose a name and age eligibility before entering the app. Customized profiles
are preserved. Complete both profile migrations before releasing the client.
Preserve the complete migration, including account-state, blocking, and age
protections. No local fallback profile or relaxed account boundary is needed.

After successful application, run this separate query:

```sql
NOTIFY pgrst, 'reload schema';
```

Dashboard SQL does not automatically record CLI migration history. Before the
next CLI deployment, compare remote history and actual schema, then use
`npx supabase migration repair <version> --status applied --linked` for each
verified, manually applied repository migration that is absent from history.
Use the exact version prefix from its filename. Never mark a failed or partial
migration applied, and never blindly run `db push` against unreconciled history.
See [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations)
and [schema cache refresh](https://supabase.com/kb/troubleshooting/refresh-postgrest-schema).

## 3. Verify recovery

Run [profile-postflight.sql](../supabase/profile-postflight.sql) in SQL Editor.
It checks RLS, required RPCs, existing-user backfill, the provisioning trigger,
profile read policies/grants, and the private avatar bucket. It raises an error
on missing essentials. Also review preflight's policy expressions, function
permissions, and trigger definitions against the migrations: structural checks
alone do not prove authorization behavior.

Then verify with actual signed-in sessions (the administrator bypasses RLS):

1. On the affected existing account, select **Try again**. Pulse should open;
   the profile should load and saving a display name/bio should survive reload.
2. Create a new test account through normal Auth signup. Verify it receives both
   profiles and can open Pulse without manual inserts.
3. With a second user, verify their private profile is unreadable from the first
   session. Anonymous sessions must not read either profile table.
4. On disposable staging accounts, verify suspended/deleting accounts remain
   restricted, including with a previously issued access token. Do not reset
   real account states merely to make login work.

If retry still fails, capture the sanitized PostgREST error code/table name.
Use administrator catalog checks to distinguish missing objects from RLS or
grant failures; the anonymous API inventory endpoint is not a health check.

## 4. Complete related services

The SQL restores profile loading and text saves. Photo upload and account
deletion additionally require the existing `profile-avatar`, `profile-account`,
and `profile-maintenance` Edge Functions. Follow the deployment order in
[PROFILES.md](PROFILES.md#deployment-order), including the server-only maintenance
secret, every-minute scheduler, retries, and alerts. Keep `profile-account`
undeployed until the worker is functioning; it is the endpoint that accepts
deletion requests. Test actual uploads and deletion in staging before enabling
these services. Schedule file imports separately require their documented
[schedule-review services](SCHEDULE_REVIEW.md).

Hosted recovery is complete only after the SQL is applied and the signed-in
checks pass. Local tests cannot establish that the remote server was updated.
