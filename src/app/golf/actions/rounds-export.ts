'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { isUuid } from '@/lib/utils/uuid';
import type { ActionResult } from './golf-action-shared';

/**
 * Launch readiness F-02: the holes behind an export of rounds (the player's own Rounds, the coach's Team rounds). The page
 * already holds each round's totals; this reads only their holes, by round id, with the caller's own client, so row-level
 * security decides (`golf_holes_select`: the rounds the caller may read, `golf_readable_round_ids`). A round the caller may
 * not read comes back with no holes, as one posted without them does. A read, so the demo account may run it.
 */

export interface ChExportHole {
  n: number;
  par: number;
  score: number | null;
}

/** Up to a decade of a full roster's rounds in one export. */
const MAX_ROUNDS = 5000;
const input = z
  .array(z.string().refine((v) => isUuid(v), 'not an id'))
  .min(1)
  .max(MAX_ROUNDS);

type HoleRow = { round_id: string; hole_number: number; par: number; score: number | null };

async function readRoundHolesImpl(roundIds: string[]): Promise<ActionResult<Record<string, ChExportHole[]>>> {
  const parsed = input.safeParse(roundIds);
  if (!parsed.success) return { success: false, error: 'Those rounds can’t be exported.', code: 'invalid' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Sign in to export rounds.', code: 'unauthorized' };

  const out: Record<string, ChExportHole[]> = {};
  for (const ids of chunkIds([...new Set(parsed.data)])) {
    const res = await fetchAllRowsResult<HoleRow>(
      (from, to) =>
        supabase
          .from('golf_holes')
          .select('round_id, hole_number, par, score')
          .in('round_id', ids)
          .order('round_id', { ascending: true })
          .order('hole_number', { ascending: true })
          .range(from, to),
      undefined,
      { table: 'golf_holes', action: 'clubhouse.rounds.export', feature: 'round_tracking', sport: 'golf' },
    );
    if (res.error) {
      await logServerError(`[rounds] readRoundHolesForExport failed: ${res.error.message}`, {
        action: 'readRoundHolesForExport',
        featureArea: 'round_tracking',
        errorCode: res.error.code ?? undefined,
      });
      return { success: false, error: 'The holes didn’t load.', code: 'failed' };
    }
    for (const h of res.data ?? []) {
      (out[h.round_id] ??= []).push({ n: h.hole_number, par: h.par, score: h.score });
    }
  }
  return { success: true, data: out };
}

const observed = withAdminObserved('readRoundHolesForExport', { sport: 'golf', feature: 'round_tracking', observeSoftFailures: false }, readRoundHolesImpl);
export async function readRoundHolesForExport(roundIds: string[]) {
  return observed(roundIds);
}
