import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState, SegmentedLinks } from '@/components/fairway';
import { hrefWithView, parseViewFrom } from '@/lib/admin/views';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph, PageId } from '@/lib/admin/clubhouse/graph';
import {
  GATE_ORDER,
  MATRIX_SHOWS,
  PAGE_VIEWS,
  PHONE_CATEGORIES,
  actionRows,
  categoryCode,
  categoryName,
  clubhouseHref,
  controlRows,
  findingRows,
  githubBlobUrl,
  gateWords,
  idsForPage,
  liveRef,
  pageRows,
  parseCategory,
  parseMatrixShow,
  stateMatrix,
  withScope,
  type ClubhouseScope,
  type MatrixShow,
  type PageView,
  type SearchParams,
} from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, LinkChips, NoSignal, PackLink, Section } from '../_components/frame';
import { CategoryLegend, GateMark, IdChip, StatusTag } from '../_components/chips';
import { StateMatrix } from '../_components/StateMatrix';
import { ActionList, ControlList } from '../_components/lists';
import { ForceState } from '../_components/ForceState';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';

export const metadata: Metadata = { title: 'Clubhouse page' };

export const dynamic = 'force-dynamic';

const VIEW_LABEL: Record<PageView, string> = {
  overview: 'Overview',
  states: 'States',
  controls: 'Controls',
  actions: 'Actions',
  contract: 'Contract',
  phone: 'Phone',
  history: 'History',
};

const SHOW_LABEL: Record<MatrixShow, string> = {
  all: 'All',
  implemented: 'Implemented',
  reserved: 'Reserved',
  deprecated: 'Deprecated',
  failures: 'Failure categories',
};

const AUDIENCE_LABEL = { coach: 'coach', player: 'player', shared: 'coach and player', 'signed-out': 'signed out' } as const;

/**
 * B02 Pages, the dossier (plan §8): one Clubhouse page against its contract, in seven views. Graph only; the live
 * failure rate, the fill of the state matrix and the per-release history wait for signals (BR-0293).
 */
export default async function ClubhousePageDossier({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  await requireSuperAdmin();
  const { page: raw } = await params;
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) {
    return <GraphUnavailable code={BR.pages.failed} title="Clubhouse page" retryHref={clubhouseHref.page(raw)} />;
  }
  const { graph, scope, pages } = read;
  const id = decodeURIComponent(raw).toUpperCase() as PageId;
  const page = graph.pages[id];
  if (!page) notFound();

  const pagePath = clubhouseHref.page(id);
  const view = parseViewFrom(PAGE_VIEWS, sp.view);
  const row = pageRows(graph).find((r) => r.id === id)!;
  const ids = idsForPage(graph, id);
  const answered = new Set(ids.filter(([, i]) => i.status === 'implemented').map(([, i]) => i.category));
  // The page's own dossier ignores the scope bar's page pick: the URL already names the page.
  const pageScope: ClubhouseScope = { ...scope, page: id };
  const controls = controlRows(graph, pageScope);
  const actions = actionRows(graph, { ...pageScope, role: 'all' });
  const findings = findingRows(graph, pageScope).filter((f) => f.status === 'open');

  const viewOptions = PAGE_VIEWS.map((v) => ({
    value: v,
    label: VIEW_LABEL[v],
    href: hrefWithView(pagePath, v, PAGE_VIEWS, { ...sp, cat: undefined, show: undefined }),
    count: v === 'controls' ? controls.length : v === 'actions' ? actions.length : v === 'states' ? ids.length : undefined,
  }));

  const report = [
    `# ${id} ${page.name} (contract ${graph.contentHash})`,
    '',
    `Routes: ${page.routes.join(', ') || 'none recorded'}`,
    `Roles: ${page.roles.join(', ') || 'none recorded'}`,
    `IDs: ${row.ids.implemented} implemented, ${row.ids.reserved} reserved, ${row.ids.deprecated} deprecated`,
    `Categories answered: ${answered.size}/25`,
    `Actions: ${actions.length}; controls numbered: ${controls.length}`,
    `Gates: ${GATE_ORDER.map((g) => `${g} ${gateWords(page.gates[g])}`).join(', ')}`,
    `Open findings: ${findings.map((f) => `${f.id} ${f.severity}`).join(', ') || 'none'}`,
    '',
    'Live failures: no signal yet.',
  ].join('\n');

  return (
    <ClubhouseFrame
      title={
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
          <span className="font-fw-mono">{id}</span>
          <span>{page.name}</span>
        </span>
      }
      question="How is this page doing, against everything its contract says it can do?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.pages.noSignal}
      copyCode={BR.pages.copy}
      report={report}
      sources={[GRAPH_SOURCE, page.docs.CONTRACT, page.catalog].filter((s): s is string => Boolean(s))}
      actions={
        <>
          <ForceState page={id} code={BR.pages.forceState} />
          <PackLink code={BR.pages.pack} target={id} />
        </>
      }
    >
      <div data-br={BR.pages.viewRail} className="min-w-0">
        <SegmentedLinks options={viewOptions} value={view} ariaLabel={`${id} views`} size="sm" />
      </div>

      {view === 'overview' ? <OverviewView graph={graph} id={id} scope={scope} findings={findings} /> : null}
      {view === 'states' ? (
        <StatesView graph={graph} id={id} sp={sp} scope={scope} pagePath={pagePath} answered={answered} />
      ) : null}
      {view === 'controls' ? (
        controls.length === 0 ? (
          <div data-br={BR.pages.empty}>
            <EmptyState
              variant="subtle"
              title="No controls numbered yet"
              description={`${id}'s controls get CTL- numbers when the control ledger lands; until then they are listed by source line in CLUBHOUSE_CLICKABLE_MAP.md.`}
            />
          </div>
        ) : (
          <ControlList rows={controls} scope={scope} noSignalCode={BR.pages.noSignal} />
        )
      ) : null}
      {view === 'actions' ? (
        actions.length === 0 ? (
          <div data-br={BR.pages.empty}>
            <EmptyState variant="subtle" title="No actions on this page" description="The action map lists none for it." />
          </div>
        ) : (
          <>
            <NoSignal code={BR.pages.noSignal} what="Each action's funnel (tries, success, failure, offline)" />
            <ActionList rows={actions} graph={graph} scope={scope} noSignalCode={BR.pages.noSignal} />
          </>
        )
      ) : null}
      {view === 'contract' ? <ContractView graph={graph} id={id} /> : null}
      {view === 'phone' ? <PhoneView graph={graph} id={id} scope={scope} /> : null}
      {view === 'history' ? (
        <>
          <NoSignal code={BR.pages.noSignal} what="Failures per release, marked where a release touched this page," />
          {page.docs.CHANGELOG ? (
            <DocLink path={page.docs.CHANGELOG} label="Change log (newest first)" />
          ) : null}
        </>
      ) : null}
    </ClubhouseFrame>
  );
}

