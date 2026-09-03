import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { OrbitNode, OrbitSnapshot, OrbitNodeState } from '@/lib/admin/command-deck/types';

/**
 * Helm System Orbit (brief §11) — the Command Deck's one dominant visual.
 *
 * Server-rendered SVG, tokens only (no hex/rgb literals — every fill/stroke
 * is a `var(--fw-*)` reference, same convention `charts/theme.ts` documents
 * for the rest of Fairway's viz kit, kept local here rather than imported
 * because that file is deliberately scoped to its own folder). No client JS:
 * the only motion is a single CSS pulse dot, gated by Tailwind's
 * `motion-safe:` variant, which already resolves `prefers-reduced-motion`
 * with no bundle cost.
 *
 * Desktop renders the circular orbit; brief §10/§41-43 explicitly rule out a
 * network diagram on a phone ("No network diagram on a phone" / "Orbit ->
 * node matrix/rail"), so `md:hidden` swaps it for a stacked node list below
 * `md`. Both read the SAME `OrbitSnapshot` — two presentations, one model.
 */

const NODE_STYLE: Readonly<Record<OrbitNodeState, { fill: string; stroke: string; text: string }>> = {
  healthy: { fill: 'var(--fw-color-accent-50)', stroke: 'var(--fw-color-accent-700)', text: 'var(--fw-color-accent-700)' },
  degraded: { fill: 'var(--fw-color-warning-bg)', stroke: 'var(--fw-color-warning)', text: 'var(--fw-color-warning-ink)' },
  critical: { fill: 'var(--fw-color-danger-bg)', stroke: 'var(--fw-color-danger)', text: 'var(--fw-color-danger-ink)' },
  unknown: { fill: 'var(--fw-color-surface-sunken)', stroke: 'var(--fw-color-text-tertiary)', text: 'var(--fw-color-text-tertiary)' },
};

const VIEW_SIZE = 400;
const CENTER = VIEW_SIZE / 2;
const ORBIT_RADIUS = 148;
const NODE_RADIUS = 38;

function nodePosition(index: number, total: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTER + ORBIT_RADIUS * Math.cos(angle), y: CENTER + ORBIT_RADIUS * Math.sin(angle) };
}

function OrbitNodeGlyph({ node, index, total }: { node: OrbitNode; index: number; total: number }) {
  const { x, y } = nodePosition(index, total);
  const style = NODE_STYLE[node.state];
  const labelBelow = y > CENTER; // keep labels from colliding with the hub

  const content = (
    <g>
      {/* Release halo — a wider, soft ring behind the node itself. */}
      {node.releaseHalo ? (
        <circle cx={x} cy={y} r={NODE_RADIUS + 9} fill="none" stroke="var(--fw-color-accent-300)" strokeWidth={2} opacity={0.55} />
      ) : null}
      <circle
        cx={x}
        cy={y}
        r={NODE_RADIUS}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={2.5}
        // Dashed ring = evidence incomplete/unreadable (brief §4 visual vocabulary).
        strokeDasharray={node.evidenceComplete ? undefined : '4 3'}
      />
      {node.pulsing ? (
        <circle cx={x} cy={y - NODE_RADIUS - 9} r={3.5} fill={style.stroke} className="motion-safe:animate-pulse" />
      ) : null}
      <text x={x} y={y - 3} textAnchor="middle" fontSize={12} fontWeight={600} fill={style.text} className="font-fw-sans">
        {node.label}
      </text>
      <text x={x} y={y + 13} textAnchor="middle" fontSize={10} fill={style.text} opacity={0.85} className="font-fw-sans">
        {node.stateWord}
      </text>
      {labelBelow ? (
        <text x={x} y={y + NODE_RADIUS + 16} textAnchor="middle" fontSize={10} fill="var(--fw-color-text-tertiary)" className="font-fw-mono tabular-nums">
          {node.eventCount !== null ? `${node.eventCount}` : node.readout ?? ''}
        </text>
      ) : (
        <text x={x} y={y - NODE_RADIUS - 16} textAnchor="middle" fontSize={10} fill="var(--fw-color-text-tertiary)" className="font-fw-mono tabular-nums">
          {node.eventCount !== null ? `${node.eventCount}` : node.readout ?? ''}
        </text>
      )}
    </g>
  );

  if (!node.href) return content;
  // A plain SVG `<a>`, not `next/link`'s `Link` — this repo has no precedent
  // for nesting `Link` inside `<svg>` (grepped every `charts/*.tsx`; the one
  // hit renders its links from ordinary HTML `<div>`s, not SVG), and an SVG
  // `<a>` is a well-defined native element React namespaces correctly as a
  // descendant of `<svg>`. A full navigation here (no client-side prefetch)
  // is the right tradeoff over an unverified pattern on the page's one
  // dominant visual.
  return (
    <a href={node.href} aria-label={`${node.label}: ${node.stateWord}`}>
      {content}
    </a>
  );
}

