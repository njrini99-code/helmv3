import { NextResponse, type NextRequest } from 'next/server';
import { checkSuperAdminAccess } from '@/lib/admin/require-super-admin';
import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import { searchBridgeGraph, SEARCH_MAX_QUERY } from '@/lib/admin/clubhouse/search';

export const dynamic = 'force-dynamic';

/**
 * B14: the ⌘K palette's graph lookups (plan §7.2). GET `?q=CH-7004` returns the pages, actions, controls, codes and
 * findings that match, each with the dossier it opens. The graph stays on the server; the palette asks per query.
 *
 * Super-admin only, first line, before the graph is read. The non-throwing probe answers a signed-out or demoted
 * session with 403 rather than a 500, the same as every polling Bridge client.
 */
export async function GET(request: NextRequest) {
  const probe = await checkSuperAdminAccess();
  if (!probe.allowed) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, SEARCH_MAX_QUERY);
  const graph = loadBridgeGraph();
  if (!graph) {
    // Says so rather than answering "no matches": an unreadable contract is not an empty one.
    return NextResponse.json({ items: [], graph: 'unavailable' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(
    { items: searchBridgeGraph(graph, q), graph: graph.contentHash },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
