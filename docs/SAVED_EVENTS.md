Saved events
============

Apply `supabase/migrations/202611020001_saved_events.sql` after the profile
migrations before using bookmarks. No dependency or native build changes are needed.
This migration does not require the pending community migration.

Applied to the linked Pulse server on November 2, 2026, independently of the
community migration. Live verification in `supabase/saved-events-postflight.sql`
passed for saving, duplicate saves, account isolation, denied cross-account
writes, and removal. All verification fixtures were rolled back. Local database
tests passed for UUID, bigint, and text event IDs; lint and typecheck passed.

The feed and event details share private, account-scoped bookmarks. The Saved tab
shows most recently saved first, including past events, independently of discovery
filters. Saving does not RSVP or block calendar availability. Pull to refresh or
return to Saved to load changes from other devices. App foreground also refreshes.

Event visibility is enforced by existing events RLS. A bookmark for an event the
user can no longer view shows an unavailable message and can still be removed.
Deleting an event or account deletes its bookmarks. Duplicate saves are harmless.
Writes use a fixed session client and account changes clear the provider state.

Validation: `node scripts/test-saved-events-database.mjs`, `npm run lint -- --no-cache`,
and `npm run typecheck`. The database test uses disposable PostgreSQL and exercises
UUID, bigint and text event IDs without accessing the hosted database.
