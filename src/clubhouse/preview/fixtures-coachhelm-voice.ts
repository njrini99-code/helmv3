import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { toChInsight } from '../data/coachhelm-map';
import { firstName, type ChCoachHelmData, type ChCoachPlayer } from '../data/coachhelm-shape';
import type { ChViewer } from '../data/coachhelm-voice';
import { bigNumber, breakBias, HELM_PLAYERS, penalties, PREVIEW_HELM_COACH, PREVIEW_TOUR, slope } from './fixtures-coachhelm';

/**
 * `?state=coachcopy` on `coachhelm` (chs-40): Jonah's downhill read carries the engine's stored coach copy (`evidence.coach_copy`,
 * neutral third person, the same numbers as the player's text), so his card reads the coach's retelling, named for Jonah, instead
 * of the player's text through the regex. The other cards carry none and keep the regex. Every row goes through the loader's own
 * mapper (`toChInsight`), so the preview cannot draw what the page cannot.
 */

export const SLOPE_COACH_COPY = {
  title: 'Downhill putts from 4-6 ft',
  content:
    "From 4-6 ft, the player makes 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap. A short miss costs a full stroke, so this is the highest leverage per attempt in the bag. It's consistent with a pace-control pattern rather than a green-reading one: the gap shows up inside 6 ft and not beyond it. Have the player rehearse a downhill-only ladder: start 2 ft below the hole and add a foot at a time.",
};

export const withCoachCopy = (row: EvidenceInsight, copy: { title: string; content: string }): EvidenceInsight => ({ ...row, evidence: { ...row.evidence, coach_copy: copy } });

const coachOf = (p: { name: string }): ChViewer => ({ role: 'coach', first: firstName(p.name) });
/** The drill's description the loader reads beside Jonah's read, as the default preview has it. */
const DRILL_TEXT = 'Rehearse a downhill-only ladder: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.';
const card = (p: { id: string; name: string }, ins: EvidenceInsight, count: number, drillText: string | null = null): ChCoachPlayer => ({ id: p.id, name: p.name, count, top: toChInsight(ins, { drillText, tour: PREVIEW_TOUR, viewer: coachOf(p) }) });

const { jonah, eli, priya, theo } = HELM_PLAYERS;

export const PREVIEW_HELM_COACH_COACH_COPY: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  players: {
    list: [card(jonah, withCoachCopy(slope(jonah.id), SLOPE_COACH_COPY), 3, DRILL_TEXT), card(eli, penalties(eli.id, 'in-pen-eli'), 2), card(priya, breakBias(priya.id, 'in-brk-priya'), 1), card(theo, bigNumber(theo.id, 'in-dbl-theo'), 0)],
    error: false,
  },
};
