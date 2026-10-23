import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Screen } from '../ui';
import type { OwnProfile } from '@/lib/profile/types';
import { ProfileLink, ProfileText, profileStyles as S } from './controls';
import { SignOutButton } from './my-profile-screen';
import { ProfileForm } from './profile-form';

export function SetupProfileScreen({ initial }: { initial: OwnProfile }) {
  return <Screen header={<View style={S.content}><ProfileText title>Set up your profile</ProfileText></View>} scroll={false}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={S.content}><ProfileText>Choose a display name and an age eligibility option to start using Pulse. Your bio and photo are optional.</ProfileText></View>
        <ProfileForm initial={initial} setup />
        <View style={S.content}><SignOutButton /><ProfileLink href="/delete-account" label="Delete my account" /></View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Screen>;
}
