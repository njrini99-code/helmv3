import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { projectInsightForPlayer } from '@/lib/coachhelm/delivery/player-projection';
import { computeGap } from '@/lib/coachhelm/v3/support/gap';
import {
  auditOf,
  causeOf,
  ENGINE_OFF,
  rangeWords,
  shapeReadsLifecycle,
  supportOf,
  targetLine,
  verdictOf,
  watchingLine,
  type ChEngineFlags,
} from '../data/coachhelm-engine-shape';
import { toChInsight } from '../data/coachhelm-map';
import type { ChViewer } from '../data/coachhelm-voice';
import { bigNumber, breakBias, penalties, PREVIEW_TOUR, slope } from '../preview/fixtures-coachhelm';
import {
  ENGINE_BIG,
  ENGINE_BREAK,
  ENGINE_CLEARED,
  ENGINE_NOW,
  ENGINE_ON,
  ENGINE_PENALTIES,
  ENGINE_PENALTIES_COUNTED,
  ENGINE_SLOPE,
  focusDidNotMove,
  focusTooEarly,
  focusWorked,
  PREVIEW_DIVE_ENGINE,
  PREVIEW_HELM_COACH_ENGINE,
  PREVIEW_HELM_PLAYER_ENGINE,
} from '../preview/fixtures-coachhelm-engine';
import { ClearedLines, EngineState, WhyAudit } from '../screens/coachhelm/EngineState';

/** CoachHelm surfaces A: what the engine now knows, drawn on the Clubhouse coach surfaces, each part behind its own flag. */

const COACH: ChViewer = { role: 'coach', first: 'Jonah' };
const PLAYER: ChViewer = { role: 'player' };
const card = (raw: EvidenceInsight, viewer: ChViewer, flags: ChEngineFlags, extra: Parameters<typeof toChInsight>[1] = {}) =>
  toChInsight(raw, { tour: PREVIEW_TOUR, viewer, ...extra, engine: { flags, now: ENGINE_NOW, ...(extra.engine ?? {}) } });

afterEach(cleanup);

describe('every flag off', () => {
  it('leaves the card exactly as it was, even on a row that carries every engine field', () => {
    const raw = ENGINE_SLOPE(slope('pl-jonah'));
    const before = toChInsight(raw, { tour: PREVIEW_TOUR, viewer: COACH });
    const off = card(raw, COACH, ENGINE_OFF, { engine: { flags: ENGINE_OFF, now: ENGINE_NOW, focus: focusWorked('in-slope') } });
    expect(off).toEqual(before);
    expect('engine' in off).toBe(false);
  });

  it('leaves a list untouched by the lifecycle shaping', () => {
    const rows = [ENGINE_CLEARED('pl-jonah'), slope('pl-jonah')];
    const shaped = shapeReadsLifecycle(rows, false, PLAYER, ENGINE_NOW);
    expect(shaped.kept).toEqual(rows);
    expect(shaped.cleared).toEqual([]);
  });

  it('draws nothing from an empty engine', () => {
    const { container } = render(<EngineState engine={undefined} />);
    expect(container).toBeEmptyDOMElement();
    render(<WhyAudit lines={undefined} />);
    render(<ClearedLines lines={[]} />);
    expect(screen.queryByText('Why do you think so?')).toBeNull();
    expect(screen.queryByText('Cleared')).toBeNull();
  });
});

describe('older rows', () => {
  it('draws nothing new for a row written before the engine slices, with every flag on', () => {
    const c = card(slope('pl-jonah'), COACH, ENGINE_ON);
    expect(c.engine?.support).toBeUndefined();
    expect(c.engine?.cause).toBeUndefined();
    expect(c.engine?.lifecycle).toBeUndefined();
    expect(c.engine?.verdict).toBeUndefined();
  });
});

