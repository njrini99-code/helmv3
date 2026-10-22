import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

/**
 * The roster's CoachHelm block and strokes-by-leg line (P003, spec D build B), in the desktop panel and the phone profile: the
 * counts the Board counts, "No reads yet", View insights, CH-3212 dashes when they did not load, the leg that loses (or gains) the
 * most, and the Development counts as a link to the player's Development tab.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ updatePlayerStatus: vi.fn(), setPlayerAvailability: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));

import type { ChRosterHelm, ChRosterPlayer } from '../../../data/roster';
import { PREVIEW_ROSTER, PREVIEW_ROSTER_HELM } from '../../../preview/fixtures-roster';
import { clearPeople } from '../../../shell/command/people';
import { ToastProvider } from '../../../ui/Toast';
import { legsCaption } from '../format';
import { RosterPeek } from '../RosterPeek';
import { RosterProfile } from '../RosterProfile';

const control = { set: vi.fn(), pending: false };
const player = (id: string) => PREVIEW_ROSTER.players.find((p) => p.id === id)!;
const jonah = player('jonah');

const peek = (p: ChRosterPlayer, helm: ChRosterHelm) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <RosterPeek p={p} notesLocked={false} onClose={vi.fn()} onNoteSaved={vi.fn()} availability={control} helm={helm} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
const profile = (p: ChRosterPlayer, helm: ChRosterHelm) =>
  render(
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <RosterProfile p={p} notesLocked={false} statsError={false} onNoteSaved={vi.fn()} availability={control} helm={helm} />
      </div>
    </ToastProvider>,
  );
/** The CoachHelm part of the panel: the section whose heading is "CoachHelm". */
const block = () => screen.getByText('CoachHelm', { selector: 'b' }).closest('.ch-rs-peek__sec, .ch-rsm-panel') as HTMLElement;

beforeEach(() => {
  clearPeople();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('the CoachHelm block in the panel', () => {
  it('says what CoachHelm reads in the player’s rounds, the counts as figures, and View insights to the coach’s Deep dive', () => {
    peek(jonah, PREVIEW_ROSTER_HELM);
    const b = block();
    expect(b.textContent).toContain('What it reads in Jonah’s rounds');
    expect(b.querySelector('.ch-rs-peek__dev')?.textContent).toContain('3 costing strokes · 1 working');
    expect([...b.querySelectorAll('.ch-num')].map((n) => n.textContent)).toEqual(['3', '1']);
    expect(within(b).getByRole('link', { name: /View insights/ }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=deep-dive&player=jonah');
    expect(b.textContent).not.toMatch(/\b(you|your)\b/i);
  });

  it('sits after Development and before Availability', () => {
    peek(jonah, PREVIEW_ROSTER_HELM);
    const heads = [...document.querySelectorAll('.ch-rs-peek__l b')].map((b) => b.textContent);
    expect(heads.indexOf('CoachHelm')).toBe(heads.indexOf('Development') + 1);
    expect(heads.indexOf('Availability')).toBe(heads.indexOf('CoachHelm') + 1);
  });

  it('"No reads yet" for a player with no current read, with the link still there', () => {
    peek(player('luca'), PREVIEW_ROSTER_HELM);
    expect(block().textContent).toContain('No reads yet');
    expect(block().textContent).not.toMatch(/\b0\b/);
    expect(within(block()).getByRole('link', { name: /View insights/ })).toBeTruthy();
  });

  it('is not drawn when CoachHelm is off for the coach', () => {
    peek(jonah, { status: 'off' });
    expect(screen.queryByText('CoachHelm', { selector: 'b' })).toBeNull();
  });

  it('dashes, CH-3212 and "Didn’t load. Refresh to try again." when the counts did not load', () => {
    peek(jonah, { status: 'failed' });
    const b = block();
    expect(b.querySelector('[data-ch-code="CH-3212"]')?.textContent).toContain('— costing strokes · — working');
    expect(b.textContent).toContain('Didn’t load. Refresh to try again.');
  });

  it('the Development counts link to the player’s Development tab', () => {
    peek(jonah, PREVIEW_ROSTER_HELM);
    const dev = screen.getByText('Development', { selector: 'b' }).closest('.ch-rs-peek__sec')!;
    expect(within(dev as HTMLElement).getByRole('link').getAttribute('href')).toBe('/golf/dashboard/stats?player=jonah&tab=dev');
  });
});

describe('the strokes-by-leg line under the figures', () => {
  it('names the leg that loses the most, in a true minus and the loss ink', () => {
    peek(jonah, PREVIEW_ROSTER_HELM);
    const legs = document.querySelector('.ch-rs-peek__figs + .ch-rs-peek__legs')!;
    expect(legs.textContent).toBe('Loses most putting, −1.1 a round');
    expect(legs.querySelector('.is-loss')?.textContent).toBe('−1.1');
  });

  it('with no leg losing, says it gains in every leg and where most', () => {
    peek(player('theo'), PREVIEW_ROSTER_HELM);
    const legs = document.querySelector('.ch-rs-peek__legs')!;
    expect(legs.textContent).toBe('Gains in every leg; most on approach, +0.6');
    expect(legs.querySelector('.is-gain')).toBeTruthy();
  });

  it('nothing when every leg is null, or with no strokes gained for the season', () => {
    peek(player('luca'), PREVIEW_ROSTER_HELM);
    expect(document.querySelector('.ch-rs-peek__legs')).toBeNull();
    expect(legsCaption({ sgPerRound: null, sgLegs: jonah.sgLegs })).toBeNull();
    expect(legsCaption({ sgPerRound: 0.2, sgLegs: { tee: null, approach: 0.3, around: null, putting: 0.1 } })).toEqual({ lead: 'Gains most on approach, ', figure: '+0.3', tail: '', tone: 'gain' });
    expect(legsCaption({ sgPerRound: -0.5, sgLegs: { tee: -0.8, approach: 0.1, around: null, putting: 0.2 } })?.lead).toBe('Loses most off the tee, ');
  });
});

describe('the same on the phone profile', () => {
  it('a CoachHelm panel after Recent rounds with the counts and View insights, and the legs under the figures', () => {
    profile(jonah, PREVIEW_ROSTER_HELM);
    const b = block();
    expect(b.className).toContain('ch-rsm-panel');
    expect(b.previousElementSibling?.querySelector('b')?.textContent).toBe('Recent rounds');
    expect(b.textContent).toContain('3 costing strokes · 1 working');
    expect(within(b).getByRole('link', { name: /View insights/ }).className).toContain('ch-rsm-panel__link');
    expect(document.querySelector('.ch-rsm-figs + .ch-rs-peek__legs')?.textContent).toBe('Loses most putting, −1.1 a round');
  });

  it('off draws no panel; failed draws the CH-3212 dashes and caption; no reads says so', () => {
    profile(jonah, { status: 'off' });
    expect(screen.queryByText('CoachHelm', { selector: 'b' })).toBeNull();
    cleanup();
    profile(jonah, { status: 'failed' });
    expect(block().querySelector('[data-ch-code="CH-3212"]')).toBeTruthy();
    expect(block().textContent).toContain('Didn’t load. Refresh to try again.');
    cleanup();
    profile(player('mia'), PREVIEW_ROSTER_HELM);
    expect(block().textContent).toContain('No reads yet');
  });
});
