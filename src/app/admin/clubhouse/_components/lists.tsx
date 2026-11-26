import Link from 'next/link';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import {
  actionOutcomes,
  clubhouseHref,
  controlLabel,
  withScope,
  type ActionRow,
  type ClubhouseScope,
  type ControlRow,
} from '@/lib/admin/clubhouse/screens';
import { ActionChip, IdChip, PageChip } from './chips';
import { NoSignalCell } from './frame';

/**
 * B03 rows (plan §8): the control ID, the label as drawn, what it does, page and role, its board verdict and the
 * actions it runs. Taps, success and frustration are signal columns: a dash that says "No signal yet".
 */
export function ControlList({
  rows,
  scope,
  noSignalCode,
}: {
  rows: readonly ControlRow[];
  scope: ClubhouseScope;
  noSignalCode: string;
}) {
  return (
    <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface">
      {rows.map((c) => (
        <li key={c.id} className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-1.5 px-3 py-2.5">
          <div className="min-w-0 flex-1 basis-64">
            <Link
              href={withScope(clubhouseHref.control(c.id), scope)}
              data-br={BR.controls.row}
              className="inline-flex min-h-8 min-w-0 flex-wrap items-baseline gap-x-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              <span className="font-fw-mono text-caption font-semibold text-text-primary">{c.id}</span>
              <span className="min-w-0 break-words text-body-sm font-medium text-text-primary hover:underline">
                {controlLabel(c)}
              </span>
            </Link>
            {c.description ? <p className="text-caption text-text-secondary">{c.description}</p> : null}
            <p className="mt-0.5 text-caption text-text-tertiary">
              {[c.surface, c.role, c.viewport].filter(Boolean).join(' · ') || 'role and viewport not recorded'}
              {c.verdict ? (
                <span className={c.verdict.toUpperCase() === 'GAP' ? 'ml-1.5 font-semibold text-fw-warning-text' : 'ml-1.5'}>
                  · board: {c.verdict}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <PageChip id={c.page} href={withScope(clubhouseHref.page(c.page), scope)} br={BR.pages.row} />
            {c.actions.map((a) => (
              <ActionChip key={a} id={a} href={withScope(clubhouseHref.action(a), scope)} br={BR.controls.actionChip} />
            ))}
          </div>
          <dl className="flex shrink-0 gap-3 text-caption text-text-tertiary">
            <div className="flex gap-1">
              <dt>taps</dt>
              <dd><NoSignalCell code={noSignalCode} /></dd>
            </div>
            <div className="flex gap-1">
              <dt>success</dt>
              <dd><NoSignalCell code={noSignalCode} /></dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** B04 rows (plan §8): page, label, the server action, and its outcomes; rates and timing are signal columns. */
export function ActionList({
  rows,
  graph,
  scope,
  noSignalCode,
}: {
  rows: readonly ActionRow[];
  graph: BridgeGraph;
  scope: ClubhouseScope;
  noSignalCode: string;
}) {
  return (
    <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface">
      {rows.map((a) => (
        <li key={a.id} className="min-w-0 px-3 py-2.5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <Link
              href={withScope(clubhouseHref.action(a.id), scope)}
              data-br={BR.actions.row}
              className="inline-flex min-h-8 min-w-0 flex-1 basis-64 flex-col rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              <span className="break-words text-body-sm font-medium text-text-primary hover:underline">{a.label}</span>
              <span className="break-words font-fw-mono text-caption text-text-tertiary [overflow-wrap:anywhere]">{a.id}</span>
            </Link>
            <dl className="flex shrink-0 flex-wrap gap-3 text-caption text-text-tertiary">
              <div className="flex gap-1">
                <dt>tries</dt>
                <dd><NoSignalCell code={noSignalCode} /></dd>
              </div>
              <div className="flex gap-1">
                <dt>success</dt>
                <dd><NoSignalCell code={noSignalCode} /></dd>
              </div>
              <div className="flex gap-1">
                <dt>p95</dt>
                <dd><NoSignalCell code={noSignalCode} /></dd>
              </div>
            </dl>
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <PageChip id={a.page} href={withScope(clubhouseHref.page(a.page), scope)} br={BR.pages.row} />
            {actionOutcomes(graph, a).map((o) => (
              <IdChip
                key={`${o.outcome}-${o.id}`}
                id={o.id}
                ch={o.ch}
                category={o.category}
                status={o.status}
                href={withScope(clubhouseHref.code(o.id), scope)}
                br={BR.actions.funnelSegment}
                title={`${o.outcome}: ${o.meaning ?? (o.missing ? 'not in the contract' : '')}`}
              />
            ))}
            {a.driftCount > 0 ? (
              <span className="rounded-full border border-fw-warning-ring bg-fw-warning-bg px-2 py-0.5 text-caption font-medium text-fw-warning-ink">
                {a.driftCount} outcome{a.driftCount === 1 ? '' : 's'} off contract
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
