'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  StatusPill,
  Badge,
  StatStrip,
  Inset,
  type FwStatusTone,
} from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { FlightTraceRun } from '@/app/admin/actions/golf-tracer';
import { LocalTime } from '../_components/LocalTime';
import { flightStepStatusTone, FLIGHT_REQUIREDNESS_LABEL } from '../golf/tracer/tracer-shared';
import { buildTraceTree, type TraceStepNode } from './trace-tree';
import { EM_DASH, displayValue, durationBarPercent, deriveTraceTotalMs } from './trace-view-helpers';

/**
 * The containment tree.
 *
 * Rendered as a flat list with indentation rather than nested <ul>s: the tree is
 * built once in `buildTraceTree` (which already guards cycles and assigns
 * depth), so recursion in the view would only re-derive what the model knows.
 * A flat list also keeps every row a sibling for keyboard order, which nested
 * interactive lists get wrong.
 *
 * `DepthGuides` recovers the visual containment a real nested list would give
 * for free: for a row at depth N it draws one thin vertical rule per ancestor
 * level 0..N-1. Because a rule at column d only keeps appearing on rows whose
 * OWN depth is still > d, the line stops exactly where that ancestor's subtree
 * closes — the same result a nested render gives, without the keyboard-order
 * cost nesting would bring.
 */

/**
 * Fairway's own `<Eyebrow>` component runs its tone class through `cn()`
 * alongside its `text-eyebrow` size token — the exact trap documented above,
 * confirmed the same way: `<Eyebrow tone="tertiary">` silently renders
 * without `text-eyebrow`'s 11px sizing, every time, regardless of caller.
 * That's a shared-component bug outside this tab's ownership to fix, so
 * overline labels here inline the same visual contract as a static string
 * instead of routing through the broken component — the identical pattern
 * `StatTile`/`Numeric` already use for their own overline labels, for what
 * is presumably the same reason.
 */
export const EYEBROW_CLASS = 'font-fw-sans text-eyebrow uppercase text-text-tertiary';

/** The short label — the last dotted segment, since the ancestry is the indent. */
function leafLabel(key: string): string {
  const lastDot = key.lastIndexOf('.');
  return lastDot > 0 ? key.slice(lastDot + 1) : key;
}

/** Fill color for the proportional duration bar — paired with the row's own
 *  StatusPill tone, never a color introduced nowhere else on the row. */
const DURATION_BAR_FILL: Record<FwStatusTone, string> = {
  neutral: 'bg-warm-400',
  accent: 'bg-accent-500',
  success: 'bg-fw-success',
  warning: 'bg-fw-warning',
  danger: 'bg-fw-danger',
  info: 'bg-warm-500',
};

/** Border color for the per-row status rail (see StepRow). */
const RAIL_BORDER: Record<FwStatusTone, string> = {
  neutral: 'border-warm-300',
  accent: 'border-accent-500',
  success: 'border-fw-success',
  warning: 'border-fw-warning',
  danger: 'border-fw-danger',
  info: 'border-warm-400',
};

/**
 * A thin, proportional bar — no chart library, just a div scaled by inline
 * `width`. `totalMs` is the trace-level reference (see the `totalMs`
 * computation in `TraceTree`); a step with no recorded duration (including
 * every MISSING node) renders an empty track rather than a bar, which is
 * itself part of the "never ran" read.
 */
