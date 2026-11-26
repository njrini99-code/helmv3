import 'server-only';

import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import { parseScope, sortedPageIds, type ClubhouseScope, type SearchParams } from '@/lib/admin/clubhouse/screens';
import type { ScopeBarPage } from './ScopeBar';

export interface ClubhouseRead {
  graph: BridgeGraph;
  scope: ClubhouseScope;
  pages: ScopeBarPage[];
}

/**
 * The one read every Clubhouse screen makes after its gate: the graph this deploy shipped with, the scope from the
 * URL, and the page list the scope bar offers. Null when the graph can't be read; the screen then shows its xx92.
 */
export function readClubhouse(searchParams: SearchParams | undefined): ClubhouseRead | null {
  const graph = loadBridgeGraph();
  if (!graph) return null;
  const ids = sortedPageIds(graph);
  return {
    graph,
    scope: parseScope(searchParams, ids),
    pages: ids.map((id) => ({ id, name: graph.pages[id]!.name })),
  };
}

export const GRAPH_SOURCE = 'docs/clubhouse/generated/bridge-graph.json';
