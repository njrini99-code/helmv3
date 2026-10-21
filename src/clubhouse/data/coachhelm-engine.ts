import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { SUPPORT_FLAG } from '@/lib/coachhelm/v3/support/flag';
import { RECHECK_FLAG } from '@/lib/coachhelm/v3/lifecycle/flag';
import { VERDICTS_FLAG } from '@/lib/coachhelm/v3/verdicts/flag';
import { isMissingSchemaError } from '@/lib/coachhelm/v3/verdicts/schema-missing';
import type { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fromUntyped } from '@/lib/supabase/untyped';
import { chLogServer } from '../lib/track-server';
import type { ChEngineFlags, ChVerdictRow } from './coachhelm-engine-shape';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** `v3/engine/generator-base.ts ROOT_CAUSE_DIAGNOSIS_FLAG`, named here so this loader does not pull the generator base in. */
const ROOT_CAUSE_FLAG = 'coachhelm_root_cause_diagnosis';

/**
 * Which engine states the Clubhouse CoachHelm surfaces draw (CoachHelm surfaces A). Each follows the flag of the slice that writes
 * it, so turning a flag on shows its result end to end, and with every flag off (production today) the pages are unchanged.
 */
export function readEngineFlags(): ChEngineFlags {
  return {
    support: isFlagEnabled(SUPPORT_FLAG),
    cause: isFlagEnabled(ROOT_CAUSE_FLAG),
    recheck: isFlagEnabled(RECHECK_FLAG),
    verdicts: isFlagEnabled(VERDICTS_FLAG),
  };
}

/** The statuses a focus area made from a read can be in while its verdict means something. */
const FOCUS_STATUSES = new Set(['proposed', 'active', 'in_progress', 'paused', 'completed']);

/**
 * The focus area made from each read, with its prescription and verdict (Slice 4 columns), newest first, one per read. Read only
 * with `coachhelm_verdicts_v1` on. The columns arrive with a HELD migration (20261020120000_golf_focus_area_prescription.sql), so a
 * database without them answers "no verdicts" without a log line; any other failure is logged and also answers none, so the
 * cards draw what they drew before rather than failing.
 */
export async function readFocusVerdicts(supabase: Supabase, insightIds: readonly string[], on: boolean): Promise<Map<string, ChVerdictRow>> {
  const out = new Map<string, ChVerdictRow>();
  if (!on || insightIds.length === 0) return out;
  try {
    const rows: Array<ChVerdictRow & { created_at?: string }> = [];
    for (const chunk of chunkIds([...insightIds])) {
      const res = (await fromUntyped(supabase, 'golf_player_focus_areas')
        .select('id, from_insight_id, baseline_value, baseline_n, criterion, horizon, verdict, status, created_at')
        .in('from_insight_id', chunk)
        .order('created_at', { ascending: false })) as {
        data: Array<ChVerdictRow & { created_at?: string; status?: string }> | null;
        error: { code?: string; message?: string } | null;
      };
      if (res.error) {
        if (!isMissingSchemaError(res.error)) chLogServer('coachhelm', 'engine.verdicts', res.error, 'coachhelm');
        return out;
      }
      rows.push(...(res.data ?? []).filter((r) => FOCUS_STATUSES.has(String(r.status ?? ''))));
    }
    rows.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    for (const r of rows) if (r.from_insight_id && !out.has(r.from_insight_id)) out.set(r.from_insight_id, r);
  } catch (err) {
    chLogServer('coachhelm', 'engine.verdicts', err, 'coachhelm');
  }
  return out;
}
