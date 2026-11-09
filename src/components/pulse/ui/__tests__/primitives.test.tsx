import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ActionSheet } from '../action-sheet';
import { Button, IconButton } from '../button';
import { ChipGroup } from '../chip-group';
import { ListRow } from '../surfaces';
import { TextField } from '../text-field';
import { VoteControl } from '../vote-control';

jest.mock('expo-router', () => ({ Link: ({ children }: { children: ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

describe('Button', () => {
  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([{ disabled: true }, { loading: true }])('ignores presses when %j', state => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} {...state} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save', disabled: true }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders as a link when given an href', () => {
    render(<Button label="Add entry" href="/calendar" icon="add" />);
    expect(screen.getByRole('link', { name: 'Add entry' })).toBeTruthy();
  });
});

describe('IconButton', () => {
  it('shows a capped badge and keeps its label', () => {
    render(<IconButton icon="bell" label="Notifications" badge={120} onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
  });
});

describe('TextField', () => {
  it('reports changes and keeps caller focus handlers', () => {
    const onChangeText = jest.fn(), onFocus = jest.fn(), onBlur = jest.fn();
    render(<TextField label="Title" value="" onChangeText={onChangeText} onFocus={onFocus} onBlur={onBlur} />);
    const input = screen.getByLabelText('Title');
    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'Pick up');
    fireEvent(input, 'blur');
    expect(onChangeText).toHaveBeenCalledWith('Pick up');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('announces errors', () => {
    render(<TextField label="Title" error="Required" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('can hide the visible label without losing the accessible name', () => {
    render(<TextField label="Email" hideLabel />);
    expect(screen.queryByText('Email')).toBeNull();
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});

describe('ChipGroup', () => {
  it('behaves as a radio group by default', () => {
    const onSelect = jest.fn();
    render(<ChipGroup title="Date" options={['Today', 'Tomorrow']} selected={['Today']} onSelect={onSelect} />);
    expect(screen.getByRole('radio', { name: 'Date: Today', checked: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: 'Date: Tomorrow', checked: false }));
    expect(onSelect).toHaveBeenCalledWith('Tomorrow');
  });

  it('uses checkboxes and custom labels when multiple', () => {
    render(<ChipGroup title="Age" multiple options={[0, 18]} selected={[0, 18]} onSelect={() => {}} formatLabel={age => age ? `${age}+` : 'All ages'} formatAccessibilityLabel={age => age ? `${age} and older` : 'All ages'} />);
    expect(screen.getByRole('checkbox', { name: '18 and older', checked: true })).toBeTruthy();
    expect(screen.getByText('18+')).toBeTruthy();
  });

  it('blocks selection when disabled', () => {
    const onSelect = jest.fn();
    render(<ChipGroup title="Date" disabled options={['Today']} selected={[]} onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Date: Today' }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('ListRow', () => {
  it('combines label and detail for screen readers', () => {
    render(<ListRow href="/settings" label="Account" detail="Security" icon="account" />);
    expect(screen.getByRole('link', { name: 'Account. Security' })).toBeTruthy();
  });

  it('acts as a button without an href', () => {
    const onPress = jest.fn();
    render(<ListRow label="Sign out" onPress={onPress} danger />);
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('VoteControl', () => {
  it('shows the score and reports direction', () => {
    const onVote = jest.fn();
    render(<VoteControl score={3} myVote={1} onVote={onVote} />);
    expect(screen.getByText('3 points')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upvote', selected: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Downvote' }));
    expect(onVote).toHaveBeenCalledWith(-1);
  });

  it('ignores votes while disabled', () => {
    const onVote = jest.fn();
    render(<VoteControl score={0} myVote={0} disabled onVote={onVote} />);
    fireEvent.press(screen.getByRole('button', { name: 'Upvote' }));
    expect(onVote).not.toHaveBeenCalled();
  });
});

describe('ActionSheet', () => {
  it('renders nothing while hidden', () => {
    render(<ActionSheet visible={false} actions={[{ label: 'Report', onPress: () => {} }]} onClose={() => {}} />);
    expect(screen.queryByText('Report')).toBeNull();
  });

  it('closes before running the chosen action', () => {
    const calls: string[] = [];
    render(<ActionSheet visible actions={[{ label: 'Report', onPress: () => calls.push('action') }]} onClose={() => calls.push('close')} />);
    fireEvent.press(screen.getByRole('button', { name: 'Report' }));
    expect(calls).toEqual(['close', 'action']);
  });

  it('can be dismissed by tapping the backdrop', () => {
    const onClose = jest.fn();
    render(<ActionSheet visible actions={[]} onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('Close menu', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps screen readers inside the sheet, with Cancel as the way out', () => {
    const onClose = jest.fn();
    render(<ActionSheet visible actions={[]} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
