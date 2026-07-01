'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/practice-intelligence.ts
//
// Packet: practice-intel
//
// The Practice Intelligence Board (V5 "Intelligence Rail" + "Postgame Review To
// Practice"). Reads the team's active CoachHelm signals (baseball_coach_insights
// rows — IN-DB, never a direct vendor call) and turns them into:
//   * PracticeSignal[]   — the rail of postgame signals / development goals due /
//                          limited players, each carrying confidence + visibility
//                          + generated_at (honesty contract).
//   * a SuggestedPracticeBlock the coach can drop onto the 5-min time rail.
//
// BINDING CONTRACTS:
//   * NO AI without source refs — every suggestion cites the insight it came
//     from (source -> signal -> action). source_reason + source_insight_id are
//     persisted on the produced block so the timeline can trace it.
//   * NEVER auto-publish. convertSignalToBlock only APPENDS a draft block to a
//     draft/existing practice; the coach edits + publishes (V5 "coach edits
//     before publish").
//   * Player visibility honored — a staff_only signal yields a staff_only block;
//     a player-visible practice summary never leaks staff-only signal text.
//   * Recalibrated confidence — box-score-only signals are never shown as a
//     false "high"; we surface the engine's recorded [0,1] confidence verbatim
//     and render null as "—" downstream (no fabricated 0%).
//
// SECURITY: wrapped in withBaseballAction { featureArea:'baseball-practice',
// requiredCapability:'can_manage_practice' }. Reads are team-scoped + RLS-backed.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import type {
  PracticeSignal,
  SuggestedPracticeBlock,
  BaseballBlockVisibility,
} from '@/lib/types/baseball-practice-deep';

const PRACTICE_PATH = '/baseball/dashboard/practice';

type ActionResult<T = unknown> = { success: boolean; error?: string; data?: T };

const FEATURE = { featureArea: 'baseball-practice', requiredCapability: 'can_manage_practice' } as const;

// -----------------------------------------------------------------------------
// insight_type -> station mapping. The board converts a signal into a station
// recommendation. These are BASEBALL station types (V7) — never golf labels.
// Unknown types fall back to a generic "skill_block" with a neutral duration.
// -----------------------------------------------------------------------------

interface StationTemplate {
  stationType: string;
  /** Default headline prefix when the signal has none of its own. */
  headlinePrefix: string;
  durationMin: number;
  /** A measurement target template — what to track during the block (V5). */
  measurementTarget: string | null;
  /** Coarse player group the station usually applies to. */
  groupLabel: string | null;
}

const STATION_TEMPLATES: Record<string, StationTemplate> = {
  hitting: {
    stationType: 'hitting',
    headlinePrefix: 'Hitting correction',
    durationMin: 20,
    measurementTarget: 'Track swing/take decisions and hard-contact rate',
    groupLabel: 'Hitters',
  },
  situational_hitting: {
    stationType: 'situational_hitting',
    headlinePrefix: 'Situational hitting',
    durationMin: 20,
    measurementTarget: 'Record runner-advance and contact outcomes by count',
    groupLabel: 'Hitters',
  },
  pitching: {
    stationType: 'pitching',
    headlinePrefix: 'Pitching emphasis',
    durationMin: 25,
    measurementTarget: 'Track command by zone and pitch type',
    groupLabel: 'Pitchers',
  },
  bullpen: {
    stationType: 'bullpen',
    headlinePrefix: 'Bullpen work',
    durationMin: 25,
    measurementTarget: 'Log pitch counts and command targets per arm',
    groupLabel: 'Pitchers',
  },
  defense: {
    stationType: 'defense',
    headlinePrefix: 'Team defense',
    durationMin: 30,
    measurementTarget: 'Tag every miss by location and situation',
    groupLabel: 'Position players',
  },
  catching: {
    stationType: 'catching',
    headlinePrefix: 'Catcher development',
    durationMin: 20,
    measurementTarget: 'Tag blocks and pop times by location',
    groupLabel: 'Catchers',
  },
  baserunning: {
    stationType: 'baserunning',
    headlinePrefix: 'Baserunning reads',
    durationMin: 15,
    measurementTarget: 'Track first-step reads and decision quality',
    groupLabel: 'Position players',
  },
};

