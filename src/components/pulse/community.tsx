import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { communityRpc, comments, summaries, vote, type DiscussionComment, type Engagement, type VoteKind } from '@/lib/community';
import { useAuth } from '@/providers/auth-provider';
import { ProfileAvatar, ProfileButton, ProfileField, ProfileLink, ProfileMessage, ProfileText } from './profile/controls';
import { PulseColors as C } from '@/constants/pulse-theme';

export function VoteButtons({ kind, value, onChange }: { kind: VoteKind; value: Engagement; onChange: (value: Engagement) => void }) {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  async function cast(direction: number) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const next = value.my_vote === direction ? 0 : direction;
    onChange({ ...value, score: Number(value.score) + next - value.my_vote, my_vote: next });
    try { const result = await vote(kind, value.id, next); if (!result[0]) throw new Error('Voting unavailable.'); onChange(result[0]); }
    catch (e) { onChange(value); setError((e as Error).message); }
    finally { locked.current = false; setBusy(false); }
  }
  return <View style={{ gap: 6 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    {[1, -1].map(direction => <Pressable key={direction} accessibilityRole="button" accessibilityLabel={direction === 1 ? 'Upvote' : 'Downvote'} accessibilityState={{ selected: value.my_vote === direction, disabled: busy }} disabled={busy} onPress={() => void cast(direction)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: value.my_vote === direction ? C.pink : C.muted }}><ProfileText pink={value.my_vote === direction}>{direction === 1 ? '▲' : '▼'}</ProfileText></Pressable>)}
    <View accessibilityLiveRegion="polite"><ProfileText>{value.score} points</ProfileText></View>
  </View><ProfileMessage error text={error} /></View>;
}

export function EventDiscussion({ eventId }: { eventId: string }) {
  const { comment: focusedId } = useLocalSearchParams<{ comment?: string }>();
  const [focused, setFocused] = useState<DiscussionComment | null>(null);
  const { session } = useAuth();
  const [top, setTop] = useState(false);
  const [revision, setRevision] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const refresh = useCallback(() => setRevision(r => r + 1), []);
  useFocusEffect(refresh);
  useEffect(() => { let active = true; if (focusedId) void communityRpc<DiscussionComment | null>('get_discussion_comment', { p_id: focusedId, p_event: eventId }).then(row => { if (active) setFocused(row); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [focusedId, revision, eventId]);
  useEffect(() => { let active = true; void summaries('event', [eventId]).then(rows => { if (active) setEngagement(rows[0] ?? null); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [eventId, revision]);
  async function submit() {
    setBusy(true); setError('');
    try { await communityRpc('save_event_comment', { p_event: eventId, p_body: body }); setBody(''); refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <View key={`${session?.user.id}:${eventId}`} style={{ gap: 14 }}>
    {engagement && <><VoteButtons kind="event" value={engagement} onChange={setEngagement} /><ProfileText>{engagement.comment_count} comments and replies</ProfileText></>}
    <ProfileText title>Discussion</ProfileText><ProfileField label="Add a comment" multiline maxLength={2000} value={body} onChangeText={setBody} />
    {focusedId && <View style={{ gap: 12 }}><ProfileText title>Selected comment</ProfileText>{focused ? <CommentItem key={`${focused.id}:${revision}`} item={focused} eventId={eventId} top={false} depth={0} refresh={refresh} /> : <ProfileText muted>This comment is unavailable.</ProfileText>}</View>}
    <ProfileButton label="Post comment" disabled={busy || !body.trim()} onPress={() => void submit()} />
    <ProfileMessage error text={error} />
    <ProfileButton label={top ? 'Sort: Top' : 'Sort: Newest'} onPress={() => setTop(v => !v)} />
    <ProfileButton label="Refresh discussion" onPress={refresh} />
    <CommentBranch key={`${eventId}:${top}:${revision}:${session?.user.id}`} eventId={eventId} parent={null} top={top} depth={0} refresh={refresh} />
  </View>;
}

function CommentBranch({ eventId, parent, top, depth, refresh }: { eventId: string; parent: string | null; top: boolean; depth: number; refresh: () => void }) {
  const [items, setItems] = useState<DiscussionComment[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => { let active = true; void comments(eventId, parent, top, offset).then(rows => { if (active) { setItems(previous => offset ? [...previous, ...rows] : rows); setMore(rows.length === 20); setError(''); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [eventId, parent, top, offset]);
  return <View style={{ gap: 14 }}>{items.map(item => <CommentItem key={item.id} item={item} eventId={eventId} top={top} depth={depth} refresh={refresh} />)}<ProfileMessage error text={error} />{busy && <ProfileText muted>Loading comments…</ProfileText>}{more && <ProfileButton label="Load more comments" disabled={busy} onPress={() => { setBusy(true); setOffset(v => v + 20); }} />}</View>;
}

function CommentItem({ item, eventId, top, depth, refresh }: { item: DiscussionComment; eventId: string; top: boolean; depth: number; refresh: () => void }) {
  const { session } = useAuth();
  const [engagement, setEngagement] = useState<Engagement>({ ...item, comment_count: 0 });
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'reply' | 'edit' | 'report' | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function action(name: string, args: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await communityRpc(name, args); setMode(null); setBody(''); refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <View style={{ gap: 10, padding: depth < 3 ? 12 : 0, marginLeft: depth < 3 ? 8 : 0, borderLeftWidth: depth < 3 ? 2 : 0, borderColor: C.muted, backgroundColor: C.surface }}>
    <ProfileText>{item.display_name}</ProfileText><ProfileText muted>{new Date(item.created_at).toLocaleString()}{item.edited_at ? ' · edited' : ''}</ProfileText>
    {item.author_id && <><ProfileAvatar name={item.display_name} path={item.avatar_path} /><ProfileLink href={{ pathname: '/student-profile', params: { id: item.author_id } }} label="View profile or block user" /></>}
    <ProfileText>{item.body}</ProfileText>
    {item.author_id && <><VoteButtons kind="comment" value={engagement} onChange={setEngagement} /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <ProfileButton label="Reply" disabled={busy} onPress={() => { setMode('reply'); setBody(''); }} />
      {item.author_id === session?.user.id ? <><ProfileButton label="Edit" disabled={busy} onPress={() => { setMode('edit'); setBody(item.body); }} /><ProfileButton label="Delete comment" disabled={busy} onPress={() => void action('delete_event_comment', { p_id: item.id })} /></> : <ProfileButton label="Report" disabled={busy} onPress={() => { setMode('report'); setBody(''); }} />}
    </View></>}
    {mode && <><ProfileField label={mode === 'report' ? 'Reason for reporting' : mode === 'reply' ? `Reply to ${item.display_name}` : 'Edit comment'} multiline maxLength={mode === 'report' ? 1000 : 2000} value={body} onChangeText={setBody} /><ProfileButton label="Submit" disabled={busy || !body.trim()} onPress={() => void (mode === 'report' ? action('report_event_comment', { p_id: item.id, p_reason: body }) : action('save_event_comment', { p_event: eventId, p_body: body, p_parent: mode === 'reply' ? item.id : null, p_id: mode === 'edit' ? item.id : null }))} /><ProfileButton label="Cancel" onPress={() => setMode(null)} /></>}
    <ProfileMessage error text={error} />
    {item.reply_count > 0 && <ProfileButton label={`${expanded ? 'Hide' : 'Show'} ${item.reply_count} replies`} onPress={() => setExpanded(v => !v)} />}
    {expanded && <CommentBranch eventId={eventId} parent={item.id} top={top} depth={depth + 1} refresh={refresh} />}
  </View>;
}
