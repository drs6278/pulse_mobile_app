// TEMPORARY PLACEHOLDER: replace with the real module from Davis. Do not ship.
//
// The real file was never committed, so the app could not bundle. Nothing here
// talks to Supabase, and the types are inferred from how the screens use them.
// Background reads come back empty so screens stay quiet. Everything else
// rejects, so no action can appear to succeed.

const UNAVAILABLE = 'Community features aren’t available in this build yet.';

export type VoteKind = 'event' | 'comment' | 'club';

export type Engagement = {
  id: string;
  score: number;
  my_vote: number;
  comment_count: number;
};

export type DiscussionComment = {
  id: string;
  author_id: string | null;
  display_name: string;
  avatar_path: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  reply_count: number;
  score: number;
  my_vote: number;
};

export type ClubDraft = {
  name: string;
  description: string;
  category: string;
  contact: string;
  website: string;
  meeting_location: string;
  image_url: string;
  approval_required: boolean;
};

export type Club = ClubDraft & {
  id: string;
  deleted_at: string | null;
};

export const emptyClub: ClubDraft = {
  name: '',
  description: '',
  category: '',
  contact: '',
  website: '',
  meeting_location: '',
  image_url: '',
  approval_required: false,
};

const backgroundReads: Record<string, unknown> = {
  list_discussion_notifications: [],
  community_moderator: false,
};

export async function communityRpc<T = never>(name: string, _args?: Record<string, unknown>): Promise<T> {
  if (name in backgroundReads) return backgroundReads[name] as T;
  throw new Error(UNAVAILABLE);
}

export async function summaries(_kind: VoteKind, _ids: string[]): Promise<Engagement[]> {
  return [];
}

export async function comments(_eventId: string, _parent: string | null, _top: boolean, _offset: number): Promise<DiscussionComment[]> {
  throw new Error(UNAVAILABLE);
}

export async function vote(_kind: VoteKind, _id: string, _direction: number): Promise<Engagement[]> {
  throw new Error(UNAVAILABLE);
}
