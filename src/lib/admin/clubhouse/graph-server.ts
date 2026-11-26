import 'server-only';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BridgeGraph, normalizeControls, type RawGraphControl } from './graph';

/**
 * The Bridge graph this deploy was built with (`docs/clubhouse/generated/bridge-graph.json`, written by
 * `scripts/clubhouse/bridge-graph.mjs`). Read once per server instance, on first use: the file is 1.4 MB, so it is
 * never imported into a bundle. It ships in the function through next.config.mjs `outputFileTracingIncludes` and a
 * carve-out in .vercelignore.
 *
 * Null when the file is missing or unreadable: the route then counts nothing as drift (it can't tell) and says so.
 */
export const BRIDGE_GRAPH_PATH = join('docs', 'clubhouse', 'generated', 'bridge-graph.json');

let cached: BridgeGraph | null | undefined;

export function loadBridgeGraph(): BridgeGraph | null {
  if (cached !== undefined) return cached;
  try {
    const graph = JSON.parse(readFileSync(join(process.cwd(), BRIDGE_GRAPH_PATH), 'utf8')) as BridgeGraph;
    if (graph.version === 1 && graph.ids && graph.chIndex && graph.pages) {
      graph.controls = normalizeControls(graph.controls as unknown as Record<string, RawGraphControl>);
      cached = graph;
    } else cached = null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Tests only: forget the cached graph. */
export function resetBridgeGraphForTests(): void {
  cached = undefined;
}
