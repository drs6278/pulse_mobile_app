Event editing and attendee notifications use
`supabase/migrations/202610280001_event_edit_notifications.sql` after the existing
profile setup migration. Run it in the Supabase SQL editor or your migration
deployment workflow before using the new screens on a new environment.

Applied to the linked Pulse project `ngzieszcygbtvuudszjr` on October 28, 2026.
The CLI dry run confirmed this was the only pending migration, and `db push`
applied it and recorded its history. Live authenticated-role verification via
`supabase/event-edit-postflight.sql` passed for owner-only editing, event revision,
RSVP preservation, one attendee notification with old/new field values, inbox
isolation and marking read. All verification writes were rolled back. The
existing 10 events, 7 RSVPs and 6 accounts were preserved.

Only the original poster may save changes, strictly before the stored event
start. The server locks the event, checks its revision and validates the draft.
Each actual save increments the revision and creates one notification containing
all old/new field values for every current Going attendee except the poster.
No-op saves produce no notifications. RSVPs are never reset. Stale saves must
reopen the editor to load the latest version.

Open My profile → My posted events, or open an event's details, to edit.
Leaving a changed draft requires discard confirmation, including native back
navigation; browser refresh/close uses the browser's unsaved-change prompt.

The main header bell opens the inbox. Opening a notification marks just that
notification read and opens the event. Mark all as read covers the full inbox,
including other pages. Counts refresh on inbox focus, app foreground and every
30 seconds while the app is active. This feature does not require push permission.
Notification history remains readable if an event later becomes unavailable;
its event link still respects existing event visibility rules.

Validation: `node scripts/test-event-edit-database.mjs`, targeted event editor
and event library Jest tests, `npm run lint -- --no-cache`, `npm run typecheck`.
