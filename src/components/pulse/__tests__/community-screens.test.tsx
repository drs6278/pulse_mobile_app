import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { EventEditorScreen } from '../community-screens';
const mockRPC = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();
const mockData = { community: { clubs: [], memberships: [], events: [] }, event: null };
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/community', () => ({ ...jest.requireActual<typeof import('@/lib/community')>('@/lib/community'), rpc: (...args: unknown[]) => mockRPC(...args) }));
jest.mock('@/providers/events-provider', () => ({ useEvents: () => ({ refresh: mockRefresh }) }));
jest.mock('@/hooks/use-user-resource', () => ({ useUserResource: () => ({ data: mockData, userId: 'alice', loading:false, error:null, refresh:jest.fn(), mutate:async (op: (id: string) => Promise<unknown>)=>op('alice') }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { replace: (...args: unknown[]) => mockReplace(...args) } }));
jest.mock('../ui', () => {
 const { View, Text } = jest.requireActual<typeof import('react-native')>('react-native');
 return { Screen: ({children}: {children:React.ReactNode})=><View>{children}</View>, TitleHeader:()=>null, PulseText:({children}: {children:React.ReactNode})=><Text>{children}</Text> };
});
beforeEach(()=>{mockRPC.mockReset();mockReplace.mockReset();mockRefresh.mockReset();});
function fill(screen: ReturnType<typeof render>) {
 for(const [label,value] of [['Title','Chess night'],['Location','Library'],['Timezone','UTC'],['Start (YYYY-MM-DDTHH:mm)','2026-11-01T17:00'],['End (YYYY-MM-DDTHH:mm)','2026-11-01T18:00']]) fireEvent.changeText(screen.getByLabelText(label),value);
}
test('validates before publishing, preserves input after server failure, and retries explicitly',async()=>{
 mockRPC.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce('event-1');
 const screen=render(<EventEditorScreen />);
 fireEvent.press(screen.getByLabelText('Publish event'));
 await waitFor(()=>expect(screen.getByText(/valid start and end/)).toBeTruthy());
 expect(mockRPC).not.toHaveBeenCalled();
 fill(screen); fireEvent.press(screen.getByLabelText('Publish event'));
 await waitFor(()=>expect(screen.getByText('Connection interrupted')).toBeTruthy());
 expect(screen.getByLabelText('Title').props.value).toBe('Chess night');
 fireEvent.press(screen.getByLabelText('Publish event'));
 await waitFor(()=>expect(mockReplace).toHaveBeenCalledWith({pathname:'/edit-event',params:{id:'event-1'}}));
 expect(mockRPC).toHaveBeenLastCalledWith('save_event',expect.objectContaining({p_id:null,p_draft:expect.objectContaining({pulse_status:'published',pulse_visibility:'public'})}));
});
test('saving a draft does not publish it',async()=>{
 mockRPC.mockResolvedValue('draft-1'); const screen=render(<EventEditorScreen />); fill(screen);
 fireEvent.press(screen.getByLabelText('Save draft'));
 await waitFor(()=>expect(mockRPC).toHaveBeenCalledWith('save_event',expect.objectContaining({p_draft:expect.objectContaining({pulse_status:'draft'})})));
});
