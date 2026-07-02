'use server';

import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  getTracerData,
  getTracerRoundDiagnostic,
  fixRoundData,
  type TracerData,
  type TracerRoundDiagnosticData,
} from '@/app/golf/actions/admin-tracer-data';

/**
 * Helm Bridge → Tracer delegation. requireSuperAdmin() first (Layer 2);
 * the legacy actions then re-check users.role='admin' internally
 * (admin-tracer-data.ts:661/1296/1393) — a deliberate DOUBLE gate during
 * the transition. fixRoundData performs service-role UPDATEs on live
 * golf_rounds/golf_holes; its null-score refusal guard (the
 * `recalculate_round_totals` case refuses to write when any hole has a
 * null score — admin-tracer-data.ts:1416-1419) ships UNTOUCHED. This file
 * does not modify admin-tracer-data.ts in any way.
 */

export async function bridgeGetTracerData(): Promise<TracerData> {
  await requireSuperAdmin();
  return getTracerData();
}

export async function bridgeGetTracerRoundDiagnostic(
  roundId: string,
): Promise<TracerRoundDiagnosticData> {
  await requireSuperAdmin();
  return getTracerRoundDiagnostic(roundId);
}

export async function bridgeFixRoundData(
  ...args: Parameters<typeof fixRoundData>
): ReturnType<typeof fixRoundData> {
  await requireSuperAdmin();
  return fixRoundData(...args);
}
