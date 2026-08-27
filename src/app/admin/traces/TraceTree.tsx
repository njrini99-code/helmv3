'use client';

import { useMemo, useState } from 'react';
import { StatusPill, Badge } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { flightStepStatusTone, FLIGHT_REQUIREDNESS_LABEL } from '../golf/tracer/tracer-shared';
import { buildTraceTree, type TraceStepNode } from './trace-tree';

/**
 * The containment tree.
 *
 * Rendered as a flat list with indentation rather than nested <ul>s: the tree is
 * built once in `buildTraceTree` (which already guards cycles and assigns
 * depth), so recursion in the view would only re-derive what the model knows.
 * A flat list also keeps every row a sibling for keyboard order, which nested
 * interactive lists get wrong.
 */

/** The short label — the last dotted segment, since the ancestry is the indent. */
function leafLabel(key: string): string {
  const lastDot = key.lastIndexOf('.');
  return lastDot > 0 ? key.slice(lastDot + 1) : key;
}

function StepRow({
  node,
  selected,
  onSelect,
}: {
  node: TraceStepNode;
  selected: boolean;
  onSelect: (node: TraceStepNode) => void;
}) {
  const tone = flightStepStatusTone(node.status);

  return (
    /* Dense trace-tree row. Every <Button> size carries min-h-[44px], which
       would turn a routine 20-node trace into ~880px of chrome and destroy the
       scannability the tree exists for; `ghost`'s hover:bg-warm-100 also
       collides with this row's selected state. Same documented exception, and
       the same reason, as the compact leaderboard row in
       admin/utilization/FeatureConstellation.tsx. */
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      onClick={() => onSelect(node)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left transition-colors',
        'hover:bg-warm-100/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500',
        selected && 'bg-warm-100',
      )}
      style={{ paddingLeft: `${node.depth * 18 + 8}px` }}
    >
      {/* The rail makes containment legible at a glance — a failure three
          levels deep reads as "inside the RPC, inside the action". */}
      <span
        aria-hidden
        className={cn(
          'h-3.5 w-0.5 shrink-0 rounded-full',
          node.status === 'failure' && 'bg-fw-danger',
          node.status === 'missing' && 'bg-fw-danger/40',
          node.status === 'success' && 'bg-fw-success',
          node.status === 'warning' && 'bg-fw-warning',
          !['failure', 'missing', 'success', 'warning'].includes(node.status) && 'bg-warm-300',
        )}
      />

      <StatusPill tone={tone} size="sm" dot>
        {node.isMissing ? 'not run' : node.status}
      </StatusPill>

      <span
        className={cn(
          'min-w-0 flex-1 truncate font-fw-mono text-caption',
          node.isMissing ? 'text-warm-500' : 'text-warm-900',
        )}
        title={node.key}
      >
        {leafLabel(node.key)}
      </span>

      {node.isMissing && (
        <Badge tone="danger" variant="outline" size="sm">
          {FLIGHT_REQUIREDNESS_LABEL[node.requiredness]} · never ran
        </Badge>
      )}

      {node.errorCode && (
        <span className="shrink-0 font-fw-mono text-caption text-fw-danger-ink">{node.errorCode}</span>
      )}

      <span className="w-16 shrink-0 text-right font-fw-mono text-caption tabular-nums text-warm-500">
        {node.durationMs !== null ? `${node.durationMs.toLocaleString()} ms` : '—'}
      </span>
    </button>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-3 py-1">
      <span className="w-28 shrink-0 text-caption text-warm-500">{label}</span>
      <span className="min-w-0 flex-1 break-words font-fw-mono text-caption text-warm-900">{value}</span>
    </div>
  );
}

function StepDetail({ node }: { node: TraceStepNode }) {
  const json = (value: unknown) =>
    value === null || value === undefined ? null : JSON.stringify(value);

  return (
    <div className="rounded-lg border border-warm-200/70 bg-warm-50/50 p-3">
      <p className="font-fw-mono text-caption font-medium text-warm-900">{node.key}</p>
      <div className="mt-2">
        <DetailField label="parent" value={node.parentKey} />
        <DetailField label="layer" value={node.layer} />
        <DetailField label="status" value={node.isMissing ? 'missing — never ran' : node.status} />
        <DetailField label="requiredness" value={FLIGHT_REQUIREDNESS_LABEL[node.requiredness]} />
        <DetailField label="function" value={node.functionName} />
        <DetailField label="trigger" value={node.triggerName} />
        <DetailField label="table" value={node.tableName} />
        <DetailField label="started" value={node.startedAt} />
        <DetailField label="finished" value={node.finishedAt} />
        <DetailField
          label="duration"
          value={node.durationMs !== null ? `${node.durationMs} ms` : null}
        />
        <DetailField label="SQLSTATE" value={node.errorCode} />
        <DetailField label="error" value={node.errorSummary} />
        {/* Expected vs observed is the invariant check — the thing that catches
            "the RPC said success and the rows are not there". */}
        <DetailField label="expected" value={json(node.expected)} />
        <DetailField label="observed" value={json(node.observed)} />
      </div>
      {node.isMissing && (
        <p className="mt-2 text-caption leading-4 text-fw-danger-ink">
          The workflow definition requires this step and the trace never recorded
          it. Where a prior step failed, this is the expected consequence rather
          than a second independent fault.
        </p>
      )}
    </div>
  );
}

export function TraceTree({
  steps,
  workflow,
}: {
  steps: readonly Record<string, unknown>[];
  workflow: string;
}) {
  const tree = useMemo(() => buildTraceTree(steps, workflow), [steps, workflow]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = tree.flat.find((n) => n.key === selectedKey) ?? null;

  if (tree.flat.length === 0) {
    return (
      <p className="py-6 text-center text-caption text-warm-500">
        This trace recorded no steps.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="overflow-x-auto">
          <div className="min-w-[30rem]">
            {tree.flat.map((node) => (
              <StepRow
                key={node.key}
                node={node}
                selected={node.key === selectedKey}
                onSelect={(n) => setSelectedKey(n.key === selectedKey ? null : n.key)}
              />
            ))}
          </div>
        </div>
        {tree.missingRequiredCount > 0 && (
          <p className="mt-3 text-caption text-fw-danger-ink">
            {tree.missingRequiredCount} required step
            {tree.missingRequiredCount === 1 ? '' : 's'} never ran.
          </p>
        )}
      </div>

      <div className="min-w-0">
        {selected ? (
          <StepDetail node={selected} />
        ) : (
          <p className="rounded-lg border border-dashed border-warm-200 p-4 text-caption text-warm-500">
            Select a step to see its timing, function, SQLSTATE, and expected vs
            observed values.
          </p>
        )}
      </div>
    </div>
  );
}
