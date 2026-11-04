import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { diveCounts, toChDeepInsight, type ChDeepDive } from '../data/coachhelm-dive-shape';
import { toChInsight } from '../data/coachhelm-map';
import { READ_CALLS } from '../data/coachhelm-read-calls';
import { toChReadView, type ChReadView } from '../data/coachhelm-read-view-shape';
import { HELM_PLAYERS, PREVIEW_TOUR, breakBias, penalties, slope } from './fixtures-coachhelm';

/** What the engine stores beside a read: the same keys the real row has, so the shapers draw every card. */
const withDepth = (raw: EvidenceInsight, extra: Record<string, unknown>, movement: { from: number; to: number } | null): EvidenceInsight =>
  ({ ...raw, evidence: { ...raw.evidence, sample_n: 28, source_round_ids: ['r1', 'r2', 'r3', 'r4'], confidence_factors: { sample_adequacy: 1, factors_measured: true, recency: 0.8 }, ...extra }, metadata: { ...(raw.metadata as object | null), ...(movement ? { movement: { ...movement, direction: movement.to > movement.from ? 'up' : 'down' } } : {}) } }) as EvidenceInsight;
const NARROW = (steps: Array<[string, string]>) => ({ basis: { narrowing: { steps: steps.map(([label, statement]) => ({ passed: true, label, statement })), stopped_at: null }, checked: ['length: 16 of 28', 'par: long par 4s', 'shape: both sides'] } });
const LADDER = (team: number, tour: number) => ({ comparison: { lines: [{ source: 'team_pool', label: 'Team pool', value: team, n: 214, n_noun: 'putts', players: 9 }, { source: 'tour', label: 'Tour', value: tour }] } });

const RAW: Record<string, () => EvidenceInsight> = {
  approach: () =>
    withDepth(slope(HELM_PLAYERS.priya.id, 'in-approach'), { ...LADDER(49, 52), diagnosis: NARROW([['From 175+ yd', '16 of 28 approaches from 175+ yd missed the green'], ['On long par 4s', '12 of 20 came on long par 4s']]), cause: { state: 'likely', alternatives: [{ label: 'Long par 4s', lift: 2.1, arm_a: { n: 20, failures: 12 }, arm_b: { n: 40, failures: 11 } }] } }, { from: 34, to: 43 }),
  penalties: () =>
    withDepth(penalties(HELM_PLAYERS.eli.id, 'in-pen'), { ...LADDER(0.7, 0.3), diagnosis: NARROW([['Off the tee', '14 of 21 penalties came off the tee'], ['On par 4s', '9 of 14 came on par 4s']]), cause: { state: 'counted', path: ['Driver', 'Hazard right', 'Penalty drop'], occurrences: 9, denominator: 14, event_strokes: 18, checked: { holes_with_full_record: 280, of: 378 } } }, { from: 1.4, to: 1.1 }),
  putts: () =>
    withDepth(breakBias(HELM_PLAYERS.jonah.id, 'in-brk'), { ...LADDER(49, 52), diagnosis: NARROW([['Downhill', '12 of 23 downhill putts from 4–6 ft were missed']]), cause: { state: 'not_traced', count_down: { have_events: 6, need_events: 12, have_rounds: 3, need_rounds: 6 }, data_gap: { have_count: 6, target_count: 6, prompt: 'Track putts on 6 more greens' } } }, { from: 44, to: 49 }),
};

const OWNER = (q: string | undefined) => (q === 'penalties' ? HELM_PLAYERS.eli.name : q === 'putts' ? HELM_PLAYERS.jonah.name : HELM_PLAYERS.priya.name);
const ROUNDS = (playerId: string) =>
  new Map([[playerId, [{ id: 'r1', date: '2026-10-22', course: 'Lonnie Poole' }, { id: 'r2', date: '2026-10-15', course: 'Hilltop' }, { id: 'r3', date: '2026-10-08', course: 'Lonnie Poole' }, { id: 'r4', date: '2026-10-01', course: 'Hasentree' }]]]);

/** A real row through the real shapers, so the preview can't draw what the page can't. The fixtures are today's builders with the engine's depth on them; the design page's own copy isn't in them. */
export function previewReadView(q: string | undefined, role: 'coach' | 'player', gone = false, state?: string): ChReadView {
  const raw = (RAW[q ?? 'approach'] ?? RAW.approach!)();
  const name = OWNER(q);
  const first = name.split(' ')[0] as string;
  const viewer = role === 'coach' ? ({ role: 'coach', first } as const) : ({ role: 'player' } as const);
  const inputs = { rounds: ROUNDS(raw.player_id) as never, focusAreas: [] as never, goals: [] as never, themes: null };
  const deepOf = (r: EvidenceInsight) => {
    const base = toChInsight(r, { tour: PREVIEW_TOUR, viewer, ...(state === 'assigned' && r.id === raw.id ? { assigned: 'active' as const } : {}) } as never);
    return toChDeepInsight(r, base, inputs, (s) => s, role);
  };
  const deep = deepOf(raw);
  // The rail's neighbours: the same player's other reads.
  const others = Object.entries(RAW).filter(([k]) => k !== (q ?? 'approach')).map(([, f]) => ({ ...f(), player_id: raw.player_id }) as EvidenceInsight);
  const list = [deep, ...others.map(deepOf)];
  const dive: ChDeepDive = { list, tour: 'Tour', rounds: 21 as never, themes: {}, roundsFailed: false, plansFailed: false, themesFailed: false, counts: diveCounts(list) };
  const view = toChReadView(dive, new Map([raw, ...others].map((r) => [r.id, r])), gone ? 'gone' : raw.id, role, { playerId: role === 'coach' ? raw.player_id : null, name: role === 'coach' ? name : 'You', first: role === 'coach' ? first : 'You' }, { ...READ_CALLS, teamPool: true });
  return role === 'coach' ? { ...view, team: [HELM_PLAYERS.priya, HELM_PLAYERS.eli, HELM_PLAYERS.jonah].map((p) => ({ id: p.id, name: p.name })) } : view;
}
