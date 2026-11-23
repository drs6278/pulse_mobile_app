import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { communityRpc, type ClubMember } from '@/lib/community';
import { ProfileButton, ProfileField, ProfileMessage, ProfileText } from './profile/controls';

export function ClubToolsPanel({ label, children }: PropsWithChildren<{ label: string }>) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}><ProfileButton label={open ? 'Close ' + label.toLowerCase() : label} onPress={() => setOpen(!open)} />
    {open && children}
  </View>;
}

function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete this action.'); }
    finally { lock.current = false; setBusy(false); }
  }, []);
  return { busy, error, run };
}

export function ClubTextAction({ label, limit = 2000, submit }: {
  label: string; limit?: number; submit: (body: string) => Promise<unknown>;
}) {
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  return <View style={{ gap: 8 }}>
    <ProfileField label={label} value={body} onChangeText={text => { setBody(text); setSent(false); }} maxLength={limit} multiline editable={!busy} />
    <ProfileButton label="Submit" disabled={busy || !body.trim()} onPress={() => void run(async () => { await submit(body.trim()); setBody(''); setSent(true); })} />
    <ProfileMessage error text={error} />
    {sent && <ProfileText>Submitted</ProfileText>}
  </View>;
}

function requestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

export function OrganizerComposer({ club, event }: { club?: string; event?: string }) {
  const pending = useRef<{ body: string; id: string } | null>(null);
  return <ClubToolsPanel label={club ? 'Announce to club members' : 'Message attendees'}>
    <ClubTextAction label="Message" submit={async body => {
      if (pending.current?.body !== body) pending.current = { body, id: requestId() };
      await communityRpc('send_organizer_message', { p_club: club ?? null, p_event: event ?? null, p_request: pending.current.id, p_body: body });
      pending.current = null;
    }} />
  </ClubToolsPanel>;
}

type Review = { id: string; display_name: string; stars: number; body: string; own: boolean };
type Rating = { average: number | null; total: number };

export function ClubReviews({ club, event, canReview }: { club?: string; event?: string; canReview: boolean }) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Review[]>([]);
  const [rating, setRating] = useState<Rating>();
  const [stars, setStars] = useState('');
  const [body, setBody] = useState('');
  const { busy, error, run } = useAction();
  const refresh = useCallback(async () => {
    const reviews = await communityRpc<Review[]>('list_club_reviews', { p_club: club ?? null, p_event: event ?? null, p_offset: page * 20 });
    setRows(reviews);
    if (club) setRating((await communityRpc<Rating[]>('club_rating', { p_club: club }))[0]);
  }, [club, event, page]);
  useEffect(() => { void run(refresh); }, [refresh, run]);
  const save = (value: number | null) => run(async () => {
    await communityRpc('save_club_review', { p_club: club ?? null, p_event: event ?? null, p_stars: value, p_body: body });
    await refresh();
    setStars(''); setBody('');
  });
  return <View style={{ gap: 8 }}>
    {rating && <ProfileText>{rating.total ? rating.average + ' out of 5 ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ' + rating.total + ' ratings' : 'No ratings yet'}</ProfileText>}
    {rows.map(row => <View key={row.id} style={{ gap: 4 }}>
      <ProfileText>{row.display_name} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· {row.stars}/5 {row.body}</ProfileText>
      {row.own && canReview && <ProfileButton label="Edit review" disabled={busy} onPress={() => { setStars(String(row.stars)); setBody(row.body); }} />}
      {row.own && <ProfileButton label="Remove review" danger disabled={busy} onPress={() => void save(null)} />}
    </View>)}
    {canReview && <>
      <ProfileField label="Stars (1ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ5)" value={stars} onChangeText={setStars} keyboardType="number-pad" maxLength={1} />
      <ProfileField label="Review (optional)" value={body} onChangeText={setBody} maxLength={2000} multiline />
      <ProfileButton label="Save review" disabled={busy || !/^[1-5]$/.test(stars)} onPress={() => void save(Number(stars))} />
    </>}
    {page > 0 && <ProfileButton label="Previous reviews" disabled={busy} onPress={() => setPage(page - 1)} />}
    {rows.length === 20 && <ProfileButton label="More reviews" disabled={busy} onPress={() => setPage(page + 1)} />}
    <ProfileMessage error text={error} />
  </View>;
}

