import Link from 'next/link';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import {
  actionOutcomes,
  audienceWords,
  clubhouseHref,
  controlSummaryForPeople,
  withScope,
  type ActionRow,
  type ClubhouseScope,
  type ControlRow,
} from '@/lib/admin/clubhouse/screens';
import { ActionChip, IdChip, PageChip } from './chips';

/**
 * B03 rows (plan §8): the label as a person reads it (a run-time template in words), the control ID, what it does,
 * who sees it, its board verdict, its page and the actions it runs. Taps and success are not shown per row until the
 * pipe counts them: the page says so once, instead of two dashes on every row.
 */
export function ControlList({
  rows,
  scope,
  pageNames,
}: {
  rows: readonly ControlRow[];
  scope: ClubhouseScope;
  /** Page id → its name, so a chip reads "Messages", not "P007". P000 is the shared pieces every page uses. */
  pageNames?: Readonly<Record<string, string>>;
}) {
  return (
    <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface">
      {rows.map((c) => {
        const summary = controlSummaryForPeople(c);
        const audience = audienceWords(c.role, c.viewport);
        const pageName = c.page === 'P000' ? 'Shared' : pageNames?.[c.page];
        return (
        <li key={c.id} className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-1.5 px-3 py-3">
          <div className="min-w-0 flex-1 basis-64">
            <Link
              href={withScope(clubhouseHref.control(c.id), scope)}
              data-br={BR.controls.row}
              className="flex min-h-11 min-w-0 flex-col justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 break-words text-body font-semibold text-text-primary hover:underline">{summary.headline}</span>
                {summary.runTime ? <span className="text-caption text-text-tertiary">label set at run time</span> : null}
              </span>
              <span className="font-fw-mono text-caption text-text-tertiary">{c.id}</span>
            </Link>
            {summary.detail ? <p className="mt-1 break-words text-body-sm text-text-secondary">{summary.detail}</p> : null}
            {audience || c.verdict ? (
              <p className="mt-1 text-caption text-text-tertiary">
                {audience ?? ''}
                {c.verdict ? (
                  <span className={c.verdict.toUpperCase() === 'GAP' ? 'font-semibold text-fw-warning-text' : ''}>
                    {audience ? ' · ' : ''}board: {c.verdict}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <PageChip id={c.page} name={pageName} href={withScope(clubhouseHref.page(c.page), scope)} br={BR.pages.row} />
            {c.actions.map((a) => (
              <ActionChip key={a} id={a} href={withScope(clubhouseHref.action(a), scope)} br={BR.controls.actionChip} />
            ))}
          </div>
        </li>
        );
      })}
    </ul>
  );
}

/** B04 rows (plan §8): page, label, the server action, and its outcomes. Rates and timing wait for the pipe, said once on the page. */
export function ActionList({
  rows,
  graph,
  scope,
}: {
  rows: readonly ActionRow[];
  graph: BridgeGraph;
  scope: ClubhouseScope;
}) {
  return (
    <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface">
      {rows.map((a) => (
        <li key={a.id} className="min-w-0 px-3 py-2.5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <Link
              href={withScope(clubhouseHref.action(a.id), scope)}
              data-br={BR.actions.row}
              className="inline-flex min-h-11 min-w-0 flex-1 basis-64 flex-col justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              <span className="break-words text-body font-semibold text-text-primary hover:underline">{a.label}</span>
              <span className="break-words font-fw-mono text-caption text-text-tertiary [overflow-wrap:anywhere]">{a.id}</span>
            </Link>
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
