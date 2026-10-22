# Phase 3 — Discovery and RSVP

Implements user_stories.docx D04 (US5, US6, US34) and D06 (US39, US40), including the document's capacity, cancellation and waitlist extensions.

## Deployment

Apply `supabase/migrations/202610210002_discovery_rsvp.sql` after the scheduling and Phase 2 clubs/events migrations. Deploy the migration before this client: direct RSVP writes are intentionally revoked and replaced by authenticated RPCs. No remote database was changed during implementation.

The migration adds indexed full-text search over title, description, category and location, positive optional capacity, stable waitlist sequence numbers, aggregate attendance RPCs, and event/RSVP Realtime publication when `supabase_realtime` exists. The Supabase project's Realtime service must be enabled. Clients also refresh on foreground, manual refresh and every 30 seconds while active, including when visibility revocation hides Realtime changes.

## Behavior and ownership

- Feed: paginated published, noncancelled events, keyword search with category/date filters; attendance counts on cards and details. PostgreSQL event RLS applies before results are returned. Search terms use bound full-text filters rather than raw PostgREST expressions.
- RSVP: one row per user/event. `set_event_rsvp` derives identity from the JWT and locks the event before counting or changing attendance. Full events automatically queue requests; duplicate active requests retain their original place. Leaving and rejoining goes to the back of the queue.
- Promotion: cancellation and capacity increases promote earliest eligible queued users. Publication, cancellation, event end time, current membership and invitations are checked again; ineligible queued records become cancelled. Internal promotion/eligibility helpers cannot be invoked by clients.
- Capacity: save an event draft first, then use its capacity controls before publishing. Blank means unlimited; capacity cannot drop below confirmed attendance. Only the current organizer or club admin/officer can change it. Capacity changes increment revision and enter event history.
- My RSVPs & waitlists: review confirmed and queued events and cancel even if event access was revoked. Only confirmed RSVPs block the schedule. Event cancellation cancels all active attendance records. Device calendar exports still require manual removal.
- Counts reveal aggregate attendance only for events the current user can view. Other users' attendance identities remain protected by RSVP RLS.

## Validation

`node scripts/test-discovery-database.mjs` applies all migrations in disposable PGlite PostgreSQL instances for UUID, bigint and text event IDs. It verifies full-text matching, capacity enforcement, duplicate requests, stable FIFO promotion, invitation revocation, capacity increases/decreases, cancellation, private counts and denial of direct/helper writes. PGlite uses one connection; a multi-connection concurrency load test against staging remains a deployment check. Event row locks are the database mechanism that serializes concurrent requests.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:discovery`.

Push delivery, age restrictions, bans, blacklists and moderation belong to later domains. The eligibility helper currently enforces the visibility/membership/invitation restrictions implemented by Phase 2; extend it when adding those restrictions.
