/**
 * MAC-03 (production audit 2026-11-15): Home's Add event and its quick chips open the event editor on Home instead of
 * leaving for Calendar; with no inputs they go to Calendar's `?new=1` as before, and a modified click stays a link.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { push: vi.fn(), refresh: vi.fn() };
const inputs = vi.fn();
const editor = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/dynamic', () => ({ default: () => (props: Record<string, unknown>) => editor(props) }));
vi.mock('../../../data/event-editor-inputs', () => ({ getEventEditorInputs: () => inputs() }));
vi.mock('../HomeEventEditor', () => ({ HomeEventEditor: () => null }));
vi.mock('../../../lib/track', () => ({ chTrail: vi.fn() }));

import { NewEventLink } from '../NewEventLink';

const INPUTS = { events: [], people: [], peopleError: false, timezone: 'America/New_York', today: '2026-11-16', nowHour: 9, tournamentsEnabled: false, teamId: 't1' };

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  inputs.mockReset();
  editor.mockReset();
  editor.mockReturnValue(<div role="dialog" aria-label="New event" />);
});

describe('Home: new event in place (MAC-03)', () => {
  it('opens the editor on Home with the chip type, and never leaves for Calendar', async () => {
    inputs.mockResolvedValue(INPUTS);
    const onTap = vi.fn();
    render(<NewEventLink href="/golf/dashboard/calendar?new=1&type=qualifier" type="qualifier" className="x" onTap={onTap}>Qualifier</NewEventLink>);
    await userEvent.click(screen.getByRole('link', { name: 'Qualifier' }));
    await screen.findByRole('dialog', { name: 'New event' }, { timeout: 15000 });
    expect(router.push).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(editor.mock.calls.at(-1)![0]).toMatchObject({ seed: { event: null, type: 'qualifier' }, inputs: INPUTS });
    expect(inputs).toHaveBeenCalledTimes(1);
  });

  it('hands the editor one seed for the whole opening, so a later render cannot reset what the coach typed', async () => {
    inputs.mockResolvedValue(INPUTS);
    const { rerender } = render(<NewEventLink href="/golf/dashboard/calendar?new=1" className="x">Add event</NewEventLink>);
    await userEvent.click(screen.getByRole('link', { name: 'Add event' }));
    await screen.findByRole('dialog', undefined, { timeout: 15000 });
    const first = (editor.mock.calls.at(-1)![0] as { seed: unknown }).seed;
    rerender(<NewEventLink href="/golf/dashboard/calendar?new=1" className="y">Add event</NewEventLink>);
    expect((editor.mock.calls.at(-1)![0] as { seed: unknown }).seed).toBe(first);
  });

  it('goes to Calendar as before when the inputs do not come (not a coach, a failed read)', async () => {
    inputs.mockResolvedValue(null);
    render(<NewEventLink href="/golf/dashboard/calendar?new=1" className="x">Add event</NewEventLink>);
    await userEvent.click(screen.getByRole('link', { name: 'Add event' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/golf/dashboard/calendar?new=1'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a saved event refreshes Home and the next open reads the week again', async () => {
    inputs.mockResolvedValue(INPUTS);
    render(<NewEventLink href="/golf/dashboard/calendar?new=1" className="x">Add event</NewEventLink>);
    await userEvent.click(screen.getByRole('link', { name: 'Add event' }));
    await screen.findByRole('dialog', undefined, { timeout: 15000 });
    const { onSaved } = editor.mock.calls.at(-1)![0] as { onSaved: () => void };
    onSaved();
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('link', { name: 'Add event' }));
    await waitFor(() => expect(inputs).toHaveBeenCalledTimes(2));
  });
});
