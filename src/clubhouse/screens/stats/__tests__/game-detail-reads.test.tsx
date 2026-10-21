// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Game detail's "CoachHelm sees…" line (P005, spec D build A): one line per section that has current reads, under its rule, in the
 * same third-person words for a coach and a player, linking to the Deep dive; nothing at zero or off; one CH-5214 line on failure.
 */

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import type { ChStatsReads } from '../../../data/stats-reads';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_READS, PREVIEW_READS_FAILED, PREVIEW_SELF_READS } from '../../../preview/fixtures-stats';
import { GameDetail } from '../GameDetail';
import { readsLine } from '../reads-line';

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

const stats = PREVIEW_PLAYER.stats!;
const draw = (reads: ChStatsReads | undefined, opts: { phone?: boolean; first?: string } = {}) =>
  render(
    <div className="ch-root" data-ui="clubhouse">
      <GameDetail s={stats} x={PREVIEW_PLAYER.extra} bench={PREVIEW_PLAYER.bench} first={opts.first ?? 'Jonah'} rounds={PREVIEW_PLAYER.win.rounds} window={PREVIEW_PLAYER.window} reads={reads} phone={opts.phone} />
    </div>,
  );
const lineIn = (id: string) => document.querySelector(`#gm-${id} .ch-gm__id .ch-gm__reads`);
const lines = () => [...document.querySelectorAll('.ch-gm__reads')];

describe('a line per section, with its counts', () => {
  it('draws under the rule of each section that has reads, and none where there are none', () => {
    draw(PREVIEW_PLAYER_READS);
    expect(lines()).toHaveLength(3);
    expect(lineIn('approach')?.textContent).toBe('CoachHelm sees 2 reads costing strokes on approach and 1 working. Deep dive →');
    expect(lineIn('tee')?.textContent).toBe('CoachHelm sees 1 read costing strokes off the tee. Deep dive →');
    expect(lineIn('putting')?.textContent).toBe('CoachHelm sees 1 read working on the greens. Deep dive →');
    expect(lineIn('scoring')).toBeNull();
    expect(lineIn('short')).toBeNull();
    // Directly under the section's rule line.
    expect(lineIn('approach')?.previousElementSibling?.className).toContain('ch-gx-rule');
    // The counts are figures.
    expect([...lineIn('approach')!.querySelectorAll('.ch-num')].map((n) => n.textContent)).toEqual(['2', '1']);
  });

  it('never says "0 reads": a zero count draws nothing, and singular and plural agree', () => {
    expect(readsLine('scoring', { costing: 0, working: 0 })).toBeNull();
    expect(readsLine('scoring', { costing: 1, working: 1 })).toBe('CoachHelm sees 1 read costing strokes in scoring and 1 working.');
    expect(readsLine('short', { costing: 3, working: 0 })).toBe('CoachHelm sees 3 reads costing strokes around the green.');
    expect(readsLine('putting', { costing: 0, working: 2 })).toBe('CoachHelm sees 2 reads working on the greens.');
    draw({ status: 'ready', byArea: {} });
    expect(lines()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\b0 reads?\b/);
  });

  it('links to the coach’s Deep dive of the player, on the read only where the section has exactly one', () => {
    draw(PREVIEW_PLAYER_READS);
    const href = (id: string) => lineIn(id)?.querySelector('a')?.getAttribute('href');
    expect(href('approach')).toBe('/golf/dashboard/coachhelm?view=deep-dive&player=jonah');
    expect(href('approach')).not.toContain('insight=');
    expect(href('tee')).toBe('/golf/dashboard/coachhelm?view=deep-dive&player=jonah&insight=in-fw');
    // The sentence and the link are one link.
    expect(lineIn('tee')?.querySelectorAll('a')).toHaveLength(1);
  });

  it('is in the same third-person words for the player reading their own stats: no you or your', () => {
    draw(PREVIEW_SELF_READS, { first: 'You' });
    expect(lines()).toHaveLength(3);
    for (const l of lines()) expect(l.textContent).not.toMatch(/\b(you|your)\b/i);
    expect(lineIn('tee')?.querySelector('a')?.getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=deep-dive&insight=in-fw');
  });
});

describe('off and failed', () => {
  it('off, or no reads handed in, draws nothing', () => {
    draw({ status: 'off' });
    expect(lines()).toHaveLength(0);
    expect(document.querySelector('[data-ch-code="CH-5214"]')).toBeNull();
    cleanup();
    draw(undefined);
    expect(lines()).toHaveLength(0);
  });

  it('failed draws one CH-5214 line under the section chips, and no section line', () => {
    draw(PREVIEW_READS_FAILED);
    const failed = document.querySelectorAll('[data-ch-code="CH-5214"]');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.className).toBe('ch-gx-rule');
    expect(failed[0]!.previousElementSibling?.className).toBe('ch-gd__nav');
    expect(failed[0]!.textContent).toBe('CoachHelm’s reads didn’t load, so the sections don’t say how many there are. Try again in a moment.');
    expect(lines()).toHaveLength(0);
  });
});

describe('the phone', () => {
  it('shows the line only in the chosen section', () => {
    draw(PREVIEW_PLAYER_READS, { phone: true });
    // Scoring is shown first and has no reads.
    expect(lines()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Approach' }));
    expect(lines()).toHaveLength(1);
    expect(lineIn('approach')?.textContent).toContain('CoachHelm sees 2 reads costing strokes on approach and 1 working.');
    fireEvent.click(screen.getByRole('button', { name: 'Short game' }));
    expect(lines()).toHaveLength(0);
  });
});
