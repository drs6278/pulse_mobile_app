import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { communityRpc, comments, vote, type DiscussionComment, type Engagement, type VoteKind } from '@/lib/community';
import { useAuth } from '@/providers/auth-provider';
import { ProfileMessage } from './profile/controls';
import { PulseColors as C, PulseLayout, PulseSpacing } from '@/constants/pulse-theme';
// Direct imports: the ./ui barrel pulls in providers that need a live Supabase client.
import { ActionSheet, type SheetAction } from './ui/action-sheet';
import { Avatar } from './ui/avatar';
import { Button, IconButton } from './ui/button';
import { InlineMessage } from './ui/feedback';
import { SegmentedControl } from './ui/segmented-control';
import { PulseText } from './ui/text';
import { TextField } from './ui/text-field';
import { VoteControl } from './ui/vote-control';

// Optimistic voting with rollback; `cast` is a no-op until the engagement has loaded.
export function useVote(kind: VoteKind, value: Engagement | undefined, onChange: (value: Engagement) => void) {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  async function cast(direction: number) {
    if (!value || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const next = value.my_vote === direction ? 0 : direction;
    onChange({ ...value, score: Number(value.score) + next - value.my_vote, my_vote: next });
    try { const result = await vote(kind, value.id, next); if (!result[0]) throw new Error('Voting unavailable.'); onChange(result[0]); }
    catch (e) { onChange(value); setError((e as Error).message); }
    finally { locked.current = false; setBusy(false); }
  }
  return { busy, error, cast };
}

export function VoteButtons({ kind, value, onChange }: { kind: VoteKind; value: Engagement; onChange: (value: Engagement) => void }) {
  const { busy, error, cast } = useVote(kind, value, onChange);
  return <View style={{ gap: 6 }}>
    <VoteControl score={Number(value.score)} myVote={value.my_vote} disabled={busy} onVote={direction => void cast(direction)} />
    <ProfileMessage error text={error} />
  </View>;
}

const sortOptions = ['Newest', 'Top'] as const;

export function EventDiscussion({ eventId, onCommentsChanged }: { eventId: string; onCommentsChanged?: () => void }) {
  const { comment: focusedId } = useLocalSearchParams<{ comment?: string }>();
  const [focused, setFocused] = useState<DiscussionComment | null>(null);
  const { session } = useAuth();
  const [top, setTop] = useState(false);
  const [revision, setRevision] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Kept in a ref so `changed` stays stable and refocusing never loops through the parent.
  const notify = useRef(onCommentsChanged);
  useEffect(() => { notify.current = onCommentsChanged; }, [onCommentsChanged]);
  const refresh = useCallback(() => setRevision(r => r + 1), []);
  const changed = useCallback(() => { refresh(); notify.current?.(); }, [refresh]);
  useFocusEffect(refresh);
  useEffect(() => { let active = true; if (focusedId) void communityRpc<DiscussionComment | null>('get_discussion_comment', { p_id: focusedId, p_event: eventId }).then(row => { if (active) setFocused(row); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [focusedId, revision, eventId]);
  async function submit() {
    setBusy(true); setError('');
    try { await communityRpc('save_event_comment', { p_event: eventId, p_body: body }); setBody(''); changed(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <View key={`${session?.user.id}:${eventId}`} style={{ gap: PulseSpacing.lg }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: PulseSpacing.md }}>
      <PulseText variant="heading" accessibilityRole="header">Discussion</PulseText>
      <SegmentedControl label="Sort comments" options={sortOptions} value={top ? 'Top' : 'Newest'} onChange={value => setTop(value === 'Top')} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: PulseSpacing.sm }}>
      <View style={{ flex: 1 }}>
        {/* Fixed to the Post button's height; longer comments scroll inside the field. */}
        <TextField hideLabel label="Add a comment" placeholder="Add a comment…" multiline maxLength={2000} value={body} onChangeText={setBody} style={{ height: PulseLayout.controlHeight, minHeight: PulseLayout.controlHeight }} />
      </View>
      <Button label="Post" variant="primary" disabled={busy || !body.trim()} onPress={() => void submit()} />
    </View>
    <InlineMessage error text={error} />
    {focusedId && <View style={{ gap: PulseSpacing.md }}>
      <PulseText variant="label" tone="muted" accessibilityRole="header">Selected comment</PulseText>
      {focused ? <CommentItem key={`${focused.id}:${revision}`} item={focused} eventId={eventId} top={false} depth={0} refresh={changed} /> : <PulseText tone="muted">This comment is unavailable.</PulseText>}
    </View>}
    <CommentBranch key={`${eventId}:${top}:${revision}:${session?.user.id}`} eventId={eventId} parent={null} top={top} depth={0} refresh={changed} />
  </View>;
}

function CommentBranch({ eventId, parent, top, depth, refresh }: { eventId: string; parent: string | null; top: boolean; depth: number; refresh: () => void }) {
  const [items, setItems] = useState<DiscussionComment[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => { let active = true; void comments(eventId, parent, top, offset).then(rows => { if (active) { setItems(previous => offset ? [...previous, ...rows] : rows); setMore(rows.length === 20); setError(''); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [eventId, parent, top, offset]);
  return <View style={{ gap: PulseSpacing.lg }}>
    {items.map(item => <CommentItem key={item.id} item={item} eventId={eventId} top={top} depth={depth} refresh={refresh} />)}
    <InlineMessage error text={error} />
    {busy && <PulseText variant="label" tone="muted">Loading comments…</PulseText>}
    {!busy && !error && !items.length && depth === 0 && <PulseText tone="muted">No comments yet. Start the conversation.</PulseText>}
    {more && <View style={{ alignSelf: 'flex-start' }}><Button label="Load more comments" variant="ghost" compact disabled={busy} onPress={() => { setBusy(true); setOffset(v => v + 20); }} /></View>}
  </View>;
}

const stampFormat = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const;

function CommentItem({ item, eventId, top, depth, refresh }: { item: DiscussionComment; eventId: string; top: boolean; depth: number; refresh: () => void }) {
  const { session } = useAuth();
  const [engagement, setEngagement] = useState<Engagement>({ ...item, comment_count: 0 });
  const votes = useVote('comment', engagement, setEngagement);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<'reply' | 'edit' | 'report' | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function action(name: string, args: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await communityRpc(name, args); setMode(null); setBody(''); refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const open = (next: 'reply' | 'edit' | 'report', initial = '') => { setMode(next); setBody(initial); };
  const mine = !!item.author_id && item.author_id === session?.user.id;
  const profile = item.author_id ? { pathname: '/student-profile', params: { id: item.author_id } } as const : null;
  const profileLabel = `View ${item.display_name}'s profile`;
  const stamp = `${new Date(item.created_at).toLocaleString(undefined, stampFormat)}${item.edited_at ? ' · edited' : ''}`;
  const menu: SheetAction[] = mine
    ? [{ label: 'Edit', disabled: busy, onPress: () => open('edit', item.body) }, { label: 'Delete comment', danger: true, disabled: busy, onPress: () => void action('delete_event_comment', { p_id: item.id }) }]
    : [{ label: 'Report', disabled: busy, onPress: () => open('report') }];
  const submitLabel = mode === 'report' ? 'Report' : mode === 'edit' ? 'Save' : 'Reply';
  const avatar = <Avatar name={item.display_name} path={item.avatar_path} size={32} />;
  const name = <PulseText variant="label">{item.display_name}</PulseText>;
  return <View style={{ gap: PulseSpacing.md }}>
    <View style={{ flexDirection: 'row', gap: PulseSpacing.md }}>
      {/* The name link below carries the label; the avatar is a larger touch target for the same place. */}
      {profile ? <Link href={profile} asChild><Pressable accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>{avatar}</Pressable></Link> : avatar}
      <View style={{ flex: 1, gap: PulseSpacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.sm }}>
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: PulseSpacing.sm }}>
            {profile ? <Link href={profile} asChild><Pressable accessibilityRole="link" accessibilityLabel={profileLabel} hitSlop={4}>{name}</Pressable></Link> : name}
            <PulseText variant="caption" tone="muted">{stamp}</PulseText>
          </View>
          {item.author_id && <IconButton icon="more" label="Comment options" onPress={() => setMenuOpen(true)} />}
        </View>
        <PulseText variant="body">{item.body}</PulseText>
        {(item.author_id || item.reply_count > 0) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: PulseSpacing.xs }}>
          {item.author_id && <>
            <VoteControl score={Number(engagement.score)} myVote={engagement.my_vote} disabled={votes.busy} onVote={direction => void votes.cast(direction)} />
            <Button label="Reply" variant="ghost" compact disabled={busy} onPress={() => open('reply')} />
          </>}
          {item.reply_count > 0 && <Button label={`${expanded ? 'Hide' : 'Show'} ${item.reply_count} ${item.reply_count === 1 ? 'reply' : 'replies'}`} variant="ghost" compact expanded={expanded} onPress={() => setExpanded(v => !v)} />}
        </View>}
        {mode && <View style={{ gap: PulseSpacing.sm }}>
          <TextField label={mode === 'report' ? 'Reason for reporting' : mode === 'reply' ? `Reply to ${item.display_name}` : 'Edit comment'} multiline maxLength={mode === 'report' ? 1000 : 2000} value={body} onChangeText={setBody} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: PulseSpacing.sm }}>
            <Button label="Cancel" variant="ghost" compact onPress={() => setMode(null)} />
            <Button label={submitLabel} variant="primary" compact disabled={busy || !body.trim()} onPress={() => void (mode === 'report' ? action('report_event_comment', { p_id: item.id, p_reason: body }) : action('save_event_comment', { p_event: eventId, p_body: body, p_parent: mode === 'reply' ? item.id : null, p_id: mode === 'edit' ? item.id : null }))} />
          </View>
        </View>}
        <InlineMessage error text={votes.error || error} />
      </View>
    </View>
    {expanded && <View style={depth < 3 ? { marginLeft: PulseSpacing.lg, paddingLeft: PulseSpacing.md, borderLeftWidth: 2, borderColor: C.border } : undefined}>
      <CommentBranch eventId={eventId} parent={item.id} top={top} depth={depth + 1} refresh={refresh} />
    </View>}
    {menuOpen && <ActionSheet visible title="Comment options" actions={menu} onClose={() => setMenuOpen(false)} />}
  </View>;
}
