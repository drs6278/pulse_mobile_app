import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { communityRpc } from '@/lib/community';
import { Screen, TitleHeader } from './ui';
import { ProfileButton, ProfileMessage, ProfileText } from './profile/controls';

export default function ModerationScreen() {
  const [rows, setRows] = useState<{ id: string; reason: string; body: string; club?: boolean }[]>([]);
  const [allowed, setAllowed] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const access = await communityRpc<boolean>('community_moderator'); setAllowed(access); if (access) {
      const [comments, clubs] = await Promise.all([
        communityRpc<{ id: string; reason: string; body: string }[]>('list_comment_reports'),
        communityRpc<{ id: string; reason: string; name: string }[]>('list_club_reports'),
      ]);
      setRows([...comments, ...clubs.map(club => ({ ...club, body: club.name, club: true }))]);
    } } catch (e) { setError((e as Error).message); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function review(id: string, remove: boolean, club = false) { setBusy(true); try { await communityRpc(club ? 'moderate_club_report' : 'moderate_event_comment', { p_report: id, p_remove: remove }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <Screen header={<TitleHeader title="Moderation" />}><View style={{ padding: 16, gap: 16 }}><ProfileMessage error text={error} />{allowed ? <><ProfileButton label="Refresh reports" onPress={() => void load()} />{!rows.length && <ProfileText>No pending reports.</ProfileText>}{rows.map(row => <View key={row.id} style={{ gap: 12 }}><ProfileText>{row.reason}</ProfileText><ProfileText>{row.body || '[Deleted comment]'}</ProfileText><ProfileButton label={row.club ? "Remove reported club" : "Remove reported comment"} disabled={busy} onPress={() => void review(row.id, true, row.club)} /><ProfileButton label="Dismiss report" disabled={busy} onPress={() => void review(row.id, false, row.club)} /></View>)}</> : <ProfileText>Access is restricted to designated Pulse moderators.</ProfileText>}</View></Screen>;
}
