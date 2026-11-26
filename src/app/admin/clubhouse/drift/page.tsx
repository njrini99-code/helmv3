import Link from 'next/link';
import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import {
  DRIFT_LISTS,
  buildTimeDrift,
  driftCounts,
  driftExport,
  driftMeta,
  neverSeenCandidates,
  parseDriftList,
  runtimeEntries,
  type BuildDrift,
  type DriftEntry,
  type DriftListKey,
  type DriftListMeta,
  type RuntimeDrift,
} from '@/lib/admin/clubhouse/drift';
import { readRuntimeDrift } from '@/lib/admin/clubhouse/drift-server';
import { clubhouseHref, githubBlobUrl, liveRef, markdownTable, withScope, type ClubhouseScope, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { CopyReportButton } from '../../_components/CopyReportButton';
import { PanelStale } from '../../_components/PanelStates';
import { ClubhouseFrame, GraphUnavailable, LinkChips, NoSignal, Section } from '../_components/frame';
import { PageChip } from '../_components/chips';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';

export const metadata: Metadata = { title: 'Drift' };

export const dynamic = 'force-dynamic';

/** Long lists (the §4.7 one runs to four figures) show this many rows; Copy and JSON carry them all. */
const ROW_LIMIT = 200;

/**
 * B11 Drift (plan §8): are the docs still the truth? Eleven tabs: the plan's nine lists and the two it names in
 * §4.3 and §4.7. Build lists count now, from the graph this deploy shipped with; runtime lists read `clubhouse_drift`
 * and say "No signal yet" until the held migration lands. The pipe panel (BR-1104) is where ingest health will be.
 */
export default async function ClubhouseDriftPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.drift.failed} title="Drift" retryHref={clubhouseHref.drift()} />;
  const { graph, scope, pages } = read;

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const runtime = await readRuntimeDrift(supabase);
  const build = buildTimeDrift(graph);
  const active = parseDriftList(sp.list);
  const meta = driftMeta(active);
  const counts = driftCounts(build, runtime, graph);
  const entries = scoped(listEntries(graph, build, runtime, active), scope);
  const zero = counts.filter((c) => c.count === 0).length;
  const uncounted = counts.filter((c) => c.count === null).length;

  const json = JSON.stringify(driftExport(graph, build, runtime), null, 2);
  const report = [
    `# Clubhouse drift (contract ${graph.contentHash})`,
    '',
    markdownTable(
      ['#', 'List', 'Found by', 'Count', 'Held by'],
      DRIFT_LISTS.map((l, i) => [l.n, l.title, l.source, counts[i]!.count ?? 'no signal yet', l.heldBy ?? '—']),
    ),
    '',
    `## ${meta.n}. ${meta.title}`,
    '',
    entries.length ? entries.map((e) => `- ${e.label}: ${e.detail}`).join('\n') : '- none',
  ].join('\n');

  return (
    <ClubhouseFrame
      title="Drift"
      question="Are the docs still the truth?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.drift.noSignal}
      copyCode={BR.drift.export}
      report={report}
      sources={[GRAPH_SOURCE, 'config/clubhouse/controls/*.json', 'public.clubhouse_drift (held migration 20261124090000)']}
      actions={
        <span data-br={BR.drift.export}>
          <CopyReportButton report={json} label="Copy as JSON" size="sm" />
        </span>
      }
    >
      <p className="text-body-sm text-text-secondary">
        <span className="font-fw-mono font-semibold tabular-nums text-text-primary">{zero}</span> of {DRIFT_LISTS.length} lists at zero
        {uncounted ? (
          <>
            {' · '}
            <span className="font-fw-mono tabular-nums">{uncounted}</span> can’t be counted until signals reach the Bridge
          </>
        ) : null}
        .
      </p>

      <LinkChips
        label="List"
        code={BR.drift.listTab}
        options={DRIFT_LISTS.map((l, i) => ({
          key: l.key,
          label: `${l.n} ${shortTitle(l)}`,
          href: withScope(clubhouseHref.drift(), scope, { list: l.key }),
          active: l.key === active,
          count: counts[i]!.count ?? undefined,
        }))}
      />

      <ListPanel meta={meta} entries={entries} runtime={runtime} graph={graph} scope={scope} />

      <PipePanel runtime={runtime} />
    </ClubhouseFrame>
  );
}

/** The tab's short name: the title up to its first comma or "but". */
function shortTitle(meta: DriftListMeta): string {
  const short: Record<DriftListKey, string> = {
    uncatalogued: 'Uncatalogued codes',
    'unknown-fired': 'Unknown codes fired',
    'deprecated-fired': 'Retired codes fired',
    'reserved-fired': 'Reserved codes fired',
    'never-seen': 'Never seen',
    where: 'Missing files',
    outcomes: 'Outcomes',
    pages: 'Pages without IDs',
    controls: 'Unnumbered controls',
    unlinked: 'Unlinked controls',
    'wrong-page': 'Wrong page',
  };
  return short[meta.key];
}

function listEntries(graph: BridgeGraph, build: BuildDrift, runtime: RuntimeDrift, key: DriftListKey): DriftEntry[] {
  const fromBuild = (build as Partial<Record<DriftListKey, DriftEntry[]>>)[key] ?? [];
  return runtime.state === 'ok' ? [...fromBuild, ...runtimeEntries(graph, runtime.rows, key)] : fromBuild;
}

function scoped(entries: DriftEntry[], scope: ClubhouseScope): DriftEntry[] {
  return scope.page ? entries.filter((e) => !e.page || e.page === scope.page) : entries;
}

