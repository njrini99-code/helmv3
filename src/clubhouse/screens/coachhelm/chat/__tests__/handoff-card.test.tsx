import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { takePrefill } from '../../../messages/prefill';
import { HandoffCard } from '../parts/HandoffCard';

/** W-QC-12, W-ASK-19: without a hold a message request ends in "Open in Messages": the draft lands there, sends nothing, and never rides in the address. */

const DRAFT = 'Eli, how is the wrist after physio?';

beforeEach(() => {
  router.push.mockClear();
  window.sessionStorage.clear();
});
afterEach(() => cleanup());

describe('HandoffCard', () => {
  it('opens Messages from a prefill holding the draft, with the words out of the URL', async () => {
    render(<HandoffCard handoff={{ title: 'Message Eli', players: ['p-eli'], draft: DRAFT } as never} />);
    expect(screen.getByText('Nothing is sent until you tap Send.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Open in Messages' }));
    expect(router.push).toHaveBeenCalledTimes(1);
    const href = router.push.mock.calls[0]?.[0] as string;
    expect(href).toMatch(/^\/golf\/dashboard\/messages\?prefill=/);
    expect(href).not.toContain('wrist');
    expect(takePrefill(new URL(href, 'https://x.test').searchParams)).toMatchObject({ players: ['p-eli'], draft: DRAFT });
  });

  it('with nobody to write to it goes nowhere', async () => {
    render(<HandoffCard handoff={{ title: 'Message', players: [], draft: DRAFT } as never} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open in Messages' }));
    expect(router.push).not.toHaveBeenCalled();
  });
});
