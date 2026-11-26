import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import { buildTimeDrift, driftExport, type RuntimeDrift } from '@/lib/admin/clubhouse/drift';
import { readRuntimeDrift } from '@/lib/admin/clubhouse/drift-server';
import { auditDuetRead, duetAccess, duetJson } from '@/lib/admin/clubhouse/duet-access';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/clubhouse/duet/drift (plan §9.2): B11's lists as JSON (`bridge-drift/v1`), the same export the
 * screen's "Copy as JSON" gives. Read-only, bearer-token only, off until BRIDGE_DUET_TOKEN is set (404 until then).
 * Drift carries codes and files, never people.
 */
export async function GET(request: NextRequest) {
  const access = duetAccess(request);
  if (!access.ok) return access.response;

  const graph = loadBridgeGraph();
  if (!graph) return duetJson({ error: 'graph unavailable' }, 503);

  let runtime: RuntimeDrift;
  try {
    runtime = await readRuntimeDrift(createAdminClient() as unknown as SupabaseClient);
  } catch (err) {
    runtime = { state: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
  const body = driftExport(graph, buildTimeDrift(graph), runtime);
  await auditDuetRead('drift', null, false, access.caller);
  return duetJson(body);
}
