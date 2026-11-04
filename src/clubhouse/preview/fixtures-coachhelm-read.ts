import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { diveCounts, toChDeepInsight, type ChDeepDive } from '../data/coachhelm-dive-shape';
import { toChInsight } from '../data/coachhelm-map';
import { READ_CALLS } from '../data/coachhelm-read-calls';
import { toChReadView, type ChReadView } from '../data/coachhelm-read-view-shape';
import { HELM_PLAYERS, PREVIEW_TOUR, breakBias, penalties, slope } from './fixtures-coachhelm';

const RAW: Record<string, () => EvidenceInsight> = {
  approach: () => slope(HELM_PLAYERS.priya.id, 'in-approach'),
  penalties: () => penalties(HELM_PLAYERS.eli.id, 'in-pen'),
  putts: () => breakBias(HELM_PLAYERS.jonah.id, 'in-brk'),
};

/** A real row through the real shapers, so the preview can't draw what the page can't. The fixtures are today's builders; the design page's own copy isn't in them. */
export function previewReadView(q: string | undefined, role: 'coach' | 'player', gone = false): ChReadView {
  const raw = (RAW[q ?? 'approach'] ?? RAW.approach!)();
  const name = q === 'penalties' ? HELM_PLAYERS.eli.name : q === 'putts' ? HELM_PLAYERS.jonah.name : HELM_PLAYERS.priya.name;
  const first = name.split(' ')[0] as string;
  const viewer = role === 'coach' ? ({ role: 'coach', first } as const) : ({ role: 'player' } as const);
  const base = toChInsight(raw, { tour: PREVIEW_TOUR, viewer });
  const deep = toChDeepInsight(raw, base, { rounds: new Map(), focusAreas: [], goals: [], themes: null }, (s) => s);
  const dive: ChDeepDive = {
    list: [deep],
    tour: 'Tour',
    rounds: null,
    themes: {},
    roundsFailed: false,
    plansFailed: false,
    themesFailed: false,
    counts: diveCounts([deep]),
  };
  return toChReadView(dive, new Map([[raw.id, raw]]), gone ? 'gone' : raw.id, role, { playerId: role === 'coach' ? raw.player_id : null, name: role === 'coach' ? name : 'You', first: role === 'coach' ? first : 'You' }, { ...READ_CALLS, teamPool: true });
}
