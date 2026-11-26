import Link from 'next/link';
import type { ReactNode } from 'react';
import { PackageOpen, RadioTower } from 'lucide-react';
import { Surface } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import { clubhouseHref, describeScope, liveRef, type ClubhouseScope } from '@/lib/admin/clubhouse/screens';
import { describeLive, type LiveScope } from '@/lib/admin/clubhouse/live-scope';
import type { PipeStatus } from '@/lib/admin/clubhouse/live-model';
import { TabHeader } from '../../_components/TabHeader';
import { PanelStale } from '../../_components/PanelStates';
import { CopyReportButton } from '../../_components/CopyReportButton';
import { LocalTime } from '../../_components/LocalTime';
import { ScopeBar, type ScopeBarPage } from './ScopeBar';

/**
 * One anatomy for every Clubhouse screen (plan §7.5):
 *   1. the question line, under the title;
 *   2. the truth line: when it was read, the pipe, the release, the scope;
 *   3. the scope bar;
 *   4. the body;
 *   5. the evidence footer: what the screen read, and Copy as Markdown.
 */
export function ClubhouseFrame({
  title,
  question,
  graph,
  scope,
  pages,
  noSignalCode,
  copyCode,
  report,
  sources,
  actions,
  showScope = true,
  live,
  children,
}: {
  title: ReactNode;
  /** The one question this screen answers, in plain words. */
  question: string;
  graph: BridgeGraph;
  scope: ClubhouseScope;
  pages: readonly ScopeBarPage[];
  /** This screen's BR-xx93. */
  noSignalCode: string;
  /** This screen's Copy control. */
  copyCode: string;
  /** The screen as Markdown, built on the server (never a function across the RSC boundary). */
  report: string;
  /** Files and tables the screen read. */
  sources: readonly string[];
  actions?: ReactNode;
  showScope?: boolean;
  /** A live lens: the pipe as read, the window and platform, and whether a read was cut short. */
  live?: LiveTruth;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <TabHeader title={title} description={question} actions={actions} />
      <TruthLine graph={graph} scope={scope} noSignalCode={noSignalCode} live={live} />
      {showScope ? <ScopeBar pages={pages} live={Boolean(live)} /> : null}
      <div className="min-w-0 space-y-5">{children}</div>
      <EvidenceFooter sources={sources} report={report} copyCode={copyCode} />
    </div>
  );
}

/**
 * When it was read, the contract it was read against, the release, and the pipe. The pipe is honest by construction:
 * until signals reach the Bridge it says "No signal yet", never a green dot.
 */
export interface LiveTruth {
  pipe: PipeStatus;
  scope: LiveScope;
  truncated?: boolean;
  /** The code the pipe link carries on this screen: Pulse's Pipe dot (BR-0106). */
  pipeCode?: string;
}

const pipeLink =
  'inline-flex min-h-6 items-center gap-1 rounded-fw-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500';

const PIPE_TONE: Record<PipeStatus['tone'], string> = {
  live: 'text-fw-success-ink',
  silent: 'font-semibold text-fw-danger-ink',
  off: 'text-text-secondary',
  'no-signal': 'text-text-secondary',
  unknown: 'text-fw-warning-ink',
};

export function TruthLine({
  graph,
  scope,
  noSignalCode,
  live,
}: {
  graph: BridgeGraph;
  scope: ClubhouseScope;
  noSignalCode: string;
  live?: LiveTruth;
}) {
  const ref = liveRef();
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-fw-mono text-caption tabular-nums text-text-tertiary">
      <span>
        read <LocalTime iso={new Date().toISOString()} />
      </span>
      <span aria-hidden>·</span>
      <span title="The contract's content hash (bridge-graph.json)">contract {graph.contentHash}</span>
      <span aria-hidden>·</span>
      <span>release {ref === 'main' ? 'unstamped' : ref.slice(0, 7)}</span>
      <span aria-hidden>·</span>
      {/* The pipe opens B11's pipe panel (BR-0106 on Pulse): ingest health lives there. */}
      {live ? (
        <Link
          href={clubhouseHref.pipe()}
          prefetch={false}
          data-br={live.pipeCode}
          className={cn(pipeLink, PIPE_TONE[live.pipe.tone])}
          title={live.pipe.lastEnvelopeAt ? `Newest envelope ${live.pipe.lastEnvelopeAt}. Opens the pipe panel.` : 'Opens the pipe panel'}
        >
          <span data-br={live.pipe.tone === 'no-signal' ? noSignalCode : undefined} className="inline-flex items-center gap-1">
            <RadioTower size={12} aria-hidden />
            {live.pipe.label}
          </span>
        </Link>
      ) : (
        <Link href={clubhouseHref.pipe()} prefetch={false} className={cn(pipeLink, 'text-text-secondary')} title="Opens the pipe panel">
          <span data-br={noSignalCode} className="inline-flex items-center gap-1">
            <RadioTower size={12} aria-hidden />
            pipe: no signal yet
          </span>
        </Link>
      )}
      <span aria-hidden>·</span>
      <span className="min-w-0 break-words font-fw-sans">
        {describeScope(scope, graph)}
        {live ? ` · ${describeLive(live.scope)}` : null}
      </span>
      {live?.truncated ? (
        <>
          <span aria-hidden>·</span>
          <span className="font-fw-sans text-fw-warning-ink">read cut short: newest rows only</span>
        </>
      ) : null}
    </p>
  );
}

