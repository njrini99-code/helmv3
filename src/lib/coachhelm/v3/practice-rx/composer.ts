/**
 * v3 Practice Rx composer (W38).
 *
 * Per Part XVII: LLM-driven 7-day practice plan from goal metric +
 * drill library (filtered to drills with impacts_metric_id = goal
 * metric). No compliance tracking — the goal's metric movement is
 * the measure (Part XVII locked decision).
 *
 * Pipeline:
 *   1. Load goal + tagged drills + recent SG profile from cache
 *   2. Build a structured prompt asking Haiku to assemble 7 days
 *   3. Validate response shape (must reference drill ids from input)
 *   4. Return a PracticePlan with day-by-day blocks
 *
 * Reuses the W30 compose() wrapper so budget + call-log + citation
 * verification all apply.
 */

import { compose } from '@/lib/coachhelm/v3/llm/compose';
import type { ComposeResult, EvidenceClaim } from '@/lib/coachhelm/v3/llm/types';

export interface PracticeRxInput {
  player_id: string;
  coach_id: string | null;
  goal: {
    id: string;
    title: string;
    metric_id: string;
    target_value: number | null;
    current_value: number | null;
    window_days: number;
  };
  /** Drills filtered by `impacts_metric_id = goal.metric_id`. */
  candidate_drills: Array<{
    id: string;
    slug: string;
    title: string;
    duration_min: number;
    difficulty: string;
  }>;
  /** Optional — top weakness from the SG cache for context. */
  recent_weakness?: string | null;
  /** Fallback plan when LLM is gated; the surface always shows
   *  something even if no key is set. */
  fallback_text: string;
}

export interface PracticePlanDay {
  day: number;
  drill_ids: string[];
  prose: string;
}

export interface PracticePlan {
  goal_id: string;
  days: PracticePlanDay[];
  raw_text: string;
  used_llm: boolean;
}

function buildPrompt(input: PracticeRxInput): string {
  const drillCatalog = input.candidate_drills
    .map((d) => `  - id=${d.id} · ${d.title} (${d.duration_min} min, ${d.difficulty})`)
    .join('\n');
  return [
    `You are a college golf coach writing a 7-day practice plan for one player.`,
    ``,
    `Goal: ${input.goal.title}`,
    `Metric: ${input.goal.metric_id}` +
      (input.goal.current_value !== null && input.goal.target_value !== null
        ? ` (current ${input.goal.current_value} → target ${input.goal.target_value})`
        : ''),
    `Window: ${input.goal.window_days} days`,
    input.recent_weakness ? `Recent weakness: ${input.recent_weakness}` : '',
    ``,
    `Available drills (only reference these ids — do not invent any):`,
    drillCatalog,
    ``,
    `Return ONE line per day, format exactly:`,
    `Day N: drill_ids=<comma-separated drill ids from the catalog> — <one-sentence rationale>`,
    `Cover days 1-7. Pick 1-3 drills per day. Vary across days; no single drill more than 3 times.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildEvidence(input: PracticeRxInput): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [
    { field: 'goal_id', value: input.goal.id },
    { field: 'metric_id', value: input.goal.metric_id },
    { field: 'window_days', value: input.goal.window_days },
  ];
  for (const d of input.candidate_drills) {
    claims.push({ field: 'drill_id', value: d.id });
  }
  return claims;
}

/**
 * Parse the LLM's day-by-day text into PracticePlanDay[]. Tolerant of
 * formatting drift: lines that don't match the schema are skipped, and
 * drill ids not in the candidate set are dropped (LLM hallucination
 * filter — never round-trips a fabricated id to the UI).
 */
export function parsePlan(text: string, candidateIds: Set<string>): PracticePlanDay[] {
  const days: PracticePlanDay[] = [];
  // Lazy match drill_ids up to the first em-dash (—) OR ASCII hyphen
  // surrounded by spaces, then the prose rationale. Avoiding a char
  // class with em-dash + hyphen since they can be misread as a range.
  const lineRe = /^Day\s+(\d+):\s*drill_ids=(.+?)\s*(?:—|-)\s+(.+)$/i;
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(lineRe);
    if (!m) continue;
    const dayNum = Number(m[1]);
    const idsRaw = m[2] ?? '';
    const prose = m[3]?.trim() ?? '';
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 7) continue;
    const ids = idsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && candidateIds.has(s));
    if (ids.length === 0) continue;
    days.push({ day: dayNum, drill_ids: ids, prose });
  }
  return days.sort((a, b) => a.day - b.day);
}

export async function composePracticeRx(input: PracticeRxInput): Promise<PracticePlan> {
  // Practice Rx rides on the round_review budget per Part XI.4 — it's
  // a per-goal generation, not a chat. Reusing the round_review task
  // keeps cost attribution in one bucket.
  const result: ComposeResult = await compose(
    {
      task: 'round_review',
      coach_id: input.coach_id,
      player_id: input.player_id,
      prompt: buildPrompt(input),
      evidence: buildEvidence(input),
      max_completion_tokens: 600,
    },
    input.fallback_text,
  );

  const candidateIds = new Set(input.candidate_drills.map((d) => d.id));
  const days = result.used_llm
    ? parsePlan(result.text, candidateIds)
    : [];

  return {
    goal_id: input.goal.id,
    days,
    raw_text: result.text,
    used_llm: result.used_llm,
  };
}