describe('CH-13990 support (coachhelm_support_v1)', () => {
  it('gives a coach the ladder word and the range in words, never a percent or the q value', () => {
    const s = supportOf(ENGINE_SLOPE(slope('p')).evidence, COACH)!;
    expect(s.word).toBe('Observed');
    expect(s.range).toBe('Somewhere between 3 and 43 points worse than the comparison.');
    expect(s.range).not.toMatch(/%|q\b|0\.04/);
    expect(s.watching).toBeNull();
  });

  it('never gives a player the support pass, even when the row carries it', () => {
    expect(supportOf(ENGINE_SLOPE(slope('p')).evidence, PLAYER)).toBeNull();
    // and the player feed has already dropped it
    expect(supportOf(projectInsightForPlayer(ENGINE_SLOPE(slope('p'))).evidence, COACH)).toBeNull();
  });

  it('says a range that crosses zero may be no gap, and a strength is better', () => {
    expect(rangeWords({ range_lo: -10, range_hi: 39, gap_unit: 'pct_points' })).toBe('Somewhere between 10 points better and 39 points worse, so it may be no gap at all.');
    expect(rangeWords({ range_lo: -5, range_hi: -1, gap_unit: 'pct_points' })).toBe('Somewhere between 1 and 5 points better than the comparison.');
    expect(rangeWords({ range_lo: 0.1, range_hi: 0.9, gap_unit: 'per_round' })).toBe('Somewhere between 0.1 and 0.9 a round worse than the comparison.');
    expect(rangeWords({})).toBeNull();
  });

  it('says a pct_points range as stored: computeGap already works in percentage points, so it is never rescaled', () => {
    const g = computeGap({ kind: 'proportion', k: 10, n: 31, benchmark: 0.55, polarity: 'higher_better' })!;
    expect(g.gap_unit).toBe('pct_points');
    expect(g.range_hi).toBeGreaterThan(1);
    const words = rangeWords(g as unknown as Record<string, unknown>)!;
    expect(words).toBe(`Somewhere between ${Math.round(Math.abs(g.range_lo))} and ${Math.round(Math.abs(g.range_hi))} points worse than the comparison.`);
    expect(words).not.toMatch(/\d{3,} points/);
    expect(rangeWords({ range_lo: 3, range_hi: 43, gap_unit: 'pct_points' })).toBe('Somewhere between 3 and 43 points worse than the comparison.');
  });

  it('turns Not enough yet into the Watching count-down', () => {
    const s = supportOf(ENGINE_BREAK(breakBias('p')).evidence, COACH)!;
    expect(s.word).toBe('Not enough yet');
    expect(s.watching).toBe('Watching: 28 attempts so far. 12 more and this read can say something.');
    expect(watchingLine({ n: 30, floor: 20, rounds_n: 2, round_floor: 3 }, [])).toBe('Watching: 2 rounds so far. 1 more and this read can say something.');
    expect(watchingLine({ testable: false }, ['untestable:no_sample'])).toMatch(/could not be tested/);
  });
});

describe('CH-13993 cause (coachhelm_root_cause_diagnosis)', () => {
  it('says a counted path as a sequence with its counts', () => {
    const c = causeOf(ENGINE_PENALTIES_COUNTED(penalties('p')).evidence, PLAYER)!;
    expect(c).toEqual({ state: 'counted', word: 'Counted', line: '5 of 7 penalties went driver off the tee, then into the water, across 4 rounds.' });
  });

  it('shows a coach a likely cause with both arms, and a player never', () => {
    const ev = ENGINE_PENALTIES(penalties('p')).evidence;
    const coach = causeOf(ev, COACH)!;
    expect(coach.state).toBe('likely');
    expect(coach.line).toBe('Driver off the tee: 12 of 58 (21%) against 6 of 62 (10%) otherwise. Not yet a counted sequence.');
    expect(causeOf(ev, PLAYER)!.state).toBe('not_traced');
  });

  it('says exactly why a cause is not traced: a data gap with the tags to go, or a count-down', () => {
    expect(causeOf(ENGINE_SLOPE(slope('p')).evidence, PLAYER)).toEqual({
      state: 'not_traced',
      word: 'Data gap',
      line: 'The miss side is recorded on only 4 of the missed downhill putts from 4–6 ft. Tag it on the next 10 and the why is checked again.',
    });
    expect(causeOf(ENGINE_BREAK(breakBias('p')).evidence, PLAYER)!.line).toBe('6 of the 10 missed left-to-right putts it needs; 4 more missed left-to-right putts and the why is checked.');
  });

  it('is absent on a row with no cause state', () => {
    expect(causeOf(slope('p').evidence, COACH)).toBeNull();
  });
});

