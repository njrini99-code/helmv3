import 'server-only';

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';
import type { ReleaseRelationshipVerdict } from '@/lib/admin/incidents/release-context';

/**
 * Blast radius (brief §37-40): a bounded one-to-two-hop map from a selected
 * entity over the Helm World Model graph
 * (`docs/generated/WORLD_MODEL.json`, produced by
 * `scripts/knowledge/world-model.mjs`), never the whole graph. This is a
 * LIGHTWEIGHT CONSUMER of that already-materialized graph — a plain
 * breadth-first walk over its `edges` array, capped at depth 2 and a node
 * count — not a re-implementation of the generator's own `--impact` engine
 * (registry parsing, critical-feature scoring, journey attribution). That
 * engine stays exactly where it lives; this file only reads its output.
 *
 * `docs/generated/WORLD_MODEL.json` and `scripts/knowledge/world-model.mjs`
 * both landed on `main` via PR #1785 (2026-09-03), merged into this branch —
 * `fetchBlastRadius` reads the real graph now. It still reports
 * `unconfigured` if the file is ever absent or unreadable (a fresh
 * checkout before the first `npm run knowledge:world-model` regen, a build
 * that traced it out — see the `outputFileTracingIncludes` entry in
 * next.config.mjs), which is the disclosed-gap behavior the brief's
 * "unknown never renders as healthy" rule requires either way.
 */

export interface WorldModelEdge {
  source: string;
  target: string;
  kind: string;
  evidence: ReadonlyArray<{ kind: string }>;
}

interface WorldModelFile {
  nodes: Record<string, unknown>;
  edges: WorldModelEdge[];
}

export interface BlastRadiusNode {
  id: string;
  direction: 'upstream' | 'downstream';
  depth: 1 | 2;
  kind: string;
  /** True when every piece of evidence for the edge that reached this node
   *  is import-graph-only — the same weak/strong distinction
   *  `world-model.mjs`'s own `--impact` output uses (E.7: "an import graph
   *  is NOT automatically a behavioral dependency"). */
  weak: boolean;
}

export interface BlastRadiusResult {
  entityId: string;
  nodes: BlastRadiusNode[];
  /** True when this entity has no edges in the graph at all — distinct from
   *  "found the entity, it has zero neighbors": the caller should render
   *  "not present in the World Model" rather than "isolated node". */
  entityFound: boolean;
  truncated: boolean;
}

const MAX_NODES = 40;

function isWeakEdge(edge: WorldModelEdge): boolean {
  return edge.evidence.length > 0 && edge.evidence.every((e) => e.kind === 'import_graph');
}

/** Pure — no I/O. Breadth-first over `edges`, both directions, capped at
 *  `maxDepth` hops and `MAX_NODES` total nodes. */
export function computeBlastRadius(edges: readonly WorldModelEdge[], entityId: string, maxDepth: 1 | 2 = 2): BlastRadiusResult {
  const touchesEntity = edges.some((e) => e.source === entityId || e.target === entityId);
  if (!touchesEntity) {
    return { entityId, nodes: [], entityFound: false, truncated: false };
  }

  const visited = new Set<string>([entityId]);
  const nodes: BlastRadiusNode[] = [];
  let frontier: string[] = [entityId];
  let truncated = false;

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];
    for (const current of frontier) {
      for (const edge of edges) {
        let neighbor: string | null = null;
        let direction: BlastRadiusNode['direction'] | null = null;
        if (edge.source === current && edge.target !== current) {
          neighbor = edge.target;
          direction = 'downstream';
        } else if (edge.target === current && edge.source !== current) {
          neighbor = edge.source;
          direction = 'upstream';
        }
        if (!neighbor || !direction || visited.has(neighbor)) continue;
        if (nodes.length >= MAX_NODES) {
          truncated = true;
          continue;
        }
        visited.add(neighbor);
        nodes.push({ id: neighbor, direction, depth: depth as 1 | 2, kind: edge.kind, weak: isWeakEdge(edge) });
        nextFrontier.push(neighbor);
      }
    }
    frontier = nextFrontier;
  }

  return { entityId, nodes, entityFound: true, truncated };
}

const WORLD_MODEL_PATH = 'docs/generated/WORLD_MODEL.json';

/**
 * Module-level parse cache, keyed by the file's own `mtimeMs`. `/admin/
 * engineering` is `force-dynamic` (no page-level cache) and the World Model
 * graph can run to several MB once #1785 lands — re-reading and
 * `JSON.parse`-ing it on every `AutoRefresh` poll (every request, per
 * serverless instance) is wasted work for a file that changes only when a
 * new deploy regenerates it. `stat()` is a cheap syscall every request;
 * the file itself is only re-read when its `mtimeMs` moves, which happens
 * at most once per process lifetime in practice (a fresh Vercel invocation
 * gets a fresh module scope anyway, so this caches within one warm
 * instance's lifetime, not across deploys).
 */
let worldModelCache: { mtimeMs: number; file: WorldModelFile } | null = null;

async function readWorldModel(): Promise<WorldModelFile> {
  const path = join(process.cwd(), WORLD_MODEL_PATH);
  // Let stat's ENOENT propagate to the caller's catch — same disclosed-gap
  // handling as before, just moved one level down.
  const stats = await stat(path);
  if (worldModelCache && worldModelCache.mtimeMs === stats.mtimeMs) {
    return worldModelCache.file;
  }
  const raw = await readFile(path, 'utf-8');
  const file = JSON.parse(raw) as WorldModelFile;
  worldModelCache = { mtimeMs: stats.mtimeMs, file };
  return file;
}

/** Test-only escape hatch — clears the module-level cache between cases so
 *  one test's cached file can't leak into the next. */
export function __resetWorldModelCacheForTests(): void {
  worldModelCache = null;
}

export async function fetchBlastRadius(entityId: string): Promise<AdminFetchResult<BlastRadiusResult>> {
  try {
    const file = await readWorldModel();
    return ok(computeBlastRadius(file.edges, entityId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return unconfigured('Helm World Model (docs/generated/WORLD_MODEL.json unreadable — run `npm run knowledge:world-model` to regenerate)');
    }
    return failed(error instanceof Error ? error.message : String(error));
  }
}

// ── Causal confidence ladder (renders release-context.ts's existing math) ──

/**
 * Formats an already-computed `ReleaseRelationshipVerdict`
 * (`src/lib/admin/incidents/release-context.ts`'s `classifyReleaseRelationship`
 * — the Phase 0 causal-confidence engine this repo already built, capped
 * below 1) as the evidence-ladder text the brief specifies: "LIKELY CAUSED
 * BY RELEASE … 0.86: + began 4m after deploy, + affected feature changed
 * …, − external provider latency also elevated". Pure formatting only — no
 * new confidence math, deliberately, to avoid a second causal engine next
 * to the one Phase 0 already shipped.
 */
export function formatCausalConfidenceLadder(verdict: ReleaseRelationshipVerdict, releaseSha: string): string[] {
  const lines: string[] = [];
  const pct = Math.round(verdict.confidence * 100);
  const relationshipLabel = verdict.relationship.replace(/-/g, ' ').toUpperCase();
  lines.push(`${relationshipLabel} · release ${releaseSha} · confidence ${pct}%${verdict.confidence >= 1 ? ' (should never happen — flag this)' : ''}`);
  for (const reason of verdict.evidenceFor) lines.push(`+ ${reason}`);
  for (const reason of verdict.evidenceAgainst) lines.push(`− ${reason}`);
  return lines;
}
