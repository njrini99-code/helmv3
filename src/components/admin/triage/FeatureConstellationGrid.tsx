/**
 * Bridge Premium Phase 3 — Feature Constellation for `/admin/reliability`.
 *
 * Deliberately a GRID, not a force-directed graph (brief §44: "no giant
 * force-directed graph"). Each card is one feature node — label, app,
 * posture, trend, signal volume — and shared-table relationships render as a
 * short text line under the card rather than drawn lines, so the layout
 * stays calm and grid-shaped at any node count instead of needing physics.
 *
 * `to be replaced by premium/<name>` — no shared `src/components/admin/
 * premium/*` node-grid primitive existed on `agent/bridge-premium-p1` as of
 * this PR (branch not yet pushed).
 */
import Link from 'next/link';
import { StatusPill, type FwStatusTone } from '@/components/fairway';
import type {
  ConstellationEdge,
  ConstellationNode,
  FeatureConstellationView,
} from '@/lib/admin/triage/feature-constellation';

const STATUS_TONE: Record<ConstellationNode['status'], FwStatusTone> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
  neutral: 'neutral',
};

const TREND_GLYPH: Record<ConstellationNode['trend'], string> = {
  improving: '↓',
  flat: '·',
  worsening: '↑',
};

function edgesFor(key: string, edges: readonly ConstellationEdge[]): ConstellationEdge[] {
  return edges.filter((e) => e.source === key || e.target === key);
}

function NodeCard({
  node,
  edges,
  selected,
}: {
  node: ConstellationNode;
  edges: readonly ConstellationEdge[];
  selected: boolean;
}) {
  const related = edgesFor(node.key, edges);

  return (
    <Link
      href={`?feature=${encodeURIComponent(node.key)}`}
      className={`block rounded-fw-md border p-3 transition-colors ${
        selected ? 'border-fw-accent-ink bg-surface' : 'border-warm-200 bg-surface hover:bg-warm-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-warm-900">{node.label}</span>
        <StatusPill tone={STATUS_TONE[node.status]} dot size="sm">
          {node.status}
        </StatusPill>
      </div>
      <div className="mt-1 flex items-center gap-2 text-caption text-warm-500">
        <span className="uppercase tracking-wide">{node.app}</span>
        <span aria-hidden>·</span>
        <span title={`trend: ${node.trend}`}>
          {TREND_GLYPH[node.trend]} {node.trend}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-caption">
        <span className="text-warm-500">Signal volume</span>
        <span className="font-fw-mono tabular-nums text-warm-700">{node.signalVolume.toLocaleString()}</span>
      </div>
      {related.length > 0 ? (
        <p className="mt-1.5 truncate text-caption text-warm-400" title={related.map((e) => e.sharedTable).join(', ')}>
          shares {related.map((e) => e.sharedTable).join(', ')} with{' '}
          {related.map((e) => (e.source === node.key ? e.target : e.source)).join(', ')}
        </p>
      ) : null}
    </Link>
  );
}

export function FeatureConstellationGrid({
  view,
  selectedKey,
}: {
  view: FeatureConstellationView;
  selectedKey: string | null;
}) {
  if (view.nodes.length === 0) {
    return <p className="text-sm text-warm-500">No feature health data available this refresh.</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {view.nodes.map((node) => (
          <NodeCard key={node.key} node={node} edges={view.edges} selected={node.key === selectedKey} />
        ))}
      </div>
      {view.edgeSource === 'none' ? (
        <p className="mt-3 text-caption text-warm-400">
          No feature currently shares a primary or heartbeat table with another — no edges to draw this refresh.
        </p>
      ) : view.edgeSource === 'shared-table' ? (
        <p className="mt-3 text-caption text-warm-400">
          Edges shown are shared-table relationships from the feature registry — no World Model file exists on this
          branch, and memory/registry.yml carries no feature-to-feature edges to fall back to.
        </p>
      ) : null}
    </div>
  );
}
