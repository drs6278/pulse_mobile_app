import { useCallback, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useFocusEffect, usePathname } from 'expo-router';
import { useProfile } from '@/providers/profile-provider';
import { Screen, TitleHeader } from '../ui';
import { ProfileButton, ProfileLink, ProfileLoading, ProfileMessage, ProfileText, profileStyles as S } from './controls';
import { SignOutButton } from './my-profile-screen';

export function AccountBoundary({ children }: PropsWithChildren) {
  const { data, loading, error, refresh } = useProfile();
  const pathname = usePathname();
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  if (data?.private.account_state === 'active') return children;
  if (data?.private.account_state === 'suspended' && ['/delete-account', '/settings', '/change-password'].includes(pathname)) return children;
  return <Screen header={<TitleHeader title="Pulse account" />}><View style={S.content}>
    {loading ? <ProfileLoading label="Checking account" /> : error ? <><ProfileMessage text={error} error /><ProfileButton label="Try again" onPress={refresh} /></> : <><ProfileText title>{data?.private.account_state === 'deleting' ? 'Deletion requested' : 'Account unavailable'}</ProfileText><ProfileText muted>{data?.private.account_state === 'deleting' ? 'Your account is locked. Deletion normally completes within 24 hours.' : 'This account is unavailable. Contact the Pulse team if you believe this is a mistake.'}</ProfileText></>}
    {!loading && <SignOutButton />}
    {data?.private.account_state === 'suspended' && <ProfileLink href="/delete-account" label="Delete my account" />}
  </View></Screen>;
}
