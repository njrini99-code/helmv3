import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import { DEFAULT_LIVE_SOURCES, buildPack, renderPackMarkdown, resolvePackTarget, withSources, type PackLiveSource } from '@/lib/admin/clubhouse/pack';
import { adminEventsPackSource, packPseudonym } from '@/lib/admin/clubhouse/pack-server';
import { auditDuetRead, duetAccess, duetJson, namesFor } from '@/lib/admin/clubhouse/duet-access';
import { liveRef } from '@/lib/admin/clubhouse/screens';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/clubhouse/duet/packs?t=<target>[&names=1] (plan §9.2): the §9.1 context pack for a page, control,
 * action, code, finding, release (`rel:<sha>`), person (`user:<uuid>`) or team (`team:<uuid>`), as JSON (`pack`) and as the paste (`markdown`). Read-only, bearer-token only, off until
 * BRIDGE_DUET_TOKEN is set (404 until then). See src/lib/admin/clubhouse/duet-access.ts.
 */
export async function GET(request: NextRequest) {
  const access = duetAccess(request);
  if (!access.ok) return access.response;

  const raw = (request.nextUrl.searchParams.get('t') ?? '').trim().slice(0, 80);
  if (!raw) return duetJson({ error: 'missing t: a page (P007), control (CTL-…), action (ACT-…), code (70603, CH-7004), finding (F-0001), rel:<sha>, user:<uuid> or team:<uuid>' }, 400);

  const graph = loadBridgeGraph();
  if (!graph) return duetJson({ error: 'graph unavailable' }, 503);
  const target = resolvePackTarget(graph, raw);
  if (!target) return duetJson({ error: 'unknown target', t: raw, contract: graph.contentHash }, 404);

  const includeNames = namesFor(request, access);
  let live: PackLiveSource[] = [];
  try {
    live = [adminEventsPackSource(createAdminClient() as unknown as SupabaseClient)];
  } catch {
    // No service role on this server: the incidents section stays "No signal yet" with the rest.
  }
  const pack = await buildPack(graph, target, { includeNames, release: liveRef(), pseudonymize: packPseudonym, sources: withSources(DEFAULT_LIVE_SOURCES, live) });
  await auditDuetRead('packs', target.key, includeNames, access.caller);
  return duetJson({ pack, markdown: renderPackMarkdown(pack) });
}