export function EventFeedback({ event }: { event: string }) {
  const [rows, setRows] = useState<{ id: string; body: string }[]>([]);
  const [page, setPage] = useState(0);
  const { busy, error, run } = useAction();
  const refresh = useCallback(async () => {
    setRows(await communityRpc('list_event_feedback', { p_event: event, p_offset: page * 20 }));
  }, [event, page]);
  useEffect(() => { void run(refresh); }, [refresh, run]);
  return <View style={{ gap: 8 }}>
    <ProfileText>Visible to you and the event organizers.</ProfileText>
    {rows.map(row => <ProfileText key={row.id}>{row.body}</ProfileText>)}
    {page > 0 && <ProfileButton label="Previous feedback" disabled={busy} onPress={() => setPage(page - 1)} />}
    {rows.length === 20 && <ProfileButton label="More feedback" disabled={busy} onPress={() => setPage(page + 1)} />}
    <ProfileMessage error text={error} />
    <ClubTextAction label="Private feedback" submit={async body => {
      await communityRpc('send_event_feedback', { p_event: event, p_body: body });
      await refresh();
    }} />
  </View>;
}

type RestrictionTarget = { user_id: string; display_name: string; kind: string | null };

export function ClubRestrictions({ club, members = [], event }: { club: string; members?: ClubMember[]; event?: string }) {
  const [name, setName] = useState('');
  const [results, setResults] = useState<RestrictionTarget[]>([]);
  const [attendees, setAttendees] = useState<RestrictionTarget[]>([]);
  const [page, setPage] = useState(0);
  const { busy, error, run } = useAction();
  const search = useCallback(async (query: string) => {
    setResults(await communityRpc('find_club_restriction_targets', { p_club: club, p_name: query }));
    if (event) setAttendees(await communityRpc('list_club_restriction_attendees', { p_event: event, p_offset: page * 25 }));
  }, [club, event, page]);
  useEffect(() => { void run(() => search('')); }, [run, search]);
  const targets = new Map(members.filter(member => member.status === 'active' && member.role === 'member')
    .map(member => [member.user_id, { ...member, kind: null } as RestrictionTarget]));
  [...attendees, ...results].forEach(row => targets.set(row.user_id, row));
  return <View style={{ gap: 8 }}>
    <ProfileField label="Exact display name" value={name} onChangeText={setName} />
    {page > 0 && <ProfileButton label="Previous attendees" disabled={busy} onPress={() => setPage(page - 1)} />}
    {attendees.length === 25 && <ProfileButton label="More attendees" disabled={busy} onPress={() => setPage(page + 1)} />}
    <ProfileButton label="Search people" disabled={busy} onPress={() => void run(() => search(name))} />
    {[...targets.values()].map(row => <View key={row.user_id} style={{ gap: 4 }}>
      <ProfileText>{row.display_name || 'Club member'}{row.kind === 'visibility' ? ' ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· Event visibility ban' : row.kind === 'rsvp' ? ' ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· RSVP restricted' : ''}</ProfileText>
      {([['Restrict RSVPs', 'rsvp'], ['Hide club events', 'visibility'], ['Lift restriction', null]] as const)
        .filter(([, kind]) => kind !== row.kind).map(([label, kind]) =>
          <ProfileButton key={label} label={label} danger={kind !== null} disabled={busy} onPress={() => void run(async () => {
            await communityRpc('set_club_restriction', { p_club: club, p_user: row.user_id, p_kind: kind });
            await search(name);
          })} />)}
    </View>)}
    <ProfileMessage error text={error} />
  </View>;
}

export function ClubInvitations({ club, event }: { club: string; event: string }) {
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const { busy, error, run } = useAction();
  const refresh = useCallback(async () => {
    const [roster, invites] = await Promise.all([
      communityRpc<ClubMember[]>('list_club_members', { p_club: club, p_offset: page * 25 }),
      communityRpc<string[]>('list_club_event_invites', { p_event: event }),
    ]);
    setMembers(roster); setInvited(invites);
  }, [club, event, page]);
  useEffect(() => { void run(refresh); }, [refresh, run]);
  return <View style={{ gap: 8 }}>
    {members.filter(member => member.status === 'active' && member.role === 'member').map(member => {
      const selected = invited.includes(member.user_id);
      return <ProfileButton key={member.user_id} label={(selected ? 'Revoke invite for ' : 'Invite ') + member.display_name}
        disabled={busy} onPress={() => void run(async () => {
          await communityRpc('manage_club_invitation', { p_event: event, p_user: member.user_id, p_invite: !selected });
          await refresh();
        })} />;
    })}
    {page > 0 && <ProfileButton label="Previous members" disabled={busy} onPress={() => setPage(page - 1)} />}
    {members.length === 25 && <ProfileButton label="More members" disabled={busy} onPress={() => setPage(page + 1)} />}
    <ProfileMessage error text={error} />
  </View>;
}

export function EventReviews({ event }: { event: string }) {
  const [eligible, setEligible] = useState(false);
  const { error, run } = useAction();
  useEffect(() => {
    void run(async () => setEligible(await communityRpc('can_review_club_event', { p_event: event })));
  }, [event, run]);
  return <><ProfileMessage error text={error} /><ClubReviews event={event} canReview={eligible} /></>;
}
