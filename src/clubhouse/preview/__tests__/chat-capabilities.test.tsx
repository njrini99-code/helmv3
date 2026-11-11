// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewChatCapabilities } from '../PreviewChatCapabilities';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => '/clubhouse-preview/coachhelm-capabilities', useSearchParams: () => new URLSearchParams() }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const badge = () => document.querySelector('.ch-akg-card__hd .ch-badge')!.textContent;
const step = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('the capabilities gallery · Play runs the real sequence at real timing', () => {
  it('Confirm, the request, 8 seconds of hold, saved', () => {
    render(<PreviewChatCapabilities task="create_task" />);
    expect(badge()).toBe('Draft');
    fireEvent.click(screen.getByRole('button', { name: 'Assign task' }));
    expect(screen.getByRole('button', { name: 'Assigning…' })).toBeTruthy();
    step(700);
    expect(badge()).toBe('Holding');
    expect(screen.getByText(/Not saved yet\. Saves in 8 seconds, then 4 people are told\./)).toBeTruthy();
    // No check, and no "saved", while the write is held.
    expect(document.querySelector('.ch-akg-mark')).toBeNull();
    step(3000);
    expect(screen.getByText(/Saves in 5 seconds/)).toBeTruthy();
    step(5100);
    expect(screen.getByText('Saving…')).toBeTruthy();
    step(600);
    expect(badge()).toBe('Assigned');
    expect(document.querySelector('.ch-akg-mark[data-tone="ok"]')).toBeTruthy();
    expect(screen.getByText('Told 4 in the app')).toBeTruthy();
    expect(screen.getByText('Sent to 4 players, in the app')).toBeTruthy();
  });

  it('Undo at 3 seconds: nothing saved, nobody told, and it can be put back', () => {
    render(<PreviewChatCapabilities task="create_team_announcement" play="undo" />);
    // Play presses Confirm by itself after a beat; each step is its own render.
    step(1400);
    step(700);
    expect(badge()).toBe('Holding');
    step(3100);
    step(500);
    expect(badge()).toBe('Undone');
    expect(screen.getByText('Undone. Nothing was posted.')).toBeTruthy();
    expect(document.querySelector('.ch-akc-reach .ch-badge')!.textContent).toBe('Not sent');
    fireEvent.click(screen.getByRole('button', { name: 'Put it back' }));
    expect(badge()).toBe('Draft');
  });

  it('a lock writes on the press: no hold and no Undo', () => {
    render(<PreviewChatCapabilities task="lock_lineup" />);
    fireEvent.click(screen.getByRole('button', { name: 'Lock the lineup' }));
    step(700);
    expect(badge()).toBe('Locked');
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('opens on the state its address names', () => {
    render(<PreviewChatCapabilities task="send_event_reminder" state="failed" density="compact" />);
    expect(badge()).toBe('Not sent');
    expect(screen.getByRole('alert').textContent).toContain('Ask for the reminder again.');
    expect(document.querySelector('[data-ch-card-body="send_event_reminder"]')!.getAttribute('data-density')).toBe('compact');
    // That failure is not safe to repeat, so there is no Try again.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
