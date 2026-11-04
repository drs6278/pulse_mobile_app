import { supabase } from './supabase';

export type VoteKind = 'event' | 'club' | 'comment';
export type Engagement = { id: string; score: number; my_vote: number; comment_count: number };
export type DiscussionComment = Engagement & { parent_id: string | null; author_id: string | null; body: string; created_at: string; edited_at: string | null; display_name: string; avatar_path: string | null; reply_count: number };
export type Club = { id: string; name: string; description: string; category: string; contact: string; website: string; meeting_location: string; image_url: string; approval_required: boolean; deleted_at: string | null };
export type ClubDraft = Omit<Club, 'id' | 'deleted_at'>;
export const emptyClub: ClubDraft = { name: '', description: '', category: 'Other', contact: '', website: '', meeting_location: '', image_url: '', approval_required: false };
export async function communityRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(['42883', 'PGRST202'].includes(error.code) ? 'Community features need the database update. Please try again after it is installed.' : error.message);
  return data as T;
}
export function summaries(kind: VoteKind, ids: string[]) {
  return communityRpc<Engagement[]>('community_summary', { p_kind: kind, p_ids: ids });
}
export function vote(kind: VoteKind, id: string, value: number) {
  return communityRpc<Engagement[]>('set_community_vote', { p_kind: kind, p_id: id, p_value: value });
}
export function comments(event: string, parent: string | null, top: boolean, offset: number) {
  return communityRpc<DiscussionComment[]>('list_event_comments', { p_event: event, p_parent: parent, p_top: top, p_offset: offset });
}
