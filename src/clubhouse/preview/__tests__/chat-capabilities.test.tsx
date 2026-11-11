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
    expect(screen.getByText('Sent to 4 players: a notice in the app')).toBeTruthy();
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

describe('the capabilities gallery · the plates', () => {
  it('several cards: Play approves the safe ones together, holds them for one window, and leaves the lock waiting', () => {
    render(<PreviewChatCapabilities task="batch" />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve these 3' }));
    step(700);
    expect(screen.getByText('Not saved yet. All 3 save in 8 seconds.')).toBeTruthy();
    expect([...document.querySelectorAll('.ch-akg-card')].map((c) => c.getAttribute('data-phase'))).toEqual(['held', 'held', 'held', 'proposed']);
    step(8100);
    expect(screen.getByText('All 3 saved')).toBeTruthy();
    expect([...document.querySelectorAll('.ch-akg-card')].map((c) => c.getAttribute('data-phase'))).toEqual(['saved', 'saved', 'saved', 'proposed']);
  });

  it('the workspace: a still frame names the step that is running and how far it has got', () => {
    render(<PreviewChatCapabilities task="workspace:team" state="3" />);
    const island = document.querySelector('.ch-isl')!;
    expect(island.textContent).toContain('Reading every player’s rounds');
    expect(island.textContent).toMatch(/\d+ rounds and counting/);
    expect(island.textContent).toContain('Read the roster');
    // No tool name, anywhere in it.
    expect(island.textContent).not.toMatch(/get_|code_execution|compare_players/);
  });

  it('the studio: a specimen by its deep link, and what a tap would ask', () => {
    render(<PreviewChatCapabilities task="studio:qualifier_board" density="compact" />);
    expect(document.querySelector('[data-studio="qualifier_board"]')).toBeTruthy();
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-ask-ref]')!);
    expect(screen.getByRole('status').textContent).toContain('Ask about this: Eli Brandt in Fall qualifier');
  });

  it('edit mode: Confirm is held while the form is open, and the re-planned card closes it', () => {
    render(<PreviewChatCapabilities task="create_event" />);
    const edit = screen.queryByRole('button', { name: /^Edit/ });
    if (!edit) throw new Error('create_event has no editable field in its fixture');
    fireEvent.click(edit);
    expect(screen.getByText('Update or discard your changes first.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add to calendar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