function ListPanel({
  meta,
  entries,
  runtime,
  graph,
  scope,
}: {
  meta: DriftListMeta;
  entries: DriftEntry[];
  runtime: RuntimeDrift;
  graph: BridgeGraph;
  scope: ClubhouseScope;
}) {
  const waitsOnSignal = meta.source !== 'build' && runtime.state !== 'ok';
  return (
    <Section
      title={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-fw-mono text-text-tertiary">{meta.n}</span>
          {meta.title}
        </span>
      }
      description={meta.fix}
    >
      <div className="space-y-3">
        {meta.heldBy ? (
          <p className="flex items-start gap-1.5 text-caption text-text-secondary">
            <ShieldCheck size={14} aria-hidden className="mt-0.5 shrink-0 text-fw-success" />
            <span>Held at zero by {meta.heldBy}.</span>
          </p>
        ) : null}
        {meta.key === 'never-seen' ? <NeverSeen graph={graph} /> : null}
        {waitsOnSignal && runtime.state === 'failed' ? (
          <div data-br={BR.drift.failed}>
            <PanelStale
              label="Runtime drift"
              error={runtime.message}
              action={
                <Link
                  href={withScope(clubhouseHref.drift(), scope, { list: meta.key })}
                  prefetch={false}
                  className="mt-1 inline-flex min-h-9 items-center rounded-lg border border-fw-warning/40 px-3 text-xs font-medium text-warm-700 hover:bg-fw-warning/10"
                >
                  Try again
                </Link>
              }
            />
          </div>
        ) : null}
        {waitsOnSignal && runtime.state === 'no-signal' && meta.key !== 'never-seen' ? (
          <NoSignal code={BR.drift.noSignal} what={meta.source === 'build+runtime' ? 'The run-time half (outcomes that fired unlisted)' : 'Every code that fired this way'} />
        ) : null}
        <Entries entries={entries} meta={meta} waitsOnSignal={waitsOnSignal} />
      </div>
    </Section>
  );
}

function Entries({ entries, meta, waitsOnSignal }: { entries: DriftEntry[]; meta: DriftListMeta; waitsOnSignal: boolean }) {
  if (entries.length === 0) {
    if (waitsOnSignal && meta.source === 'runtime') return null;
    return (
      <div data-br={BR.drift.empty}>
        <EmptyState
          variant="subtle"
          title="Zero"
          description={meta.source === 'build+runtime' ? 'Nothing in the files. The run-time half waits on the signal.' : 'Nothing on this list in this scope.'}
        />
      </div>
    );
  }
  const ref = liveRef();
  const shown = entries.slice(0, ROW_LIMIT);
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle">
        {shown.map((e) => (
          <li key={e.key} className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
            <div className="min-w-0 flex-1 basis-64">
              {e.href ? (
                <Link href={e.href} data-br={BR.drift.row} className="inline-flex min-h-8 items-center break-all font-fw-mono text-body-sm font-medium text-accent-ink hover:underline">
                  {e.label}
                </Link>
              ) : e.file ? (
                <a
                  href={githubBlobUrl(e.file, ref)}
                  target="_blank"
                  rel="noreferrer"
                  data-br={BR.drift.row}
                  className="inline-flex min-h-8 items-center gap-1 break-all font-fw-mono text-body-sm font-medium text-accent-ink hover:underline"
                >
                  {e.label}
                  <ExternalLink size={12} aria-hidden className="shrink-0" />
                </a>
              ) : (
                <span data-br={BR.drift.row} className="font-fw-mono text-body-sm font-medium text-text-primary">
                  {e.label}
                </span>
              )}
              <p className="text-caption text-text-secondary [overflow-wrap:anywhere]">{e.detail}</p>
            </div>
            {e.page ? <PageChip id={e.page} href={clubhouseHref.page(e.page)} br={BR.pages.row} /> : null}
          </li>
        ))}
      </ul>
      {entries.length > shown.length ? (
        <p className="text-caption text-text-tertiary">
          Showing {shown.length} of <span className="font-fw-mono tabular-nums">{entries.length}</span>. Copy as Markdown or JSON carries every row.
        </p>
      ) : null}
    </div>
  );
}

/** List 5's denominator: what will need classifying once counters run. */
function NeverSeen({ graph }: { graph: BridgeGraph }) {
  const split = neverSeenCandidates(graph);
  return (
    <div className="space-y-2">
      <dl className="grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-body-sm">
        <dt className="text-text-secondary">Should be common</dt>
        <dd className="text-right font-fw-mono tabular-nums text-text-primary">{split.common}</dd>
        <dt className="text-text-secondary">Rare by nature (validation, offline)</dt>
        <dd className="text-right font-fw-mono tabular-nums text-text-primary">{split.rare}</dd>
      </dl>
      <NoSignal code={BR.drift.noSignal} what="Which of these implemented IDs fired in the last 30 days" />
    </div>
  );
}

/** BR-1104: ingest health. Every figure needs the signal, so the panel says what it will hold and claims none. */
function PipePanel({ runtime }: { runtime: RuntimeDrift }) {
  return (
    <details data-br={BR.drift.pipePanel} className="group/pipe rounded-fw-md border border-border-subtle bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-body-sm font-medium text-text-primary hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
        <span>Pipe</span>
        <span className="text-caption font-normal text-text-tertiary">{runtime.state === 'ok' ? 'drift table readable' : 'no signal yet'}</span>
      </summary>
      <div className="space-y-2 px-3 pb-3">
        <NoSignal code={BR.drift.noSignal} what="Ingest per minute and lag, rejected envelopes and why, the last envelope per page, R-08 and R-09" />
        <p className="text-caption text-text-secondary">
          The kill switch is the <span className="font-fw-mono">clubhouse_signals</span> flag (Releases, Shift+K); POST /api/ch/signal answers 204 while
          it is off.
        </p>
      </div>
    </details>
  );
}