function DurationBar({
  durationMs,
  totalMs,
  tone,
}: {
  durationMs: number | null;
  totalMs: number;
  tone: FwStatusTone;
}) {
  const pct = durationBarPercent(durationMs, totalMs);
  return (
    <span
      aria-hidden="true"
      className="block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-warm-200/50"
    >
      <span
        className={cn(
          'block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none',
          DURATION_BAR_FILL[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** One thin vertical rule per ancestor level — see file header. Purely
 *  decorative (the indentation itself already reflects depth), so hidden
 *  from the accessibility tree. */
function DepthGuides({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <span aria-hidden="true" className="flex shrink-0 self-stretch">
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="w-[14px] shrink-0 border-l border-warm-200/70" />
      ))}
    </span>
  );
}

function StepRow({
  node,
  selected,
  onSelect,
  totalMs,
}: {
  node: TraceStepNode;
  selected: boolean;
  onSelect: (node: TraceStepNode) => void;
  totalMs: number;
}) {
  const tone = flightStepStatusTone(node.status);

  return (
    /* Dense trace-tree row. Every <Button> size carries min-h-[44px], which
       would turn a routine 20-node trace into ~880px of chrome and destroy the
       scannability the tree exists for; `ghost`'s hover:bg-warm-100 also
       collides with this row's selected state. Same documented exception as
       the compact leaderboard row in admin/utilization/FeatureConstellation.tsx. */
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      onClick={() => onSelect(node)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group flex w-full items-stretch rounded-md text-left transition-colors motion-reduce:transition-none',
        'hover:bg-warm-100/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500',
        selected && 'bg-warm-100',
        // MISSING is deliberate and calm, not a second alarm: a dashed
        // outline (a "ghost" convention) rather than a solid danger fill.
        node.isMissing && 'border border-dashed border-fw-danger/25',
      )}
    >
      <DepthGuides depth={node.depth} />
      <span className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 pr-2">
        {/* This row's OWN status — a rail distinct from the ancestry guides
            above. Dashed for a step that never ran, solid otherwise; color is
            never the only channel, the StatusPill text always pairs with it. */}
        <span
          aria-hidden="true"
          className={cn(
            'h-4 w-0 shrink-0 border-l-2',
            node.isMissing ? 'border-dashed border-fw-danger/40' : cn('border-solid', RAIL_BORDER[tone]),
          )}
        />

        <StatusPill tone={tone} size="sm" dot>
          {node.isMissing ? 'not run' : node.status}
        </StatusPill>

        <span
          // Plain template string rather than cn(). Historically necessary:
          // token, classifies it alongside `text-{color}-{shade}`, and drops
          // it in favor of whichever came later — silently rendering this
          // label at the browser default size instead of text-caption's 11px.
          // A plain template string never invokes twMerge, so nothing here
          // competes for the same slot. See the fixed spots below for the
          // same trap (verified against this repo's actual `cn()` output,
          // not assumed).
          className={`min-w-0 flex-1 truncate font-fw-mono text-caption ${node.isMissing ? 'text-warm-500' : 'text-warm-900'}`}
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

        <DurationBar durationMs={node.durationMs} totalMs={totalMs} tone={tone} />

        <span className="w-16 shrink-0 text-right font-fw-mono text-caption tabular-nums text-warm-500">
          {node.durationMs !== null ? `${node.durationMs.toLocaleString()} ms` : EM_DASH}
        </span>
      </span>
    </button>
  );
}

function DetailRow({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  const empty = value === EM_DASH;
  // Plain template string rather than cn(). This used to be REQUIRED:
  // tailwind-merge did not know `text-caption` was a font size and dropped
  // it as a superseded text-colour. That was fixed at the source on
  // 2026-08-27 (src/lib/utils.ts registers the custom font-size group, and
  // src/lib/__tests__/cn-font-size.test.ts pins it), so cn() is safe here
  // now — this stays a plain string only because it needs no merging.
  const valueClassName = `min-w-0 flex-1 break-words text-caption ${mono ? 'font-fw-mono' : 'font-fw-sans'} ${empty ? 'text-warm-400' : 'text-warm-900'}`;
  return (
    <div className="flex gap-3 py-1">
      <span className="w-28 shrink-0 text-caption text-warm-500">{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}

function DetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-warm-200/60 pt-2 first:border-t-0 first:pt-0">
      <span className={`mb-1 block ${EYEBROW_CLASS}`}>{title}</span>
      {children}
    </div>
  );
}

function StepDetail({ node }: { node: TraceStepNode }) {
  const json = (value: unknown) => (value === null || value === undefined ? EM_DASH : JSON.stringify(value));

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg p-3',
        node.isMissing
          ? 'border border-dashed border-warm-300 bg-warm-50/40'
          : 'border border-warm-200/70 bg-warm-50/50',
      )}
    >
      <p className="break-words font-fw-mono text-caption font-medium text-warm-900">{node.key}</p>

      {/* identity / timing / failure / invariants — always all four groups,
          every field always a row (em dash when absent), so the panel's shape
          never jumps as the selection changes. Its own wrapper, separate from
          the key line above: DetailGroup's `first:border-t-0` targets being
          the first child of ITS parent, and that has to actually be true for
          Identity, not merely first among the groups. */}
      <div className="space-y-3">
        <DetailGroup title="Identity">
          <DetailRow label="parent" value={displayValue(node.parentKey)} />
          <DetailRow label="layer" value={node.layer} />
          <DetailRow label="function" value={displayValue(node.functionName)} />
          <DetailRow label="trigger" value={displayValue(node.triggerName)} />
          <DetailRow label="table" value={displayValue(node.tableName)} />
        </DetailGroup>

        <DetailGroup title="Timing">
          <DetailRow label="status" value={node.isMissing ? 'missing — never ran' : node.status} mono={false} />
          <DetailRow label="requiredness" value={FLIGHT_REQUIREDNESS_LABEL[node.requiredness]} mono={false} />
          <DetailRow
            label="started"
            value={node.startedAt ? <LocalTime iso={node.startedAt} variant="datetime" /> : EM_DASH}
          />
          <DetailRow
            label="finished"
            value={node.finishedAt ? <LocalTime iso={node.finishedAt} variant="datetime" /> : EM_DASH}
          />
          <DetailRow
            label="duration"
            value={node.durationMs !== null ? `${node.durationMs.toLocaleString()} ms` : EM_DASH}
          />
        </DetailGroup>

        <DetailGroup title="Failure">
          <DetailRow label="SQLSTATE" value={displayValue(node.errorCode)} />
          <DetailRow label="error" value={displayValue(node.errorSummary)} mono={false} />
        </DetailGroup>

        {/* Expected vs observed is the invariant check — the thing that catches
            "the RPC said success and the rows are not there". */}
        <DetailGroup title="Invariants">
          <DetailRow label="expected" value={json(node.expected)} />
          <DetailRow label="observed" value={json(node.observed)} />
        </DetailGroup>
      </div>

      {node.isMissing && (
        <p className="rounded-md border border-dashed border-warm-300 bg-warm-100/40 px-3 py-2 text-caption leading-4 text-warm-600">
          Required by the workflow; never recorded — expected after an
          upstream failure, not a second independent fault.
        </p>
      )}
    </div>
  );
}

