/**
 * R8 (preview, 12 Nov, Seasons on a desk): a per-player table read "● The best in each measure." under it with nothing marked. The
 * table marks a measure only when one player leads it (`teamTable`: a tie, a measure with no better direction, or one player alone
 * marks nothing), so the legend and the table's caption say only what the table carries. The ↗ beside each name was W49's
 * (24d4392e64) and is not changed here. Synthetic ids only.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import { teamTable } from '../../../../../data/coachhelm-chat-thread';
import { STUDIO_SPECIMENS } from '../../../../../preview/fixtures-chat-studio';
import { Studio } from '..';

afterEach(cleanup);

type M = ToolEnvelope['measurements'][number];
const COLE = { kind: 'player' as const, id: 'player-1', label: 'Cole Bennett' };
const DYLAN = { kind: 'player' as const, id: 'player-2', label: 'Dylan Park' };

const m = (entity: M['entity'], metric_id: string, metric_label: string, value: number, unit: M['unit'], direction: M['direction']): M => ({
  metric_id,
  metric_label,
  unit,
  value,
  entity,
  window_start: null,
  window_end: null,
  as_of: '2026-11-12T00:00:00Z',
  sample_size: 8,
  sample_unit: 'rounds',
  coverage: 'complete',
  coverage_note: null,
  source: 'Team Stats page',
  method: 'team_stats_window',
  denominator: null,
  direction,
  benchmark: null,
});

const draw = (team: ReturnType<typeof teamTable>, size: 'full' | 'compact' = 'full') => {
  const { container } = render(<Studio part={{ kind: 'comparison', data: { label: 'Seasons', team } }} size={size} onAsk={() => undefined} />);
  return {
    dots: container.querySelectorAll('td .ch-aks-cmp__dot').length,
    foot: container.querySelector('.ch-aks-foot'),
    caption: container.querySelector('caption')?.textContent ?? '',
  };
};

describe('the legend under a players table says only what the table marks (R8)', () => {
  it('two players level on every measure: nothing marked, so no dot in the legend and no "best" in the caption', () => {
    const team = teamTable([
      m(COLE, 'avg', 'Scoring average', 74.2, 'score', 'lower_better'),
      m(DYLAN, 'avg', 'Scoring average', 74.2, 'score', 'lower_better'),
      m(COLE, 'gir', 'Greens in regulation', 0.5, 'percent', 'higher_better'),
      m(DYLAN, 'gir', 'Greens in regulation', 0.5, 'percent', 'higher_better'),
    ]);
    expect(team.best).toEqual([null, null]);
    for (const size of ['full', 'compact'] as const) {
      const { dots, foot, caption } = draw(team, size);
      expect(dots).toBe(0);
      // Nothing else to say beneath it either: no empty footer is left behind.
      expect(foot).toBeNull();
      expect(caption).toBe('2 players across 2 measures.');
      cleanup();
    }
  });

  it('a measure with no better direction marks nothing; the strokes gained note stands on its own', () => {
    const team = teamTable([
      m(COLE, 'sg_putt', 'Strokes gained putting', -0.4, 'strokes', null),
      m(DYLAN, 'sg_putt', 'Strokes gained putting', -1.1, 'strokes', null),
    ]);
    expect(team.best).toEqual([null]);
    const { dots, foot, caption } = draw(team);
    expect(dots).toBe(0);
    expect(foot!.querySelector('.ch-aks-cmp__dot')).toBeNull();
    expect(foot!.textContent).toBe('Strokes gained is against the baseline.');
    expect(caption).not.toMatch(/best/);
  });

  it('one measure led, one level: the legend says the dot marks a measure one player leads', () => {
    const team = teamTable([
      m(COLE, 'avg', 'Scoring average', 73.1, 'score', 'lower_better'),
      m(DYLAN, 'avg', 'Scoring average', 74.6, 'score', 'lower_better'),
      m(COLE, 'gir', 'Greens in regulation', 0.5, 'percent', 'higher_better'),
      m(DYLAN, 'gir', 'Greens in regulation', 0.5, 'percent', 'higher_better'),
    ]);
    expect(team.best).toEqual([COLE.id, null]);
    const { dots, foot, caption } = draw(team);
    expect(dots).toBe(1);
    expect(foot!.querySelector('.ch-aks-cmp__dot')).not.toBeNull();
    expect(foot!.textContent!.trim()).toBe('The best in each measure one player leads.');
    expect(caption).toBe('2 players across 2 measures; the best is marked where one player leads.');
  });

  it('every measure led (the preview specimen): the legend and caption say so, as before', () => {
    const spec = STUDIO_SPECIMENS.find((s) => s.id === 'comparison')!;
    const { container } = render(<Studio part={spec.part} size="full" read={spec.read} onAsk={() => undefined} />);
    expect(container.querySelectorAll('td .ch-aks-cmp__dot').length).toBeGreaterThan(0);
    const foot = container.querySelector('.ch-aks-foot')!;
    expect(foot.querySelector('.ch-aks-cmp__dot')).not.toBeNull();
    expect(foot.textContent!.trim()).toBe('The best in each measure. Strokes gained is against the baseline.');
    expect(container.querySelector('caption')!.textContent).toMatch(/; the best in each is marked\.$/);
  });
});

describe('the comparison table draws its header rule across every column (WebKit, 12 Nov)', () => {
  it('borders are separate with no spacing: a collapsed half-pixel rule was drawn only under the sticky first cell', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-ask-studio.css'), 'utf8');
    const at = css.indexOf('.ch-aks-cmp__table {');
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toMatch(/border-collapse: separate;/);
    expect(rule).toMatch(/border-spacing: 0;/);
  });
});
