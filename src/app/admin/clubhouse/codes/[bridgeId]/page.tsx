import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { InlineNotice } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import type { BridgeGraph, GraphId, PageId } from '@/lib/admin/clubhouse/graph';
import {
  actionOutcomes,
  actionsEndingIn,
  categoryName,
  clubhouseHref,
  codeFiles,
  controlsStarting,
  githubBlobUrl,
  liveRef,
  withScope,
  type ClubhouseScope,
  type SearchParams,
} from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, NoSignal, PackLink, PendingControl, Section } from '../../_components/frame';
import { ActionChip, CategoryTag, ControlChip, IdChip, PageChip, StatusTag } from '../../_components/chips';
import { ForceState } from '../../_components/ForceState';
import { GRAPH_SOURCE, readClubhouse } from '../../_components/load';

export const metadata: Metadata = { title: 'Code' };

export const dynamic = 'force-dynamic';

function FileLink({ location }: { location: string }) {
  return (
    <a
      href={githubBlobUrl(location, liveRef())}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-8 max-w-full items-center gap-1 break-all font-fw-mono text-caption text-accent-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
    >
      {location}
      <ExternalLink size={12} aria-hidden className="shrink-0" />
      <span className="sr-only">(opens on GitHub)</span>
    </a>
  );
}

/**
 * B05, the code dossier (plan §8): everything the contract knows about one number. `/codes/CH-7004` redirects to its
 * Bridge ID; a retired ID says what replaced it. Live, Who, Why and Neighbours wait for signals (BR-0593).
 */