function DocLink({ path, label }: { path: string; label: string }) {
  return (
    <a
      href={githubBlobUrl(path, liveRef())}
      target="_blank"
      rel="noreferrer"
      data-br={BR.pages.docLink}
      className="inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded text-body-sm font-medium text-accent-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
    >
      <span className="truncate">{label}</span>
      <ExternalLink size={12} aria-hidden className="shrink-0" />
      <span className="sr-only">(opens on GitHub)</span>
    </a>
  );
}

function OverviewView({
  graph,
  id,
  scope,
  findings,
}: {
  graph: BridgeGraph;
  id: PageId;
  scope: ClubhouseScope;
  findings: ReturnType<typeof findingRows>;
}) {
  const page = graph.pages[id]!;
  const checks = graph.numberChecks[id] ?? [];
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Section title="Addresses and who they are for" description={`Roles: ${page.roles.join(', ') || 'none recorded'}`}>
        {page.screens.length === 0 ? (
          <p className="text-body-sm text-text-secondary">No addresses recorded for this page.</p>
        ) : (
          <ul className="space-y-2">
            {page.screens.map((s) => (
              <li key={`${s.route}${s.view ?? ''}`} className="min-w-0">
                <p className="break-words font-fw-mono text-caption text-text-primary [overflow-wrap:anywhere]">
                  {s.route}
                  {s.view ? <span className="text-text-tertiary">?view={s.view}</span> : null}
                </p>
                <p className="text-caption text-text-secondary">
                  {s.name ? `${s.name} · ` : ''}
                  {AUDIENCE_LABEL[s.audience]}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Live">
        <NoSignal code={BR.pages.noSignal} what="The failure rate by role and platform, the top codes and this page's incidents" />
      </Section>
      <Section
        title="Open audit findings"
        description={findings.length === 0 ? 'None open.' : undefined}
        actions={
          <Link
            href={withScope(clubhouseHref.readiness(), { ...scope, page: id }, { view: 'findings' })}
            className="text-caption font-medium text-accent-ink hover:underline"
          >
            All findings
          </Link>
        }
      >
        {findings.length > 0 ? (
          <ul className="space-y-1.5">
            {findings.map((f) => (
              <li key={f.id} className="text-body-sm text-text-primary">
                <span className="mr-1.5 font-fw-mono text-caption font-semibold">{f.id} {f.severity}</span>
                {f.title}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
      <Section title="Number checks" description="Figures this page shows, checked against the database by the audit.">
        {checks.length === 0 ? (
          <p className="text-body-sm text-text-secondary">No figure on this page has been checked yet.</p>
        ) : (
          <Link
            href={withScope(clubhouseHref.readiness(), { ...scope, page: id }, { view: 'numbers' })}
            className="text-body-sm font-medium text-accent-ink hover:underline"
          >
            {checks.length} figure{checks.length === 1 ? '' : 's'} checked
          </Link>
        )}
      </Section>
    </div>
  );
}

function StatesView({
  graph,
  id,
  sp,
  scope,
  pagePath,
  answered,
}: {
  graph: BridgeGraph;
  id: PageId;
  sp: SearchParams;
  scope: ClubhouseScope;
  pagePath: string;
  answered: ReadonlySet<number>;
}) {
  const show = parseMatrixShow(sp.show);
  const category = parseCategory(sp.cat);
  const rows = stateMatrix(graph, id, { show, category });
  return (
    <div className="min-w-0 space-y-3">
      <LinkChips
        label="Show"
        code={BR.pages.show}
        options={[
          ...MATRIX_SHOWS.map((key) => ({
            key,
            label: SHOW_LABEL[key],
            href: withScope(pagePath, scope, { view: 'states', show: key === 'all' ? null : key, cat: category }),
            active: show === key,
          })),
          { key: 'fired', label: 'Fired', pending: 'Shows what fired once signals arrive' },
          { key: 'never', label: 'Never seen', pending: 'Shows what never fired once signals arrive' },
        ]}
      />
      {category ? (
        <p className="text-body-sm text-text-secondary">
          Showing <span className="font-fw-mono">{categoryCode(category)}</span> {categoryName(category)} alone.{' '}
          <Link href={withScope(pagePath, scope, { view: 'states', show: show === 'all' ? null : show })} className="font-medium text-accent-ink hover:underline">
            Show every category
          </Link>
        </p>
      ) : null}
      <CategoryLegend answered={answered} />
      {rows.length === 0 ? (
        <div data-br={BR.pages.empty}>
          <EmptyState variant="search" title="No IDs match" description="Nothing in this page's contract matches that filter." />
        </div>
      ) : (
        <StateMatrix rows={rows} pagePath={pagePath} scope={scope} view="states" activeCategory={category} />
      )}
    </div>
  );
}

function ContractView({ graph, id }: { graph: BridgeGraph; id: PageId }) {
  const page = graph.pages[id]!;
  const docs = Object.entries(page.docs).filter((e): e is [string, string] => Boolean(e[1]));
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Section title="Documents" description="Opened on GitHub at the live release when it is known, else main.">
        <ul className="space-y-0.5">
          {docs.map(([name, path]) => (
            <li key={name}>
              <DocLink path={path} label={name} />
            </li>
          ))}
          {page.catalog ? (
            <li>
              <DocLink path={page.catalog} label="Catalog (the exact words and the tests)" />
            </li>
          ) : null}
        </ul>
      </Section>
      <Section title="Manifest gates">
        <ul className="space-y-1.5">
          {GATE_ORDER.map((gate) => (
            <li key={gate} className="flex items-center justify-between gap-3 text-body-sm">
              <span className="capitalize text-text-secondary">{gate}</span>
              <GateMark gate={gate} value={page.gates[gate]} />
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Held plans" description={page.held.length === 0 ? 'None.' : undefined} className="lg:col-span-2">
        {page.held.length > 0 ? (
          <ul className="space-y-1.5">
            {page.held.map((h) => (
              <li key={h.plan} className="flex min-w-0 flex-wrap items-center gap-2">
                <DocLink path={h.plan} label={h.plan.split('/').pop() ?? h.plan} />
                <span className="text-caption text-text-tertiary">{h.status ?? 'status not recorded'}</span>
                {h.migration ? (
                  <span className="break-words font-fw-mono text-caption text-text-tertiary [overflow-wrap:anywhere]">{h.migration}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
      {page.borrows.length > 0 ? (
        <Section title="Borrowed IDs" description="Other pages' IDs this contract names: they may fire here without being a wrong page." className="lg:col-span-2">
          <p className="font-fw-mono text-caption tabular-nums text-text-secondary">{page.borrows.length} IDs</p>
        </Section>
      ) : null}
    </div>
  );
}

function PhoneView({ graph, id, scope }: { graph: BridgeGraph; id: PageId; scope: ClubhouseScope }) {
  const phoneIds = idsForPage(graph, id).filter(([, i]) => PHONE_CATEGORIES.has(i.category));
  return (
    <div className="min-w-0 space-y-4">
      <Section title="Phone-only states" description="Category 17 Haptic and 19 Responsive layout.">
        {phoneIds.length === 0 ? (
          <p className="text-body-sm text-text-secondary">This page's contract names no haptic or responsive-layout states.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {phoneIds.map(([key, i]) => (
              <li key={key} className="flex min-w-0 flex-wrap items-center gap-2 py-1.5">
                <IdChip id={key} ch={i.ch} category={i.category} status={i.status} href={withScope(clubhouseHref.code(key), scope)} br={BR.pages.matrixCell} />
                <span className="min-w-0 flex-1 text-body-sm text-text-primary">{i.meaning}</span>
                <StatusTag status={i.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <NoSignal code={BR.pages.noSignal} what="The iOS app and iPhone Safari, side by side," />
    </div>
  );
}