describe('CH-13992 lifecycle (coachhelm_recheck_v1)', () => {
  it('moves a Cleared read out of the list into one line', () => {
    const rows = [slope('pl-j'), ENGINE_CLEARED('pl-j')];
    const shaped = shapeReadsLifecycle(rows, true, PLAYER, ENGINE_NOW);
    expect(shaped.kept.map((r) => r.id)).toEqual(['in-slope']);
    expect(shaped.cleared).toEqual(['4–6 ft putts · Cleared — 22 of your last 29 (76%). That one’s fixed. It stays here for two more checks so we’re sure.'.replace(/’/g, "'")]);
  });

  it('draws a Contradicted pair as one item, on its higher-ranked read', () => {
    const coach = PREVIEW_HELM_COACH_ENGINE.players.list.find((p) => p.id === 'pl-eli')!;
    expect(coach.top.engine?.lifecycle?.word).toBe('Contradicted');
    expect(coach.top.engine?.lifecycle?.pair?.with).toBe('Driver off the tee gains 0.15 a hole');
    expect(coach.top.engine?.lifecycle?.pair?.lines.join(' ')).toMatch(/5 of 7 penalties in the last 9 rounds came right after a driver tee shot/);
    const player = PREVIEW_HELM_PLAYER_ENGINE.insights.list;
    expect(player.some((i) => i.id === 'in-tee')).toBe(false);
  });

  it('keeps Contradicted from a player for the coach’s first day', () => {
    const rows = [ENGINE_PENALTIES_COUNTED(penalties('p')), bigNumber('p', 'in-tee')].map((r, i) =>
      i === 0
        ? { ...r, evidence: { ...r.evidence, conflict: { with_insight_id: 'in-tee', kind: 'opposing_strategy', role: 'paired', net_strokes: 0.9, resolution: 'net_favours_driver', subject: 'driver_vs_penalties', computed_at: ENGINE_NOW } } }
        : { ...r, evidence: { ...r.evidence, conflict: { with_insight_id: 'in-pen', kind: 'opposing_strategy', role: 'paired', net_strokes: 0.9, resolution: 'net_favours_driver', subject: 'driver_vs_penalties', computed_at: ENGINE_NOW } } },
    ) as EvidenceInsight[];
    const shaped = shapeReadsLifecycle(rows, true, PLAYER, ENGINE_NOW);
    expect(shaped.kept).toHaveLength(2);
    expect([...shaped.byId.values()].some((l) => l.word === 'Contradicted')).toBe(false);
    expect(shapeReadsLifecycle(rows, true, COACH, ENGINE_NOW).kept).toHaveLength(1);
  });

  it('marks Under review without hiding the read', () => {
    const shaped = shapeReadsLifecycle([ENGINE_BREAK(breakBias('p'))], true, COACH, ENGINE_NOW);
    expect(shaped.kept).toHaveLength(1);
    expect(shaped.byId.get('in-brk')?.word).toBe('Under review');
  });
});

describe('verdicts (coachhelm_verdicts_v1)', () => {
  it('uses the Slice 4 copy: both numbers and the regression line, in each voice', () => {
    const coach = verdictOf(focusWorked('x'), '4–6 ft putts', 'putts', COACH, ENGINE_NOW)!;
    expect(coach.word).toBe('Worked');
    expect(coach.line).toBe('4–6 ft putts · Worked — 31 of 42 (74%) against 18 of 31 (58%) before. Expected without coaching: about 64% (bounce-back). Lower bound 65% clears it. Target was 70%.');
    expect(coach.target).toBe('Target: 70% or better over 40 putts.');
    const player = verdictOf(focusWorked('x'), '4–6 ft putts', 'putts', PLAYER, ENGINE_NOW)!;
    expect(player.line).toMatch(/^Worked\. 31 of 42 \(74%\), up from 58%\./);
    expect(verdictOf(focusDidNotMove('x'), 'l', 'putts', COACH, ENGINE_NOW)!.word).toBe('Did not move');
  });

  it('is Too early with its target before the horizon, and absent with no focus area', () => {
    expect(verdictOf(focusTooEarly('x'), 'l', 'putts', COACH, ENGINE_NOW)).toEqual({ word: 'Too early', tone: 'plain', line: null, target: 'Target: 70% or better over 40 putts.' });
    expect(verdictOf(null, 'l', 'putts', COACH, ENGINE_NOW)).toBeNull();
    expect(targetLine(null, null, 'putts')).toBeNull();
  });

  it('keeps Got worse from a player for the coach’s first day', () => {
    const worse = { ...focusWorked('x'), verdict: { ...(focusWorked('x').verdict as object), word: 'got_worse', computed_at: ENGINE_NOW } };
    expect(verdictOf(worse, 'l', 'putts', COACH, ENGINE_NOW)!.word).toBe('Got worse');
    expect(verdictOf(worse, 'l', 'putts', PLAYER, ENGINE_NOW)!.word).toBe('Too early');
    expect(verdictOf(worse, 'l', 'putts', PLAYER, '2026-10-21T15:00:00Z')!.word).toBe('Got worse');
  });
});

