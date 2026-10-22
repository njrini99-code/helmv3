import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { notEnoughOf, notEnoughRead, splitFirm, type ChNotEnoughPlayer } from '../data/coachhelm-firm';
import { toChInsight } from '../data/coachhelm-map';
import { firstName, sortCoachPlayers, type ChCoachHelmData, type ChCoachPlayer } from '../data/coachhelm-shape';
import type { ChViewer } from '../data/coachhelm-voice';
import { bigNumber, breakBias, HELM_PLAYERS, penalties, PREVIEW_HELM_COACH, PREVIEW_TOUR, slope, teeInconclusive } from './fixtures-coachhelm';
import { ENGINE_BIG, ENGINE_NOW, ENGINE_ON, ENGINE_PENALTIES, ENGINE_SLOPE } from './fixtures-coachhelm-engine';

/**
 * `?state=notenough` on `coachhelm`: the coach board with `coachhelm_support_v1` on, where reads the support pass rated Not enough
 * yet are not cards (round 2C). Jonah's card is his Observed slope read and one thin read of his is held back; Eli's ranked head was
 * rated Not enough yet, so his Likely penalties read leads instead; every read of Priya's is held back, so she is a By player row
 * that says so; Theo's strength is a card. The three held-back reads are the one collapsed line under the board. Every row goes
 * through the loader's own split (`splitFirm`, `notEnoughRead`) and mapper, so the preview cannot draw what the page cannot.
 */

const coachOf = (p: { name: string }): ChViewer => ({ role: 'coach', first: firstName(p.name) });

/** A read the support pass held back below its floor: `n` of `floor` attempts over `rounds` rounds. */
const thin = (row: EvidenceInsight, n: number, floor: number, unit: string, rounds: number): EvidenceInsight => ({
  ...row,
  evidence: {
    ...row.evidence,
    support: { version: 'support_v1', testable: true, n, n_unit: unit, rounds_n: rounds, floor, round_floor: 3, clear: false },
    ladder: 'not_enough_yet',
    what_ladder: 'not_enough_yet',
    ladder_reasons: ['below_attempt_floor'],
  } as EvidenceInsight['evidence'],
});

const { jonah, eli, priya, theo } = HELM_PLAYERS;

/** Each player's reads, the delivery's ranked head first, as the loader reads them. */
const READS: Array<{ p: { id: string; name: string }; reads: EvidenceInsight[]; count: number }> = [
  { p: jonah, reads: [ENGINE_SLOPE(slope(jonah.id)), thin(breakBias(jonah.id, 'in-brk-jonah'), 14, 40, 'attempts', 4)], count: 1 },
  { p: eli, reads: [thin(teeInconclusive(eli.id, 'in-tee-eli'), 9, 20, 'tee_shots', 2), ENGINE_PENALTIES(penalties(eli.id, 'in-pen-eli'))], count: 1 },
  { p: priya, reads: [thin(breakBias(priya.id, 'in-brk-priya'), 28, 40, 'attempts', 9)], count: 0 },
  { p: theo, reads: [ENGINE_BIG(bigNumber(theo.id, 'in-dbl-theo'))], count: 0 },
];

const list: ChCoachPlayer[] = [];
const held: ChNotEnoughPlayer[] = [];
for (const { p, reads, count } of READS) {
  const viewer = coachOf(p);
  const split = splitFirm(reads[0], reads, true);
  if (split.held.length > 0) held.push({ id: p.id, name: p.name, card: !!split.head, reads: split.held.map((r) => notEnoughRead(r, viewer)) });
  if (!split.head) continue;
  list.push({ id: p.id, name: p.name, count, top: toChInsight(split.head, { tour: PREVIEW_TOUR, viewer, engine: { flags: ENGINE_ON, lifecycle: null, focus: null, now: ENGINE_NOW } }) });
}

export const PREVIEW_HELM_COACH_NOT_ENOUGH: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  roster: { count: 4, error: false },
  players: { list: sortCoachPlayers(list), error: false },
  withoutSignals: 0,
  withoutNames: [],
  notEnough: notEnoughOf(held),
};
