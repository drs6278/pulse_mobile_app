import { View } from 'react-native';
import { Screen, TitleHeader } from '../ui';
import { useProfile } from '@/providers/profile-provider';
import { useEvents } from '@/providers/events-provider';
import { useRSVPs } from '@/providers/rsvp-provider';
import type { OwnProfile } from '@/lib/profile/types';
import { ProfileButton, ProfileLoading, ProfileMessage, profileStyles as S } from './controls';
import { ProfileForm } from './profile-form';

export default function EditProfileScreen() {
  const resource = useProfile();
  return <Screen header={<TitleHeader title="Edit profile" />}>
    {!resource.data?.public ? <View style={S.content}>{resource.loading ? <ProfileLoading /> : <><ProfileMessage text={resource.error || 'Profile unavailable.'} error /><ProfileButton label="Try again" onPress={resource.refresh} /></>}</View> : <ProfileEditor key={resource.data.public.user_id} initial={resource.data} />}
  </Screen>;
}

export function ProfileEditor({ initial }: { initial: OwnProfile }) {
  const { refresh: refreshEvents } = useEvents();
  const { refresh: refreshRSVPs } = useRSVPs();
  return <ProfileForm initial={initial} onSaved={() => { refreshEvents(); refreshRSVPs(); }} />;
}
