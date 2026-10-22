import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The coach Board after the design call (D2, D4; chs-31 to chs-34): the path line as the card's second line, in its fixed grammar,
 * from the engine's cause or the honest fallback, never the placeholder cause; narrowing chips only from a stored narrowing; the
 * pulse as one collapsed header line; a player with no read as a By player row; and no pill, meter, gauge or drill well.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));

import type { InsightCause, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { withoutPlaceholderCause } from '@/lib/coachhelm/reads/placeholder-cause';
import { toChInsight } from '../data/coachhelm-map';
import { NOT_TRACED_SHOT_BY_SHOT, pathLineFor, pathLineText } from '../data/coachhelm-path';
import type { ChCoachHelmData } from '../data/coachhelm-shape';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { HELM_PLAYERS, penalties, PREVIEW_HELM_COACH, PREVIEW_TOUR, slope } from '../preview/fixtures-coachhelm';
import { PREVIEW_HELM_COACH_FALLBACK, PREVIEW_HELM_COACH_NARROWING, PREVIEW_HELM_COACH_NO_READS, PREVIEW_HELM_COACH_PATH } from '../preview/fixtures-coachhelm-path';
import { ToastProvider } from '../ui/Toast';

afterEach(cleanup);

const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const okWrites = () => ({ assign: vi.fn(() => Promise.resolve({ success: true })), dismiss: vi.fn(() => Promise.resolve({ success: true })), undo: vi.fn(() => Promise.resolve({ success: true })) });
const show = (data: ChCoachHelmData) => render(wrap(<CoachBoard data={data} writes={okWrites()} />));
const card = () => document.querySelector('.ch-hl-focus') as HTMLElement;
const path = () => card().querySelector('[data-ch-code="CH-13940"]') as HTMLElement | null;
const flat = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');
const COACH = { role: 'coach', first: 'Eli' } as const;

const cause = (over: Partial<InsightCause>): InsightCause => ({
  state: 'not_traced',
  population: null,
  window: null,
  path: null,
  occurrences: null,
  denominator: null,
  distinct_rounds: null,
  example_holes: [],
  event_strokes: null,
  checked: { holes_with_full_record: 0, of: 0, fields_missing: [] },
  alternatives: [],
  data_gap: null,
  coach_override: null,
  ...over,
});
const withCause = (c: InsightCause, extra: Partial<InsightEvidence> = {}) => {
  const p = penalties(HELM_PLAYERS.eli.id);
  return { ...p, evidence: { ...p.evidence, cause: c, ...extra } };
};

describe('the path line (D2), from the stored evidence', () => {
  it('a counted cause path: what was seen in arrows · count of denominator · rounds · Seen in {First}’s shots', () => {
    const i = toChInsight(withCause(cause({ state: 'observed_sequence', population: 'penalties', path: ['driver off the tee', 'into the water'], occurrences: 5, denominator: 7, distinct_rounds: 4 })), { tour: PREVIEW_TOUR, viewer: COACH });
    expect(i.path?.tier).toBe('seen');
    expect(pathLineText(i.path!)).toBe('driver off the tee → into the water · 5 of 7 penalties · 4 rounds · Seen in Eli’s shots');
    // The player's own voice.
    const mine = toChInsight(withCause(cause({ state: 'observed_sequence', population: 'penalties', path: ['driver off the tee', 'into the water'], occurrences: 5, denominator: 7, distinct_rounds: 4 })), { tour: PREVIEW_TOUR, viewer: { role: 'player' } });
    expect(mine.path?.firmness).toBe('Seen in your shots');
  });

  it('the placeholder cause is never the line: the fallback is the symptom and the count, then "Not yet traced shot by shot"', () => {
    const i = toChInsight(penalties(HELM_PLAYERS.eli.id), { tour: PREVIEW_TOUR, viewer: COACH });
    expect(i.path?.tier).toBe('not_traced');
    expect(pathLineText(i.path!)).toBe(`Penalties per round · 21 rounds · ${NOT_TRACED_SHOT_BY_SHOT}`);
    expect(JSON.stringify(i)).not.toMatch(/off its benchmark|inferred from the aggregate/);
    // Production's template symptom names the college cohort: the measure stands in for it.
    const fallback = PREVIEW_HELM_COACH_FALLBACK.players.list[0]!.top.path!;
    expect(pathLineText(fallback)).toBe(`Penalties per round: 1.1 · 21 rounds · ${NOT_TRACED_SHOT_BY_SHOT}`);
  });

  it('a stored symptom is the fallback’s first part; one naming a college comparison is not used (Q-88)', () => {
    const p = penalties(HELM_PLAYERS.eli.id);
    const sym = (symptom: string) => flat(toChInsight({ ...p, evidence: { ...p.evidence, diagnosis: { ...p.evidence.diagnosis!, symptom } } }, { tour: PREVIEW_TOUR, viewer: COACH }).path!.seen);
    expect(sym('Greens hit from 50-125 yd: 55% over 20 approaches.')).toBe('Greens hit from 50–125 yd: 55% over 20 approaches');
    expect(sym('Penalties per Round: 1.1 vs College cohort avg 0.6')).toBe('Penalties per round: 1.1');
  });

  it('likely from the totals is the coach’s; a player is never shown an inferred cause (Q3) and keeps the fallback', () => {
    const likely = cause({ state: 'inferred_hypothesis', population: 'holes with a penalty', distinct_rounds: 6, alternatives: [{ label: 'Driver off the tee', lift: 2, arm_a: { n: 58, failures: 12, rate: 12 / 58 }, arm_b: { n: 62, failures: 6, rate: 6 / 62 }, lower_bound: 0.01, upper_bound: 0.2 }] });
    const coach = toChInsight(withCause(likely), { tour: PREVIEW_TOUR, viewer: COACH });
    expect(pathLineText(coach.path!)).toBe('Driver off the tee · 12 of 58 · 6 rounds · Likely, not yet traced');
    const player = toChInsight(withCause(likely), { tour: PREVIEW_TOUR, viewer: { role: 'player' } });
    expect(player.path?.firmness).toBe(NOT_TRACED_SHOT_BY_SHOT);
  });

  it('shot records that did not load, a count-down, and a read older than the newest round each say so in words', () => {
    expect(toChInsight(withCause(cause({ not_traced_reason: 'load_failed' })), { tour: PREVIEW_TOUR, viewer: COACH }).path?.firmness).toBe('Shot records could not be read this run');
    const cd = toChInsight(withCause(cause({ population: 'penalties', not_traced_reason: 'count_down', count_down: { need_events: 10, need_rounds: 3, have_events: 2, have_rounds: 1 } })), { tour: PREVIEW_TOUR, viewer: COACH });
    expect(pathLineText(cd.path!)).toBe('Penalties per round · 2 of the 10 penalties it needs · 1 round of 3 · Not yet traced');
    const stale = toChInsight({ ...penalties(HELM_PLAYERS.eli.id), metadata: { last_refreshed_at: '2026-09-01T00:00:00Z' } }, { tour: PREVIEW_TOUR, viewer: COACH, newestRound: '2026-09-30' });
    expect(stale.path).toMatchObject({ tier: 'out_of_date', firmness: 'Out of date' });
  });

  it('never a percent of confidence and never "because"', () => {
    for (const d of [PREVIEW_HELM_COACH_PATH, PREVIEW_HELM_COACH_FALLBACK, PREVIEW_HELM_COACH_NARROWING]) {
      for (const p of d.players.list) {
        const t = p.top.path ? pathLineText(p.top.path) : '';
        expect(t).not.toMatch(/\bbecause\b|caused/i);
        expect(t).not.toMatch(/\d+%\s*(confiden|sure)/i);
      }
    }
  });

  it('narrowing chips come only from a stored narrowing; none is made up', () => {
    const narrowed = PREVIEW_HELM_COACH_NARROWING.players.list[0]!.top.path!;
    expect(narrowed.narrowing).toEqual(['175+ yd', 'long par 4s', 'short-right']);
    expect(toChInsight(penalties(HELM_PLAYERS.eli.id), { tour: PREVIEW_TOUR, viewer: COACH }).path?.narrowing).toBeNull();
    // Nothing stored to say what was seen: no line, rather than a made-up one.
    const bare = penalties('x').evidence;
    expect(pathLineFor({ ...bare, diagnosis: undefined }, { sample: '', measured: '', stale: false })).toBeNull();
  });

  it('a note states no finding and has no path', () => {
    expect(pathLineFor(slope('x').evidence, { sample: '75 putts', measured: 'x', stale: false, note: true })).toBeNull();
  });

  it('the placeholder is taken out of a longer text in both spellings, and the rest stays', () => {
    expect(withoutPlaceholderCause('You average 1.1. Penalties per Round is off its benchmark. Likely cause inferred from the aggregate, not a measured shot sequence. Keep going.')).toBe('You average 1.1. Keep going.');
    expect(withoutPlaceholderCause('Greens is off its benchmark — likely cause inferred from the aggregate, not a measured shot sequence')).toBe('');
    expect(withoutPlaceholderCause('Nothing to take out here.')).toBe('Nothing to take out here.');
  });
});

describe('the coach Board, on screen', () => {
  it('the path line is the card’s second line, inside the green head, right under the claim', () => {
    show(PREVIEW_HELM_COACH_PATH);
    const head = card().querySelector('.ch-hl-focus__head')!;
    const kids = [...head.children].map((el) => el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(' ')[0]}` : ''));
    expect(kids.slice(0, 3)).toEqual(['p.ch-hl-focus__k', 'h2', 'div.ch-hl-path']);
    expect(flat(path()!.textContent)).toBe('driver off the tee → into the water · 5 of 7 penalties · 4 rounds · Seen in Eli’s shots');
  });

  it('a row carrying the template cause renders "Not yet traced" and the measure, and never the template string', () => {
    show(PREVIEW_HELM_COACH_FALLBACK);
    expect(flat(path()!.textContent)).toBe(`Penalties per round: 1.1 · 21 rounds · ${NOT_TRACED_SHOT_BY_SHOT}`);
    expect(document.body.textContent).not.toMatch(/off its benchmark|inferred from the aggregate/);
  });

  it('narrowing chips under the path line, prefixed "Observed, not a cause:"', () => {
    show(PREVIEW_HELM_COACH_NARROWING);
    const chips = [...card().querySelectorAll('.ch-hl-path__chip')].map((c) => flat(c.textContent));
    expect(chips).toEqual(['175+ yd', '›long par 4s', '›short-right']);
    expect(card().querySelector('.ch-hl-path__n')!.textContent).toMatch(/^Observed, not a cause:/);
    expect(flat(path()!.querySelector('.ch-hl-path__l')!.textContent)).toBe('Green missed on long par 4s · 12 of 16 · 9 rounds · Likely, not yet traced');
  });

  it('every card on the board has a path line', () => {
    show(PREVIEW_HELM_COACH);
    for (const p of PREVIEW_HELM_COACH.players.list) expect(p.top.kind === 'note' || p.top.path !== null).toBe(true);
    expect(path()).not.toBeNull();
  });

  it('chs-33: no pill, no meter, no gauge and no drill well on the card; This week is flush', () => {
    show(PREVIEW_HELM_COACH);
    const c = card();
    for (const gone of ['.ch-hl-pri', '.ch-hl-conf', '.ch-hl-g', '.ch-hl-g__t', '.ch-hl-drill']) expect(c.querySelector(gone)).toBeNull();
    const jonah = PREVIEW_HELM_COACH.players.list.find((p) => p.id === HELM_PLAYERS.jonah.id)!;
    cleanup();
    render(wrap(<CoachBoard data={PREVIEW_HELM_COACH} writes={okWrites()} initialPlayer={jonah.id} />));
    const week = card().querySelector('.ch-hl-week')!;
    expect(week.textContent).toMatch(/^This week Downhill ladder · 12 min · intermediate/);
    expect(within(card()).getByText('Solid read')).toBeTruthy();
  });

  it('D4: nothing above By player but the header; the pulse is one collapsed line in it, and Team patterns sit under the board', () => {
    show(PREVIEW_HELM_COACH);
    const main = document.querySelector('main.ch-hl') as HTMLElement;
    const order = [...main.children].map((el) => String(el.className).split(' ')[0]);
    const head = order.indexOf('ch-hl-h');
    const grid = order.indexOf('ch-hl-cgrid');
    expect(head).toBeGreaterThanOrEqual(0);
    expect(grid).toBe(head + 1);
    expect(within(main.querySelector('.ch-hl-h') as HTMLElement).getByRole('button', { name: /Since you were last here/ }).getAttribute('aria-expanded')).toBe('false');
    expect(main.querySelectorAll('.ch-hl-since li')).toHaveLength(3);
  });

  it('chs-34: a player with no read is a By player row, the named first and the rest as one row; there is no footer', () => {
    show(PREVIEW_HELM_COACH_NO_READS);
    const list = screen.getByRole('region', { name: 'By player' });
    const none = [...list.querySelectorAll('.ch-hl-pl.is-none')].map((r) => r.textContent);
    expect(none).toEqual(['SWSam WhitfieldNo reads yet', '+11 more playerNo reads yet']);
    expect(screen.queryByText(/no insights yet/)).toBeNull();
  });

  it('the player’s own board draws the same path line, in their voice, with no inferred cause', () => {
    const mine = toChInsight(penalties(HELM_PLAYERS.jonah.id), { tour: PREVIEW_TOUR, viewer: { role: 'player' } });
    render(wrap(<PlayerBoard data={{ off: null, proposals: { list: [], error: false }, insights: { list: [mine], error: false }, rounds: null }} />));
    expect(flat(path()!.textContent)).toBe(`Penalties per round · 21 rounds · ${NOT_TRACED_SHOT_BY_SHOT}`);
  });
});
