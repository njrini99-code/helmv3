// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_LIVE_NOW, PREVIEW_OWN_PLAYER_ID, PREVIEW_OWN_STATES } from '../../../preview/fixtures-live';
import type { LiveSnapshot } from '../../../live/model';
import { TeammatesLiveCard } from '../TeammatesLiveCard';

afterEach(cleanup);

const card = (snapshot: LiveSnapshot, playerId = PREVIEW_OWN_PLAYER_ID) => render(<TeammatesLiveCard initial={snapshot} playerId={playerId} frozen now={PREVIEW_LIVE_NOW} />);
const mates = PREVIEW_OWN_STATES.teammates!.snapshot;

describe('Player Home: Teammates on the course (CH-16682)', () => {
  it('titles the card by how many teammates are out, four lanes first, then See all', async () => {
    const { container } = card(mates);
    expect(screen.getByRole('heading', { name: 'Teammates on the course · 6' }).getAttribute('data-ch-code')).toBe('CH-16682');
    expect(container.querySelectorAll('.ch-lv-lane')).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: 'See all 6' }));
    expect(container.querySelectorAll('.ch-lv-lane')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull();
  });

  it('opens a read-only sheet: no Message, no qualifier link', async () => {
    card(mates);
    await userEvent.click(screen.getByRole('button', { name: /Sofia Reyes/ }));
    const sheet = document.querySelector<HTMLElement>('dialog.ch-modal[open]')!;
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toContain('Sofia Reyes');
    expect(sheet.textContent).not.toMatch(/Message|Open qualifier/);
  });

  it('is not drawn while the viewer has a round of their own on the course', () => {
    const own = mates.lanes[0]!;
    const { container } = card(mates, own.playerId);
    expect(container.firstChild).toBeNull();
  });

  it('is not drawn when no teammate shares with the team, or nobody is out', () => {
    expect(card({ ...mates, lanes: mates.lanes.map((l) => ({ ...l, share: 'coaches' as const })) }).container.firstChild).toBeNull();
    cleanup();
    expect(card({ ...mates, lanes: [] }).container.firstChild).toBeNull();
  });
});
