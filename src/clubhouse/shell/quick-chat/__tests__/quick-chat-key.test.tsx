import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
const session = vi.hoisted(() => vi.fn((_: { open: boolean }) => null));
vi.mock('../QuickChatSession', () => ({ default: (p: { open: boolean }) => session(p) }));
vi.mock('../../../preview/PreviewQuickChat', () => ({ default: () => null }));
vi.mock('../../AskSheet', async () => {
  const React = await import('react');
  return {
    AskSheetContext: React.createContext(null),
    lookingAt: () => 'Looking at Calendar',
  };
});

import { ClubhouseMarker } from '../../context';
import { HelmKey, QuickChatProvider } from '../QuickChatProvider';

const CAL = '/golf/dashboard/calendar';

const Slot = HelmKey;
const show = (role: 'coach' | 'player', opts: { provider?: boolean; enabled?: boolean; pathname?: string } = {}) => {
  const { provider = true, enabled = true, pathname = CAL } = opts;
  return render(
    <ClubhouseMarker role={role}>
      {provider ? (
        <QuickChatProvider pathname={pathname} search="" enabled={enabled}>
          <Slot />
        </QuickChatProvider>
      ) : (
        <Slot />
      )}
    </ClubhouseMarker>,
  );
};
const key = () => document.querySelector<HTMLElement>('[data-ch-qc-key]');

beforeEach(() => session.mockClear());
afterEach(cleanup);

/** Quick chat AC-QC-KEY-07 and 08: SHARED-8 and SHARED-11. */
describe('who gets the key', () => {
    it('a player: no key node, no session, and ⌘J does nothing', async () => {
    show('player');
    expect(key()).toBeNull();
    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(session).not.toHaveBeenCalled();
  });

  it('a coach the gate didn’t pass: no key', () => {
    show('coach', { enabled: false });
    expect(key()).toBeNull();
  });

  it('a coach: the key, named, closed', () => {
    show('coach');
    expect(key()!.getAttribute('aria-label')).toBe('CoachHelm');
    expect(key()!.getAttribute('aria-expanded')).toBe('false');
    expect(key()!.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('says what it is, beside the mark, and its name is what it says', () => {
    show('coach');
    expect(key()!.querySelector('.hkey__label')!.textContent).toBe('CoachHelm');
    expect(key()!.getAttribute('aria-label')).toContain(key()!.querySelector('.hkey__label')!.textContent!);
  });

  it('on CoachHelm itself: hidden, as today’s key is', () => {
    show('coach', { pathname: '/golf/dashboard/coachhelm' });
    expect(key()).toBeNull();
  });

  it('nothing loads until the key is warmed: no session on a page that never touches it', async () => {
    show('coach');
    await act(async () => {
      await Promise.resolve();
    });
    expect(session).not.toHaveBeenCalled();
  });
});

describe('opening', () => {
  it('a press opens it, a second closes; closing never unmounts the session', async () => {
    show('coach');
    await act(async () => {
      fireEvent.click(key()!);
    });
    expect(key()!.getAttribute('aria-expanded')).toBe('true');
    expect(key()!.classList.contains('is-on')).toBe(true);
    await vi.waitFor(() => expect(session).toHaveBeenCalled());
    expect(session.mock.lastCall![0].open).toBe(true);
    await act(async () => {
      fireEvent.click(key()!);
    });
    expect(key()!.getAttribute('aria-expanded')).toBe('false');
    expect(session.mock.lastCall![0].open).toBe(false);
  });

  it('⌘J and Ctrl+J toggle; a plain J does not', async () => {
    show('coach');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'j' });
    });
    expect(key()!.getAttribute('aria-expanded')).toBe('false');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'j', metaKey: true });
    });
    expect(key()!.getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'J', ctrlKey: true });
    });
    expect(key()!.getAttribute('aria-expanded')).toBe('false');
  });

  it('⌘J typing in another field leaves it alone', async () => {
    render(
      <ClubhouseMarker {...{ role: 'coach' as const }}>
        <QuickChatProvider pathname={CAL} search="" enabled>
          <Slot />
          <input aria-label="elsewhere" />
        </QuickChatProvider>
      </ClubhouseMarker>,
    );
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'elsewhere' }), { key: 'j', metaKey: true });
    });
    expect(key()!.getAttribute('aria-expanded')).toBe('false');
  });
});

/** AC-QC-HEL-03, CP-QC-10. */
