/**
 * v3 Coach Intent types (W27).
 *
 * Mirror of public.golf_coach_player_intent. Locked decision: invisible
 * to player (RLS Pattern 2 — coach-owned). alert_posture modulates the
 * Wave 7 confidence gate threshold per master plan Part VIII.
 */

export type NarrativeGoal = 'breakout' | 'maintain' | 'bubble' | 'develop' | 'rehabilitate';

export type AlertPosture = 'aggressive' | 'balanced' | 'conservative' | 'silent';

export interface CoachPlayerIntent {
  coach_id: string;
  player_id: string;
  narrative_goal: NarrativeGoal;
  alert_posture: AlertPosture;
  highlight_categories: string[];
  notes: string | null;
  updated_at: string;
}

/**
 * Confidence-threshold multiplier per alert_posture. Wave 7 gate
 * threshold × this multiplier = effective threshold for the player.
 *
 *   aggressive    0.85×  — surface more (lower the bar)
 *   balanced      1.00×  — default
 *   conservative  1.15×  — surface less (raise the bar)
 *   silent        ∞      — never surface (use a sentinel large value)
 */
export const ALERT_POSTURE_MULTIPLIER: Record<AlertPosture, number> = {
  aggressive: 0.85,
  balanced: 1.0,
  conservative: 1.15,
  silent: Number.POSITIVE_INFINITY,
};

/**
 * UX color + label per narrative_goal (per master plan Part VIII UX).
 *   🔴 Bubble / 🟢 Maintain / 🟡 Develop / ⭐ Breakout / 🔵 Rehab
 */
export const NARRATIVE_GOAL_PRESENTATION: Record<NarrativeGoal, {
  label: string;
  emoji: string;
  pillClass: string;
}> = {
  bubble:        { label: 'Bubble',        emoji: '🔴', pillClass: 'bg-red-50 text-red-700 border-red-200' },
  maintain:      { label: 'Maintain',      emoji: '🟢', pillClass: 'bg-primary-50 text-primary-700 border-primary-200' },
  develop:       { label: 'Develop',       emoji: '🟡', pillClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  breakout:      { label: 'Breakout',      emoji: '⭐', pillClass: 'bg-violet-50 text-violet-700 border-violet-200' },
  rehabilitate:  { label: 'Rehab',         emoji: '🔵', pillClass: 'bg-blue-50 text-blue-700 border-blue-200' },
};

export const DEFAULT_NARRATIVE_GOAL: NarrativeGoal = 'develop';
export const DEFAULT_ALERT_POSTURE: AlertPosture = 'balanced';
