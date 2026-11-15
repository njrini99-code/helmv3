import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import '../../../__tests__/dialog-polyfill';
import { ToastProvider } from '../../../ui/Toast';
import { FORMER_MEMBER, isFormerMember, type ChConv } from '../model';
import { Composer, type ChMessagesApi } from '../MessagesView';
import { convAvatarName } from '../shared/conv-ui';

/**
 * Coach audit 13 Nov 2026 (§6 Messages): two DMs from 11 Feb have, as the other person, an account with no player or coach
 * profile. The list said "Conversation member", the avatar "CM", the composer "Message Conversation". It reads "Former
 * member", and the thread is read-only: there is no one to reply to.
 */
const conv = (over: Partial<ChConv> = {}): ChConv => ({ id: 'c1', group: false, title: 'Ava Lindqvist', subtitle: '', memberIds: ['ava'], memberCount: 2, unread: 0, lastAt: null, lastSenderId: null, lastText: '', creatorId: null, ...over });
const api = {
  redesign: true,
  viewer: { userId: 'coach', role: 'coach', name: 'Maya Reyes' },
  now: '2026-11-13T15:00:00.000Z',
  timeZone: 'America/New_York',
  clock: '12',
  directory: [],
  msgs: [],
  reactions: new Map(),
  drafts: new Map(),
  onTyping: vi.fn(),
  send: vi.fn(async () => true),
  sendFiles: vi.fn(async () => true),
  edit: vi.fn(async () => true),
  polls: { create: vi.fn() },
} as unknown as ChMessagesApi;

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe('who is a former member', () => {
  it('the other person of a direct message with no profile and not in the team', () => {
    expect(isFormerMember({ group: false, other: { type: 'member' }, known: false })).toBe(true);
  });

  it('never someone the team still has, a coach or player profile, or a group', () => {
    expect(isFormerMember({ group: false, other: { type: 'member' }, known: true })).toBe(false);
    expect(isFormerMember({ group: false, other: { type: 'player' }, known: false })).toBe(false);
    expect(isFormerMember({ group: true, other: { type: 'member' }, known: false })).toBe(false);
    expect(isFormerMember({ group: false, other: null, known: false })).toBe(false);
  });

  it('is named "Former member", and its coin has no initials', () => {
    expect(FORMER_MEMBER).toBe('Former member');
    expect(convAvatarName({ title: FORMER_MEMBER, former: true })).toBe('');
    expect(convAvatarName({ title: 'Ava Lindqvist' })).toBe('Ava Lindqvist');
  });
});

describe('a conversation with a former member is read-only', () => {
  it('the composer says why and takes no message', () => {
    render(
      <ToastProvider>
        <div data-ch-ms-v2="">
          <Composer api={api} conv={conv({ title: FORMER_MEMBER, former: true })} />
        </div>
      </ToastProvider>,
    );
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(field.readOnly).toBe(true);
    expect(field.placeholder).not.toMatch(/Message Former/);
    expect(screen.getByText(/no longer on the team/)).toBeTruthy();
    fireEvent.change(field, { target: { value: 'hello' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(api.send).not.toHaveBeenCalled();
  });
});