const ORBIT_TITLE_ID = 'helm-system-orbit-title';

function OrbitSvg({ snapshot }: { snapshot: OrbitSnapshot }) {
  const total = snapshot.nodes.length;
  return (
    <svg
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      // `role="img"` asserts every descendant is flattened, non-interactive
      // content — false here, since each node with an `href` renders a real
      // focusable `<a>` (its own `aria-label` below). `role="group"` with
      // `aria-labelledby` names the collection as a whole while leaving each
      // link individually reachable and labeled by assistive tech, instead
      // of an `<svg role="img">` that either hides the links entirely or
      // announces them inconsistently depending on the screen reader.
      role="group"
      aria-labelledby={ORBIT_TITLE_ID}
      className="mx-auto h-auto w-full max-w-[420px]"
    >
      <title id={ORBIT_TITLE_ID}>
        {`Helm System Orbit: ${snapshot.nodes.map((n) => `${n.label} ${n.stateWord}`).join(', ')}`}
      </title>
      {/* Thin dependency lines from each node to the hub — "thin line = known
          dependency" (brief §4). Deliberately not brightened per-incident yet
          (that needs incident-selection state, out of Phase 2's scope). */}
      {snapshot.nodes.map((node, i) => {
        const { x, y } = nodePosition(i, total);
        return (
          <line
            key={`line-${node.id}`}
            x1={CENTER}
            y1={CENTER}
            x2={x}
            y2={y}
            stroke="var(--fw-color-border-subtle)"
            strokeWidth={1}
          />
        );
      })}
      <circle cx={CENTER} cy={CENTER} r={30} fill="var(--fw-color-surface-tint)" stroke="var(--fw-color-border-subtle)" />
      <text x={CENTER} y={CENTER + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--fw-color-text-secondary)" className="font-fw-sans">
        HELM
      </text>
      {snapshot.nodes.map((node, i) => (
        <OrbitNodeGlyph key={node.id} node={node} index={i} total={total} />
      ))}
    </svg>
  );
}

function OrbitNodeRow({ node }: { node: OrbitNode }) {
  const style = NODE_STYLE[node.state];
  const row = (
    <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-warm-200 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full border"
          style={{ backgroundColor: style.fill, borderColor: style.stroke }}
        />
        <span className="truncate text-sm font-medium text-warm-900">{node.label}</span>
      </div>
      <span className="shrink-0 text-caption font-medium" style={{ color: style.text }}>
        {node.stateWord}
        {node.eventCount !== null ? ` · ${node.eventCount}` : ''}
        {!node.evidenceComplete ? ' · unread' : ''}
      </span>
    </div>
  );
  if (!node.href) return row;
  return (
    <Link href={node.href} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500">
      {row}
    </Link>
  );
}

export function SystemOrbit({ snapshot }: { snapshot: OrbitSnapshot }) {
  return (
    <div>
      <div className="hidden md:block">
        <OrbitSvg snapshot={snapshot} />
      </div>
      {/* Mobile: a compact node list, never the network diagram (§10/§41-43). */}
      <div className={cn('grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:hidden')}>
        {snapshot.nodes.map((node) => (
          <OrbitNodeRow key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}