function KpiCell({
  label,
  danger = false,
  pillTone,
  pillLabel,
  children,
}: {
  label: string;
  danger?: boolean;
  pillTone?: FwStatusTone;
  pillLabel?: string;
  children: ReactNode;
}) {
  return (
    <Inset padding="sm" className={cn('flex h-full flex-col gap-2', danger && 'ring-1 ring-fw-danger/30')}>
      <span className={EYEBROW_CLASS}>{label}</span>
      {children}
      {pillTone && pillLabel && (
        <StatusPill tone={pillTone} size="sm" dot>
          {pillLabel}
        </StatusPill>
      )}
    </Inset>
  );
}

/** KPI strip for the selected trace — total duration, steps observed, steps
 *  that never ran, and where reality first diverged. Every number here is
 *  read straight off the same tree the rows below render; nothing here can
 *  disagree with what's on screen underneath it. */
function TraceKpiStrip({
  totalDurationMs,
  stepsObserved,
  stepsNeverRan,
  failureKey,
}: {
  totalDurationMs: number | null;
  stepsObserved: number;
  stepsNeverRan: number;
  failureKey: string | null;
}) {
  return (
    <StatStrip count={4} columns={4} ariaLabel="Selected trace summary">
      <KpiCell label="Total duration">
        <span className="font-fw-mono text-h3 font-semibold tabular-nums text-warm-900">
          {totalDurationMs !== null ? (
            <>
              {totalDurationMs.toLocaleString()}
              <span className="ml-1 text-caption font-normal text-warm-500">ms</span>
            </>
          ) : (
            <span className="text-warm-400">{EM_DASH}</span>
          )}
        </span>
      </KpiCell>

      <KpiCell label="Steps observed">
        <span className="font-fw-mono text-h3 font-semibold tabular-nums text-warm-900">
          {stepsObserved.toLocaleString()}
        </span>
      </KpiCell>

      <KpiCell
        label="Never ran"
        danger={stepsNeverRan > 0}
        pillTone={stepsNeverRan > 0 ? 'danger' : 'success'}
        pillLabel={stepsNeverRan > 0 ? 'required steps missing' : 'all required steps ran'}
      >
        {/* Plain template string rather than cn(): no merging needed here. The
            custom-size drop that once forced this is fixed at the source in
            src/lib/utils.ts. */}
        <span
          className={`font-fw-mono text-h3 font-semibold tabular-nums ${stepsNeverRan > 0 ? 'text-fw-danger-ink' : 'text-warm-900'}`}
        >
          {stepsNeverRan.toLocaleString()}
        </span>
      </KpiCell>

      <KpiCell
        label="Failure point"
        danger={failureKey !== null}
        pillTone={failureKey ? 'danger' : 'success'}
        pillLabel={failureKey ? 'failed here' : 'no failure'}
      >
        {/* Same `cn()` trap as above — `text-body` is a custom size token. */}
        <span
          className={`block truncate font-fw-mono text-body font-semibold ${failureKey ? 'text-fw-danger-ink' : 'text-warm-400'}`}
          title={failureKey ?? undefined}
        >
          {/* The full dotted key, not just the leaf — "where" is the whole
              point of a containment tree, and db.submit_round_atomic.insert_shots
              says something insert_shots alone doesn't. */}
          {failureKey ?? EM_DASH}
        </span>
      </KpiCell>
    </StatStrip>
  );
}

export function TraceTree({
  steps,
  workflow,
  run,
}: {
  steps: readonly Record<string, unknown>[];
  workflow: string;
  /** The selected trace's own run row, for the KPI strip's total-duration
   *  figure — the one number the tree's own rows can't reconstruct on their
   *  own (steps don't necessarily span the trace's full wall-clock time). */
  run?: FlightTraceRun | null;
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

  const stepsObserved = tree.flat.filter((n) => !n.isMissing).length;
  const totalDurationMs = run?.duration_ms ?? null;

  // Reference scale for the proportional duration bars (see trace-view-helpers).
  const totalMs = deriveTraceTotalMs(
    totalDurationMs,
    tree.roots.map((n) => n.durationMs),
  );

  return (
    <div className="space-y-5">
      <TraceKpiStrip
        totalDurationMs={totalDurationMs}
        stepsObserved={stepsObserved}
        stepsNeverRan={tree.missingRequiredCount}
        failureKey={tree.failureKey}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <div className="min-w-[36rem] space-y-0.5">
              {tree.flat.map((node) => (
                <StepRow
                  key={node.key}
                  node={node}
                  selected={node.key === selectedKey}
                  onSelect={(n) => setSelectedKey(n.key === selectedKey ? null : n.key)}
                  totalMs={totalMs}
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
    </div>
  );
}
