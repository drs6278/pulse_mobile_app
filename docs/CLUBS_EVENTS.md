# Clubs and events — Phase 2

Requirements reviewed from `user_stories.docx`, D03 (Event Lifecycle), D07 (Clubs, Membership & Community), and the core visibility rules in D09. Source story groups: US32, US33, US36, US37, US42, US59; US21–24, US38, US41. The finalized domain acceptance criteria resolve role and visibility behavior.

## Implemented

- Any signed-in user can create a club; one transaction creates its first admin membership.
- Users can discover club profiles, join, and leave. Admins edit club profiles, remove members, and appoint officers and additional admins. Members cannot promote themselves. The final admin must appoint a replacement before leaving or being demoted/removed. A club row lock serializes these changes.
- Any signed-in user can create a personal event. Current club admins and officers can create and manage events hosted by their club. The organizer is fixed after creation. Authorship alone does not preserve management rights after leaving a club.
- Events support title, description, location, category, local start/end time, and IANA timezone. The client rejects daylight-saving gaps/ambiguities; the server validates timestamps and timezone. Drafts can be published, published events edited or cancelled; cancelled events cannot be republished.
- Every event edit checks the saved revision and records an immutable audit snapshot. Reload before retrying a stale edit. Event creation uses a stable request key so retrying an uncertain save on the same form does not create another event.
- Public is the default, visible to signed-in users after publishing. Private events require an explicit invitation; club-only events require current membership of their organizing club. Organizers can manage drafts and restricted events. Revocation and leaving a club affect subsequent database reads immediately.
- Invitations use a recipient's Pulse user UUID. Users find their selectable ID in the Create tab. Organizers can inspect and revoke invitations. This avoids exposing account emails or the entire user directory.
- Discovery/calendar candidate queries exclude drafts and cancelled events. Event details link authorized organizers to management. Draft/cancelled events reject new RSVPs in the database.

## Database setup

1. Back up the existing database and test the migration on a disposable/staging database.
2. Apply `supabase/migrations/202610190001_scheduling.sql` if it is not already installed.
3. Review and apply `supabase/migrations/202610210001_clubs_events.sql` using the Supabase SQL editor or your established migration deployment process.
4. Reload the application. Use two or three test accounts to exercise membership and invitation revocation.

If deploying the concurrent Phase 3 changes from this workspace, also apply `202610210002_discovery_rsvp.sql` after Phase 2: those screens and shared event projections expect its capacity/search fields and attendance RPCs.

The migration was validated with UUID, bigint, and text event primary keys. It preserves an existing ID generator and provides one where absent. It assumes the existing `events` fields used by scheduling (`id`, `title`, `event_date`, `location`, `category`) and must be reviewed if the hosted schema adds other required fields.

Existing events retain public/published behavior. They are not silently assigned to the deploying user. Legacy event ownership must be backfilled through a reviewed administrative mapping before anyone can manage those records. The migration replaces legacy event RLS policies so an old permissive read policy cannot reveal private events. Review any custom service policies during deployment.

All app writes use narrowly scoped RPCs with authenticated identity checks. Membership, invitation and audit tables do not permit direct client writes; event writes are also revoked. Security-definer functions use an empty search path, qualified objects, and restricted execute grants. No service-role key belongs in the application.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:community`. The community database test applies both migrations to fresh local PGlite instances without reading `.env` or contacting the hosted backend. It checks role escalation, last-admin protection, draft and private visibility, invite revocation, membership revocation, officer rights, stale revisions, time validation, cancellation, RSVP eligibility, and anonymous access for all three supported ID types.

The UI tests exercise failed publishing and explicit retry, local validation, and draft/publish distinction. Time tests cover invalid zones and daylight-saving transitions. On a device, verify Create → club creation → join from another account → appoint officer → club event → publish → leave/revoke → confirm the event is unavailable to that account.

## Boundaries

Capacity/waitlists and richer discovery are Phase 3. Push delivery, cancellation notifications, realtime invalidation, age restrictions, moderation removal/deletion workflows, social features, and account-deletion ownership transfer belong to later domains. This phase persists cancellation and audit data; it does not send push notifications. Screens offer explicit refresh and retry; backend authorization remains authoritative even if a previously loaded screen is still visible. After closing a form during an uncertain save, check the workspace before creating the event again.

The implementation does not apply migrations to a hosted database automatically. The read-only schema inspection in this session was rejected by the configured backend, so hosted end-to-end verification remains pending migration deployment and valid backend configuration.
