import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { communityRpc } from '@/lib/community';
import { Screen, TitleHeader } from './ui';
import { ProfileButton, ProfileMessage, ProfileText } from './profile/controls';

export default function ModerationScreen() {
  const [rows, setRows] = useState<{ id: string; reason: string; body: string }[]>([]);
  const [allowed, setAllowed] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const access = await communityRpc<boolean>('community_moderator'); setAllowed(access); if (access) setRows(await communityRpc('list_comment_reports')); } catch (e) { setError((e as Error).message); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function review(id: string, remove: boolean) { setBusy(true); try { await communityRpc('moderate_event_comment', { p_report: id, p_remove: remove }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <Screen header={<TitleHeader title="Moderation" />}><View style={{ padding: 16, gap: 16 }}><ProfileMessage error text={error} />{allowed ? <><ProfileButton label="Refresh reports" onPress={() => void load()} />{!rows.length && <ProfileText>No pending reports.</ProfileText>}{rows.map(row => <View key={row.id} style={{ gap: 12 }}><ProfileText>{row.reason}</ProfileText><ProfileText>{row.body || '[Deleted comment]'}</ProfileText><ProfileButton label="Remove reported comment" disabled={busy} onPress={() => void review(row.id, true)} /><ProfileButton label="Dismiss report" disabled={busy} onPress={() => void review(row.id, false)} /></View>)}</> : <ProfileText>Access is restricted to designated Pulse moderators.</ProfileText>}</View></Screen>;
}
