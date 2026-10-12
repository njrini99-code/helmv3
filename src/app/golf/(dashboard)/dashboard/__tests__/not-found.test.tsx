import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The dashboard 404: Clubhouse's page empty (CH-1306) for a Clubhouse user, Fairway's for everyone else. */

const gate = vi.hoisted(() => ({ isClubhouseFor: vi.fn() }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: gate.isClubhouseFor }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session.current }));

import GolfDashboardNotFound from '../not-found';

async function draw() {
  render(await GolfDashboardNotFound());
}

beforeEach(() => {
  gate.isClubhouseFor.mockReset();
});

describe('dashboard not-found', () => {
  it('CH-1306 a Clubhouse coach sees Clubhouse’s page empty with the way back to Home, and no Fairway markup', async () => {
    session.current = { userId: 'u', role: 'coach', coach: { id: 'c' }, player: null };
    gate.isClubhouseFor.mockResolvedValue(true);
    await draw();
    expect(gate.isClubhouseFor).toHaveBeenCalledWith('coach');
    const page = document.querySelector('[data-ch-code="CH-1306"]')!;
    expect(page).not.toBeNull();
    expect(page.className).toContain('ch-empty-page');
    expect(screen.getByRole('heading', { name: 'We couldn’t find that' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Home' }).getAttribute('href')).toBe('/golf/dashboard');
    expect(screen.queryByRole('link', { name: 'Back to dashboard' })).toBeNull();
  });

  it('CH-1306 a Clubhouse player gets the same page', async () => {
    session.current = { userId: 'u', role: 'player', coach: null, player: { id: 'p' } };
    gate.isClubhouseFor.mockResolvedValue(true);
    await draw();
    expect(gate.isClubhouseFor).toHaveBeenCalledWith('player');
    expect(document.querySelector('[data-ch-code="CH-1306"]')).not.toBeNull();
  });

  it('off Clubhouse (or when the gate throws) it stays the Fairway 404 with its role-aware links', async () => {
    session.current = { userId: 'u', role: 'coach', coach: { id: 'c' }, player: null };
    gate.isClubhouseFor.mockRejectedValue(new Error('flag read failed'));
    await draw();
    expect(document.querySelector('[data-ch-code="CH-1306"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to dashboard' }).getAttribute('href')).toBe('/golf/dashboard');
    expect(screen.getByRole('link', { name: 'Back to roster' })).toBeTruthy();
  });
});