export default async function ClubhouseCodeDossier({
  params,
  searchParams,
}: {
  params: Promise<{ bridgeId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  await requireSuperAdmin();
  const { bridgeId } = await params;
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.codes.failed} title="Code" retryHref={clubhouseHref.code(bridgeId)} />;
  const { graph, scope, pages } = read;

  const value = decodeURIComponent(bridgeId).trim();
  if (/^ch-\d+$/i.test(value)) {
    const id = graph.chIndex[value.toUpperCase()];
    if (id === undefined) notFound();
    redirect(withScope(clubhouseHref.code(id), scope));
  }
  if (!/^\d+$/.test(value)) notFound();
  const entry = graph.ids[value];
  if (!entry) {
    const tomb = graph.tombstones[value];
    if (!tomb) notFound();
    return (
      <ClubhouseFrame
        title={<span className="font-fw-mono">{value}</span>}
        question="Everything about one number."
        graph={graph}
        scope={scope}
        pages={pages}
        noSignalCode={BR.codes.noSignal}
        copyCode={BR.codes.copy}
        report={`# ${value}\n\nRetired ${tomb.removedAt}.${tomb.replacement ? ` Replaced by ${tomb.replacement}.` : ''}`}
        sources={[GRAPH_SOURCE]}
        showScope={false}
      >
        <InlineNotice tone="info" title={`Retired on ${tomb.removedAt}`}>
          {tomb.replacement ? (
            <>
              This ID was removed from the contract. Its successor is{' '}
              <Link href={withScope(clubhouseHref.code(tomb.replacement), scope)} className="font-medium underline">
                {tomb.replacement}
              </Link>
              .
            </>
          ) : (
            'This ID was removed from the contract with no successor. A signal that still carries it is drift.'
          )}
        </InlineNotice>
      </ClubhouseFrame>
    );
  }
  return <Dossier graph={graph} id={Number(value)} entry={entry} scope={scope} pages={pages} />;
}

function Dossier({
  graph,
  id,
  entry,
  scope,
  pages,
}: {
  graph: BridgeGraph;
  id: number;
  entry: GraphId;
  scope: ClubhouseScope;
  pages: { id: string; name: string }[];
}) {
  const files = codeFiles(graph, entry);
  const actions = actionsEndingIn(graph, id);
  const controls = controlsStarting(graph, actions);
  const row = entry.catalogRow;
  // Neighbours from the contract: the other outcomes of the actions that end here (the success/failure balance).
  const siblings = actions.flatMap((a) =>
    actionOutcomes(graph, graph.actions[a]!)
      .filter((o) => o.id !== id)
      .map((o) => ({ ...o, action: a })),
  );

  const report = [
    `# ${id}${entry.ch ? ` · ${entry.ch}` : ''} · ${entry.page} ${graph.pages[entry.page]?.name ?? ''}`,
    '',
    `${String(entry.category).padStart(2, '0')} ${categoryName(entry.category)} · ${entry.status}`,
    `Name: ${entry.name}`,
    `Meaning: ${entry.meaning}`,
    row?.when ? `When: ${row.when}` : null,
    row?.theySee ? `They see: ${row.theySee}` : null,
    row?.how ? `How: ${row.how}` : null,
    row?.test ? `Test: ${row.test}` : null,
    `Where: ${[...files.exact, ...files.indexed].join(', ') || 'not located'}`,
    `Tests: ${(entry.tests ?? []).join(', ') || 'none listed'}`,
    `Actions that end here: ${actions.join(', ') || 'none'}`,
    '',
    'Live, who and why: no signal yet.',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return (
    <ClubhouseFrame
      title={
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
          <span className="font-fw-mono">{id}</span>
          {entry.ch ? <span className="font-fw-mono text-text-secondary">{entry.ch}</span> : null}
        </span>
      }
      question="Everything about one number."
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.codes.noSignal}
      copyCode={BR.codes.copy}
      report={report}
      sources={[GRAPH_SOURCE, graph.pages[entry.page]?.catalog ?? 'no catalog'].filter(Boolean)}
      actions={
        <>
          <ForceState page={entry.page as PageId} code={BR.codes.forceState} />
          <PendingControl code={BR.codes.markExpected} label="Mark expected…" arrives="Marking a firing as normal needs the Bridge notes table (bridge_notes), which arrives with the held migration 20261124090000." />
          <PendingControl code={BR.codes.watch} label="Watch" arrives="Watching pins a code to Pulse and the digest; the watch list needs the Bridge notes table (bridge_notes), which arrives with the held migration 20261124090000." />
          <PackLink code={BR.codes.pack} target={String(id)} />
        </>
      }
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <PageChip id={entry.page} name={graph.pages[entry.page]?.name} href={withScope(clubhouseHref.page(entry.page), scope)} br={BR.pages.row} />
        <CategoryTag category={entry.category} />
        <StatusTag status={entry.status} />
      </div>

      <Section title="The contract" description={entry.name}>
        <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-caption text-text-tertiary">Meaning</dt>
          <dd className="text-text-primary">{entry.meaning}</dd>
          {row?.when ? (
            <>
              <dt className="text-caption text-text-tertiary">When</dt>
              <dd className="text-text-primary">{row.when}</dd>
            </>
          ) : null}
          {row?.theySee ? (
            <>
              <dt className="text-caption text-text-tertiary">They see</dt>
              <dd className="font-medium text-text-primary">{row.theySee}</dd>
            </>
          ) : null}
          {row?.how ? (
            <>
              <dt className="text-caption text-text-tertiary">How</dt>
              <dd className="break-words text-text-primary">{row.how}</dd>
            </>
          ) : null}
          {row?.test ? (
            <>
              <dt className="text-caption text-text-tertiary">Test</dt>
              <dd className="break-words font-fw-mono text-caption text-text-primary">{row.test}</dd>
            </>
          ) : null}
        </dl>
      </Section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Section
          title="Where it lives"
          description={files.exact.length > 0 ? 'An exact location from the contract.' : files.indexed.length > 0 ? 'From the code index: the files that write this code.' : undefined}
        >
          {files.exact.length + files.indexed.length === 0 ? (
            <p className="text-body-sm text-text-secondary">Not located: no `where` in the contract and no file writes its code.</p>
          ) : (
            <ul className="space-y-0.5">
              {[...files.exact, ...files.indexed.filter((f) => !files.exact.includes(f))].map((f) => (
                <li key={f}>
                  <FileLink location={f} />
                </li>
              ))}
            </ul>
          )}
          {entry.tests && entry.tests.length > 0 ? (
            <>
              <p className="mt-3 text-caption font-medium text-text-tertiary">Tests</p>
              <ul className="space-y-0.5">
                {entry.tests.map((t) => (
                  <li key={t}>
                    <FileLink location={t} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Section>
        <Section title="What leads here" description="The actions that end in this ID, and the controls that start them.">
          {actions.length === 0 ? (
            <p className="text-body-sm text-text-secondary">No action in the map ends here: it is a state, not an outcome.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {actions.map((a) => (
                  <ActionChip key={a} id={a} label={graph.actions[a]?.label} href={withScope(clubhouseHref.action(a), scope)} br={BR.actions.row} />
                ))}
              </div>
              {controls.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {controls.map((c) => (
                    <ControlChip key={c} id={c} href={withScope(clubhouseHref.control(c), scope)} br={BR.controls.row} />
                  ))}
                </div>
              ) : (
                <p className="text-caption text-text-tertiary">No numbered control starts these yet.</p>
              )}
            </div>
          )}
        </Section>
      </div>

      <Section title="Live, who and why">
        <NoSignal
          code={BR.codes.noSignal}
          what="The count, people and teams, the split by role, platform, release and viewport, the latest 25 occurrences and their fingerprints,"
        />
      </Section>

      <Section title="Neighbours" description="The other outcomes of the same actions: the balance this one sits in.">
        {siblings.length === 0 ? (
          <p className="text-body-sm text-text-secondary">None from the action map. Codes that fire alongside it in a session need signals.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {siblings.map((o) => (
              <li key={`${o.action}-${o.outcome}-${o.id}`}>
                <IdChip
                  id={o.id}
                  ch={o.ch}
                  category={o.category}
                  status={o.status}
                  href={withScope(clubhouseHref.code(o.id), scope)}
                  br={BR.codes.row}
                  title={`${o.outcome} of ${o.action}: ${o.meaning ?? 'not in the contract'}`}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </ClubhouseFrame>
  );
}
