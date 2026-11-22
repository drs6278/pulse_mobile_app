# Core clubs and roles

This implements the D07 club and role extensions from `../user_stories.docx`,
US41 host profiles, and D03/D09 access dependencies for club-hosted events.
Comments and voting remain available; new ratings, reviews, private feedback,
announcements, billing, and invitation-only events are outside this change.

| Capability | Member | Officer | Admin |
| --- | --- | --- | --- |
| Active roster and club-only events | Yes | Yes | Yes |
| Create/edit/cancel all club events | No | Yes | Yes |
| Permanently delete club events | No | No | Yes |
| Club settings, membership, roles, club deletion | No | No | Yes |

Club creation atomically assigns its creator as admin. Joining may be open or
require approval. Pending memberships have no active-member privileges. Only
admins see pending requests. Other signed-in users can view profiles and member
counts, but cannot retrieve the roster. Profile blocks still mask profile names.
Roster and event pages are bounded; the viewer's own membership is loaded
independently of roster pagination.

The last eligible active admin cannot leave, be removed, or be demoted. Promote
another active member first. Account deletion retains the existing succession
workflow, prioritizes officers when a successor is needed, and does not promote
members when an ordinary member deletes their account.

Club events default to public; existing events remain public. Club-only event
reads require current active membership in addition to existing access rules.
Leaving/removal cancels club-only RSVPs atomically. Narrowing public visibility
also cancels nonmember RSVPs. Rejoining does not restore them. Public-event
RSVPs survive departure. Existing downloaded content cannot be retroactively
erased, but subsequent database/storage reads enforce current access.

## Installation and compatibility

Deployed on 2026-11-16 to linked Supabase project `ngzieszcygbtvuudszjr`:
all three club migrations below and `event-photo` version 2. Read-only hosted
verification confirmed migration history, officer roles, restrictive event
visibility, protected internal functions, and serialized RSVP/edit RPCs. The
pre-existing community schema was verified and its missing migration-history
entry reconciled without rerunning its table creation. A final dry run reported
no pending migrations. No mobile build or OTA update was published; this repo
has no EAS project/channel configuration. Independent-session concurrency and
signed-in device workflows have not been validated against the hosted project.

For another environment, review and apply in this order:

1. Existing profile, community, event-photo, saved-event, and event-deletion migrations.
2. `202611160001_club_officers.sql`.
3. `202611160002_club_visibility.sql`.
4. `202611160003_club_workflows.sql`.
5. Deploy the updated event-photo Edge Function and then the updated app together.

RSVP table writes by authenticated clients are revoked. The updated app calls
`set_event_rsvp(p_event text, p_status text)` with the actor derived from the
session; old clients must update before writing RSVPs. There is no unsafe direct
write fallback. `edit_pulse_event` accepts optional `pulse_visibility` in its
existing JSON argument, retaining current visibility if omitted. Its internal
pre-visibility implementation is no longer callable by clients.

New RPCs are `set_club_member_role`, `community_can_delete_event`,
`list_club_members` (25 records per page), and `club_member_count`. The active
membership predicate with an explicit user argument is internal; clients cannot
use it to probe arbitrary users' membership.

Club membership/role mutations lock the club row. Event edits, cancellation,
deletion, photo attachment, and RSVP writes take that same club lock before
locking an event. Permission checks occur after locks. Changes to visibility,
member eligibility, and RSVPs therefore commit atomically. Independent clubs
retain independent locks. Account cleanup locks multiple clubs in UUID order.

## Validation

Run `node scripts/test-community-database.mjs` for the local PostgreSQL-compatible
PGlite authorization and regression suite. It covers direct RPC/table attempts,
all club roles, pending users, last-admin handover, private event/discussion/photo
access, removal/leave cancellation, and visibility changes.

Run `npm test -- --runInBand`, `npm run lint -- --no-cache`, and
`npm run typecheck` for application checks. Focused club UI tests cover outsider
privacy, officer actions, visibility controls, confirmation, role changes, and
server-denied departure.

PGlite uses a single connection and cannot establish independent-session race
correctness. For concurrency checks, install `psql`, apply these migrations to a
**disposable local PostgreSQL database**, set `PULSE_CLUB_TEST_DATABASE_URL` to it,
and run `node scripts/test-club-concurrency.mjs`. The script creates and cleans
isolated fixture users/clubs and tests RSVP versus departure and simultaneous
admin departure. It skips explicitly when no test URL is supplied. Never point
it at production. Live device interactions, hosted schema compatibility, Edge
Function deployment, and independent PostgreSQL concurrency require separate
environment validation.