export function EvidenceFooter({
  sources,
  report,
  copyCode,
}: {
  sources: readonly string[];
  report: string;
  copyCode: string;
}) {
  return (
    <footer className="flex flex-wrap items-start justify-between gap-3 border-t border-border-subtle pt-3">
      <div className="min-w-0 flex-1 basis-64 text-caption text-text-tertiary">
        <p className="font-medium text-text-secondary">Read from</p>
        <ul className="mt-0.5 space-y-0.5">
          {sources.map((s) => (
            <li key={s} className="break-words font-fw-mono [overflow-wrap:anywhere]">
              {s}
            </li>
          ))}
        </ul>
      </div>
      <span data-br={copyCode}>
        <CopyReportButton report={report} label="Copy as Markdown" size="sm" />
      </span>
    </footer>
  );
}

/**
 * BR-xx93, the block form: where live counts would go. Says why there is nothing, so an empty panel is never read
 * as "nothing happened".
 */
export function NoSignal({
  code,
  what,
  className,
}: {
  code: string;
  /** What would be here: "Taps, success rate and frustration". */
  what: string;
  className?: string;
}) {
  return (
    <div
      data-br={code}
      role="note"
      className={cn(
        'flex min-w-0 items-start gap-2.5 rounded-fw-md border border-dashed border-border-strong bg-surface-sunken px-3 py-2.5',
        className,
      )}
    >
      <RadioTower size={16} aria-hidden className="mt-0.5 shrink-0 text-text-tertiary" />
      <p className="min-w-0 text-body-sm text-text-secondary">
        <span className="font-medium text-text-primary">No signal yet.</span> {what} will show here once Clubhouse
        signals reach the Bridge. Until then nothing can be counted, so nothing is claimed.
      </p>
    </div>
  );
}

/** BR-xx93, the cell form: a dash that says what it is to a screen reader and on hover. */
export function NoSignalCell({ code }: { code: string }) {
  return (
    <span data-br={code} title="No signal yet" className="font-fw-mono text-text-tertiary">
      —<span className="sr-only">No signal yet</span>
    </span>
  );
}

/** BR-xx92: the graph could not be read. Try again re-requests the page. */
export function GraphUnavailable({ code, title, retryHref }: { code: string; title: string; retryHref: string }) {
  return (
    <div data-br={code} className="space-y-4">
      <TabHeader title={title} />
      <PanelStale
        label="The Clubhouse contract"
        error="docs/clubhouse/generated/bridge-graph.json could not be read on this server."
        action={
          <Link
            href={retryHref}
            prefetch={false}
            className="mt-1 inline-flex min-h-9 items-center rounded-lg border border-fw-warning/40 px-3 text-xs font-medium text-warm-700 hover:bg-fw-warning/10"
          >
            Try again
          </Link>
        }
      />
    </div>
  );
}

/**
 * A control the plan numbers that cannot work yet, because its store does not exist (Mark expected, Watch and the
 * Duet queue wait for bridge_notes in the held migration 20261124090000). It renders, carries its code and says what
 * it waits for, rather than vanishing: a control that disappears can't be learned.
 */
export function PendingControl({ code, label, arrives }: { code: string; label: string; arrives: string }) {
  return (
    <button
      type="button"
      disabled
      data-br={code}
      title={arrives}
      className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-fw-sm border border-dashed border-border-strong px-3 text-caption font-medium text-text-tertiary"
    >
      {label}
      <span className="sr-only">: {arrives}</span>
    </button>
  );
}

/**
 * "Context pack" on a dossier (BR-0209, BR-0306, BR-0407, BR-0509), a person or team (BR-0805), a release (BR-1005)
 * or a readiness finding (BR-1207): opens the Duet desk (B13) with the pack for it already built.
 */
export function PackLink({ code, target, label = 'Context pack' }: { code: string; target: string; label?: string }) {
  return (
    <Link
      href={clubhouseHref.duet(target)}
      data-br={code}
      prefetch={false}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-fw-sm border border-border-control bg-surface px-3 text-caption font-medium text-text-primary hover:border-border-strong hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
    >
      <PackageOpen size={14} aria-hidden />
      {label}
    </Link>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Surface elevation="border" padding="sm" className={cn('min-w-0', className)} id={id}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-body font-semibold text-text-primary">{title}</h2>
          {description ? <p className="mt-0.5 text-caption text-text-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Surface>
  );
}

/** A row of links that act as filter or sort chips. `aria-current` marks the active one. */
export function LinkChips({
  label,
  code,
  options,
}: {
  label: string;
  code: string;
  options: ReadonlyArray<{ key: string; label: string; href?: string; active?: boolean; count?: number; pending?: string }>;
}) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="mr-1 text-caption font-medium text-text-tertiary">{label}</span>
      {options.map((o) =>
        o.href && !o.pending ? (
          <Link
            key={o.key}
            href={o.href}
            data-br={code}
            aria-current={o.active ? 'true' : undefined}
            className={cn(
              'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-caption font-medium [@media(pointer:coarse)]:min-h-10',
              o.active
                ? 'border-accent-300 bg-accent-wash text-accent-ink'
                : 'border-border-control bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary',
            )}
          >
            {o.label}
            {o.count !== undefined ? <span className="font-fw-mono tabular-nums text-text-tertiary">{o.count}</span> : null}
          </Link>
        ) : (
          <span
            key={o.key}
            data-br={code}
            aria-disabled="true"
            title={o.pending}
            className="inline-flex min-h-8 cursor-not-allowed items-center rounded-full border border-dashed border-border-subtle px-2.5 text-caption text-text-tertiary [@media(pointer:coarse)]:min-h-10"
          >
            {o.label}
            {o.pending ? <span className="sr-only">: {o.pending}</span> : null}
          </span>
        ),
      )}
    </div>
  );
}
