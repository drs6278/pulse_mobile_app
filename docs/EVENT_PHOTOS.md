# Event photos

Organizers can add one photo to an event when creating or editing it. The photo
fills the event's card in the feed and appears at the top of the event page.

## How it works

- The app picks a photo with `expo-image-picker`, then resizes it to at most
  1600px on its longest edge and saves it as JPEG with `expo-image-manipulator`.
  This also converts iPhone HEIC photos.
- The `event-photo` Edge Function checks that the caller posted the event, then
  re-encodes the image with ImageMagick. Re-encoding strips EXIF data, including
  GPS location. It uploads the result to the private `event-photos` bucket and
  attaches it with `set_event_photo`.
- A photo is readable exactly when its event is. The storage read policy goes
  through the `events` read policies, so account state, age eligibility and
  blocks all apply.
- Photos follow the same rule as editing: only the original poster can change
  one, and only before the event starts. A photo change doesn't bump the event
  revision or notify attendees.
- `profile-maintenance` removes photos that no event references, once they are
  at least an hour old. That covers replaced or removed photos, deleted events,
  and account deletion.

Until the migration is applied, the feed and event pages load without photos.
Uploads then fail with "Event photos aren't available on this server yet",
and the event is still posted.

## Deploying

1. Apply `supabase/migrations/202611080001_event_photos.sql` after
   `202610280001_event_edit_notifications.sql`.
2. Deploy the upload function with JWT verification enabled:
   `npx supabase functions deploy event-photo --project-ref ngzieszcygbtvuudszjr`
3. Set up `profile-maintenance` so the photo cleanup runs. It needs the
   `PROFILE_MAINTENANCE_SECRET` secret and a scheduled POST every minute; see
   [PROFILES.md](PROFILES.md). The same job also processes account deletions.
   `npx supabase functions deploy profile-maintenance --no-verify-jwt --project-ref ngzieszcygbtvuudszjr`
4. Build a new development or store build. `expo-image-picker` and
   `expo-image-manipulator` are native modules. Expo Go already includes both.

### Production status (November 8, 2026)

- Steps 1 and 2 are done on `ngzieszcygbtvuudszjr`. Migration history matches the
  repository through `202611080001`. Read-only checks confirmed the private
  bucket (JPEG only, 5 MB), the read-only storage policy, and the grants: clients
  cannot write the bucket or the column, and only the service role can claim
  cleanup.
- The deployed `event-photo` function is active with JWT verification. A live
  OPTIONS request returns 200 with CORS headers, which confirms ImageMagick
  initialized at startup. Requests without a user session return 401.
- Step 3 is not done. `profile-maintenance` was never deployed to this project,
  and there is no scheduler. Until it is set up, replaced or removed photos stay
  in storage. They are unreadable, because the read policy requires an event
  that references them, but they still take up space.
- `202611020001_saved_events.sql` was applied to production on November 2 but
  never committed. It was recovered verbatim from the production migration
  history, so `db push` could run.

## Tests

- `node scripts/test-event-photos-database.mjs` runs the migration in
  disposable PGlite databases with uuid, bigint and text event IDs. It covers
  write protection, ownership, the existence check, age rules on photo reads,
  revision stability, the format constraint, and cleanup claims.
- `src/lib/__tests__/event-photo.test.ts` covers picking and resizing, upload
  error messages, removal, authenticated sources, and the query fallbacks for
  servers that don't have the migration yet.