const DEFAULT_TEMPLATE: StationTemplate = {
  stationType: 'skill_block',
  headlinePrefix: 'Development block',
  durationMin: 20,
  measurementTarget: null,
  groupLabel: null,
};

/** Map an insight_type to a station template (substring-tolerant). */
function templateForInsightType(insightType: string): StationTemplate {
  const t = insightType.toLowerCase();
  for (const key of Object.keys(STATION_TEMPLATES)) {
    if (t.includes(key)) return STATION_TEMPLATES[key]!;
  }
  // A couple of common aliases the engine emits.
  if (t.includes('rbi') || t.includes('risp') || t.includes('clutch')) {
    return STATION_TEMPLATES.situational_hitting!;
  }
  if (t.includes('command') || t.includes('walk') || t.includes('bb')) {
    return STATION_TEMPLATES.pitching!;
  }
  if (t.includes('error') || t.includes('field')) return STATION_TEMPLATES.defense!;
  return DEFAULT_TEMPLATE;
}

/**
 * Map the engine's `player_visible` boolean (baseball_coach_insights.player_visible,
 * migration 20260624000070) to the V2 block visibility vocabulary. Mirrors the
 * same boolean -> ladder mapping used by convertInsightToAction
 * (coachhelm-actions.ts: `insight.player_visible ? 'team' : 'staff_only'`) and
 * insightVisibility (signal-from-insight.ts). The column has no "restricted"
 * state — a signal is either player_visible (the subject player may read it) or
 * staff_only (the default; never leaked to players).
 */
function insightVisibility(playerVisible: unknown): BaseballBlockVisibility {
  return playerVisible === true ? 'player_visible' : 'staff_only';
}

// -----------------------------------------------------------------------------
// Read the Intelligence Board signals for the active team.
// -----------------------------------------------------------------------------

/**
 * Build the Practice Intelligence Board feed: active signals + the block each
 * would suggest. RLS already constrains baseball_coach_insights to team staff,
 * so a player can never read this (the action also requires can_manage_practice).
 */
export const getPracticeIntelligence = withBaseballAction(
  'getPracticeIntelligence',
  FEATURE,
  async (
    ctx,
  ): Promise<
    ActionResult<{ signals: PracticeSignal[]; suggestions: SuggestedPracticeBlock[] }>
  > => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Active, non-dismissed signals, newest first.
    const { data, error } = await fromUntyped(supabase, 'baseball_coach_insights')
      .select(
        `
        id, insight_type, title, body, priority, status, confidence, metadata,
        player_id, player_visible, created_at,
        player:baseball_players(id, first_name, last_name)
      `,
      )
      .eq('team_id', teamId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) return { success: false, error: sanitizeDbError(error, 'practice') };

    // Which insights already produced a block (disposition='converted')? Join
    // against blocks carrying source_insight_id so the board doesn't re-suggest.
    const insightIds = (data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => r.id as string);
    const convertedByInsight = new Map<string, string>();
    if (insightIds.length > 0) {
      const { data: blockRows } = await fromUntyped(supabase, 'baseball_practice_blocks')
        .select('id, source_insight_id')
        .eq('team_id', teamId)
        .in('source_insight_id', insightIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const b of (blockRows ?? []) as any[]) {
        if (b.source_insight_id) convertedByInsight.set(b.source_insight_id, b.id);
      }
    }

    const signals: PracticeSignal[] = [];
    const suggestions: SuggestedPracticeBlock[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const player = Array.isArray(row.player) ? row.player[0] : row.player;
      const playerName = player
        ? [player.first_name, player.last_name].filter(Boolean).join(' ') || null
        : null;
      const visibility = insightVisibility(row.player_visible);
      // confidence column is canonical; metadata.confidence is a mirror.
      const confidence =
        typeof row.confidence === 'number'
          ? row.confidence
          : typeof meta.confidence === 'number'
            ? (meta.confidence as number)
            : null;
      const convertedBlockId = convertedByInsight.get(row.id) ?? null;

      const signal: PracticeSignal = {
        insightId: row.id,
        title: row.title,
        summary: row.body ?? null,
        insightType: row.insight_type ?? 'general',
        confidence,
        visibility,
        generatedAt: row.created_at ?? null,
        playerId: row.player_id ?? null,
        playerName,
        disposition: convertedBlockId ? 'converted' : 'new',
        convertedBlockId,
      };
      signals.push(signal);

      // Only propose a suggestion for not-yet-converted signals.
      if (!convertedBlockId) {
        const tpl = templateForInsightType(signal.insightType);
        const subject = playerName ? `${playerName}: ` : '';
        suggestions.push({
          sourceInsightId: signal.insightId,
          headline: `${tpl.headlinePrefix}${subject ? ` — ${subject.trim()}` : ''}`,
          // Player-safe description: never echo a staff_only signal body into a
          // player-visible block. The board carries the raw body for staff only.
          description: visibility === 'staff_only' ? null : (signal.summary ?? null),
          stationType: tpl.stationType,
          groupLabel: tpl.groupLabel,
          durationMin: tpl.durationMin,
          measurementTarget: tpl.measurementTarget,
          sourceReason: `From signal: ${signal.title}`,
          visibility,
        });
      }
    }

    return { success: true, data: { signals, suggestions } };
  },
);

