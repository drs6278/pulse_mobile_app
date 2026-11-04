# Community features

Apply `supabase/migrations/202610280002_community.sql` after the profile and event-edit migrations. This migration targets the verified hosted UUID event key. It creates clubs, memberships, voting, threaded event comments, reporting, and discussion notifications. It preserves existing event editing validation and extends it to current club administrators.

Validation: `node scripts/test-community-database.mjs`, `npm test -- --watch=false`, `npm run lint -- --no-cache`, `npm run typecheck`, and `npx expo export --platform web`.

Voting starts at zero. Votes are private; only aggregate scores and the caller's vote are exposed. Writes use authenticated database functions; client code cannot write vote totals, authors, roles, reports, or moderation outcomes directly. Scores do not remove content. Comment submissions are limited to ten per minute per account. Top sorting applies across matching records before pagination.

Clubs are accessible from event discovery and My Profile. Both joining modes are supported. Club images currently use optional HTTPS image URLs. Club admins manage members and publish events from club details. The final admin must appoint a successor or delete the club. Club deletion cancels future events and retains discussions; account deletion removes authored comment text and votes and resolves shared club administration.

Moderators must be provisioned by a trusted database administrator by inserting the existing user's UUID into `public.community_moderators`. Users cannot assign this role themselves. The Moderation screen provides a queue, removal, and dismissal; `comment_reports` preserves reviewer and timestamp history. No accounts receive moderator privileges automatically.

After installation, verify tables have RLS enabled, only the intended functions are executable by authenticated users, and new feature requests succeed with a signed-in active profile. Use two test accounts to verify blocking, club approvals, vote switching, reply notification delivery, and admin event editing. Existing age eligibility remains enforced for discussions and voting.

No push notifications, anonymous posting, club discussions, live subscriptions, or comment attachments are included.
