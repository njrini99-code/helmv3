import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { toChInsight } from '../data/coachhelm-map';
import { themesByCategory, toChDeepInsight, type ChDeepDive } from '../data/coachhelm-dive-shape';
import { toChProfile, type ChProfile } from '../data/coachhelm-profile-shape';
import { toChStanding, type ChStanding } from '../data/coachhelm-standing-shape';
import { coachHeadLine, type ChViewVoice } from '../data/coachhelm-views-shape';
import { speak, type ChViewer } from '../data/coachhelm-voice';
import { PREVIEW_TOUR } from './fixtures-coachhelm';
import { BASELINE, DIVE_BIG, DIVE_THEMES, DIVE_BREAK, DIVE_PENALTIES, DIVE_SLOPE, diveOf, DRILL, FULL_INPUTS, FULL_VECTOR, genome, LADDER_READS, STANDING_ROWS, VIEWS_NOW, type Inputs } from './fixtures-coachhelm-views';

/**
 * Sample data for a coach's views of one player (spec A): Jonah Okafor, read by his coach. The same stored shapes as the player's
 * own fixtures (fixtures-coachhelm-views.ts), run through the same shapers in the coach's voice, so the preview cannot draw what the
 * coach's page cannot.
 */

const VIEWER: Extract<ChViewer, { role: 'coach' }> = { role: 'coach', first: 'Jonah' };

/** Who the coach's views are about: the header's name and its one line (class, newest round). */
export const PREVIEW_COACH_VOICE: ChViewVoice = { role: 'coach', playerId: 'pl-jonah', name: 'Jonah Okafor', first: 'Jonah', line: coachHeadLine('Junior', '2026-09-28', VIEWS_NOW) };

export const PREVIEW_COACH_PROFILE: ChProfile = { ...toChProfile(genome(FULL_VECTOR), VIEWS_NOW, VIEWER), seen: { costing: 3, working: 1, error: false } };

/** Standing with the open reads on two of its stats (the rows that carry "Open the read"). */
export const PREVIEW_COACH_STANDING: ChStanding = { ...toChStanding(STANDING_ROWS, BASELINE, LADDER_READS, VIEWER), reads: { penalty_rate_per_round: 'in-pen', big_number_rate: 'in-dbl' } };

const say = (t: string) => speak(t, VIEWER);
const coachDeep = (raw: EvidenceInsight, inputs: Inputs, extra: Parameters<typeof toChInsight>[1] = {}) => toChDeepInsight(raw, toChInsight(raw, { tour: PREVIEW_TOUR, viewer: VIEWER, ...extra }), inputs, say, 'coach');

/** The coach's Deep dive: the downhill read already assigned (In a plan), the rest open to assign. */
export const PREVIEW_COACH_DIVE: ChDeepDive = diveOf([
  coachDeep(DIVE_PENALTIES, FULL_INPUTS),
  coachDeep(DIVE_SLOPE, FULL_INPUTS, { drillText: DRILL, assigned: 'active' }),
  coachDeep(DIVE_BREAK, FULL_INPUTS),
  coachDeep(DIVE_BIG, FULL_INPUTS),
], { themes: themesByCategory(DIVE_THEMES, 'coach') });