// -----------------------------------------------------------------------------
// Convert a signal into a draft practice block (V5 "convert signal to block").
// APPENDS a block to an existing practice on the 5-min rail at the end of the
// plan. NEVER publishes. The block links back to the insight (source_insight_id
// + source_reason) so the practice -> game timeline can trace it.
// -----------------------------------------------------------------------------

export const convertSignalToBlock = withBaseballAction(
  'convertSignalToBlock',
  FEATURE,
  async (
    ctx,
    input: {
      practiceId: string;
      suggestion: SuggestedPracticeBlock;
    },
  ): Promise<ActionResult<{ blockId: string }>> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Verify the practice belongs to this team (RLS also enforces this).
    const { data: practice } = await fromUntyped(supabase, 'baseball_practices')
      .select('id, status')
      .eq('id', input.practiceId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (!practice) {
      return { success: false, error: 'Practice not found for this team.' };
    }

    // Verify the source insight is real + on this team (no spoofed links).
    const { data: insight } = await fromUntyped(supabase, 'baseball_coach_insights')
      .select('id')
      .eq('id', input.suggestion.sourceInsightId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (!insight) {
      return { success: false, error: 'Source signal not found for this team.' };
    }

    // Append at the end of the existing rail (highest start+duration), rounded to 5.
    const { data: existing } = await fromUntyped(supabase, 'baseball_practice_blocks')
      .select('start_offset_min, duration_min')
      .eq('practice_id', input.practiceId)
      .eq('team_id', teamId);
    const tail = (existing ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (max: number, b: any) => Math.max(max, (b.start_offset_min ?? 0) + (b.duration_min ?? 0)),
      0,
    );
    const startOffset = Math.round(tail / 5) * 5;
    const duration = Math.max(5, Math.round(input.suggestion.durationMin / 5) * 5);

    const { data: inserted, error } = await fromUntyped(supabase, 'baseball_practice_blocks')
      .insert({
        team_id: teamId,
        practice_id: input.practiceId,
        start_offset_min: startOffset,
        duration_min: duration,
        activity: input.suggestion.headline,
        description: input.suggestion.description ?? null,
        station_type: input.suggestion.stationType,
        group_label: input.suggestion.groupLabel ?? null,
        measurement_target: input.suggestion.measurementTarget ?? null,
        is_measured: Boolean(input.suggestion.measurementTarget),
        source_reason: input.suggestion.sourceReason,
        source_insight_id: input.suggestion.sourceInsightId,
        visibility: input.suggestion.visibility,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: sanitizeDbError(error, 'practice') };

    revalidatePath(PRACTICE_PATH);
    return { success: true, data: { blockId: (inserted as { id: string }).id } };
  },
);