describe('CH-13991 Why do you think so? (layout 6)', () => {
  it('gives a coach the six audit lines from the stored evidence', () => {
    const raw = ENGINE_SLOPE(slope('p'));
    const lines = auditOf(raw.evidence, COACH, { sample: '75 putts', comparison: 'No downhill penalty', cause: causeOf(raw.evidence, COACH) });
    expect(lines.map((l) => l.k)).toEqual(['Counted', 'Rounds', 'Compared with', 'Test', 'How sure', 'Why', 'Checked']);
    expect(lines.find((l) => l.k === 'Test')!.v).toBe('Two rates side by side. Somewhere between 3 and 43 points worse than the comparison. It holds up after checking 58 things this run.');
    expect(lines.find((l) => l.k === 'How sure')!.v).toMatch(/^Observed\. Seen in one window so far/);
  });

  it('gives a player only what their feed carries: no test and no rung', () => {
    const raw = projectInsightForPlayer(ENGINE_SLOPE(slope('p')));
    const lines = auditOf(raw.evidence, PLAYER, { sample: '75 putts', comparison: null, cause: causeOf(raw.evidence, PLAYER) });
    expect(lines.map((l) => l.k)).toEqual(['Counted', 'Rounds', 'Why']);
  });

  it('opens and closes on its disclosure, which names what it controls', async () => {
    const user = userEvent.setup();
    render(<WhyAudit lines={[{ k: 'Counted', v: '31 attempts' }]} />);
    const btn = screen.getByRole('button', { name: 'Why do you think so?' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('31 attempts')).not.toBeVisible();
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('31 attempts')).toBeVisible();
  });
});

describe('the surfaces', () => {
  it('draws the coach card’s states in words', () => {
    const jonah = PREVIEW_HELM_COACH_ENGINE.players.list.find((p) => p.id === 'pl-jonah')!;
    const { container } = render(<EngineState engine={jonah.top.engine} />);
    const list = container.querySelector('dl')! as HTMLElement;
    expect(within(list).getByText('Observed')).toBeInTheDocument();
    expect(within(list).getByText('Data gap')).toBeInTheDocument();
    expect(within(list).getByText('Worked')).toBeInTheDocument();
    expect(list.textContent).not.toMatch(/q =|0\.04/);
  });

  it('lists the Cleared reads under their heading', () => {
    render(<ClearedLines lines={PREVIEW_HELM_PLAYER_ENGINE.cleared} />);
    expect(screen.getByRole('region', { name: 'Cleared' })).toHaveTextContent('4–6 ft putts · Cleared');
  });

  it('gives the player’s Deep dive the cause, the verdict and the audit, and never the support pass', () => {
    const slopeRead = PREVIEW_DIVE_ENGINE.list.find((i) => i.base.id === 'in-slope')!;
    expect(slopeRead.base.engine?.cause?.word).toBe('Data gap');
    expect(slopeRead.base.engine?.verdict?.word).toBe('Worked');
    expect(slopeRead.base.engine?.support).toBeUndefined();
    expect(slopeRead.base.engine?.audit?.map((l) => l.k)).not.toContain('Test');
    expect(PREVIEW_DIVE_ENGINE.cleared).toHaveLength(1);
  });

  it('marks a strength Seen repeatedly for the coach', () => {
    const theo = PREVIEW_HELM_COACH_ENGINE.players.list.find((p) => p.id === 'pl-theo')!;
    expect(theo.top.engine?.support?.word).toBe('Seen repeatedly');
    expect(theo.cleared).toHaveLength(1);
    expect(ENGINE_BIG(bigNumber('p')).evidence).toBeTruthy();
  });
});
