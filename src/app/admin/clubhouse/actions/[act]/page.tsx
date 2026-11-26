import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  actionOutcomes,
  categoryName,
  clubhouseHref,
  controlsStarting,
  githubBlobUrl,
  liveRef,
  markdownTable,
  withScope,
  type SearchParams,
} from '@/lib/admin/clubhouse/screens';
import { liveHref } from '@/lib/admin/clubhouse/live-model';
import { ClubhouseFrame, GraphUnavailable, NoSignal, PackLink, PendingControl, Section } from '../../_components/frame';
import { ControlChip, IdChip, PageChip, StatusTag } from '../../_components/chips';
import { GRAPH_SOURCE, readClubhouse } from '../../_components/load';

export const metadata: Metadata = { title: 'Action' };

export const dynamic = 'force-dynamic';

function CodeLink({ location, code }: { location: string; code: string }) {
  return (
    <a
      href={githubBlobUrl(location, liveRef())}
      target="_blank"
      rel="noreferrer"
      data-br={code}
      className="inline-flex min-h-8 max-w-full items-center gap-1 break-all font-fw-mono text-caption text-accent-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
    >
      {location}
      <ExternalLink size={12} aria-hidden className="shrink-0" />
      <span className="sr-only">(opens on GitHub)</span>
    </a>
  );
}

/**
 * B04, the action dossier (plan §8): its outcomes from the action map, each one click to its code, and its wiring
 * (component, handler, server action, tables, tests). A listed outcome that points at a deprecated or unknown ID is
 * named as drift. The funnel, the failure reasons and timing wait for signals (BR-0493).
 */
export default async function ClubhouseActionDossier({
  params,
  searchParams,
}: {
  params: Promise<{ act: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  await requireSuperAdmin();
  const { act } = await params;
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.actions.failed} title="Action" retryHref={clubhouseHref.action(act)} />;
  const { graph, scope, pages } = read;
  const id = decodeURIComponent(act).toUpperCase();
  const action = graph.actions[id];
  if (!action) notFound();

  const outcomes = actionOutcomes(graph, action);
  const controls = controlsStarting(graph, [id]);
  const wiring = [
    { label: 'Component', value: action.component },
    { label: 'Handler', value: action.handler },
    { label: 'Server action', value: action.service },
  ];

  const report = [
    `# ${id} · ${action.label} · ${action.page}`,
    '',
    markdownTable(
      ['Outcome', 'Bridge ID', 'CH code', 'Meaning', 'Status'],
      outcomes.map((o) => [o.outcome, o.id, o.ch ?? '', o.meaning ?? (o.missing ? 'NOT IN THE CONTRACT' : ''), o.status ?? 'unknown']),
    ),
    '',
    `Wiring: ${wiring.map((w) => `${w.label.toLowerCase()} ${w.value ?? 'none'}`).join('; ')}`,
    `Tables: ${action.tables.join(', ') || 'none'}`,
    `Tests: ${action.tests.join(', ') || 'none'}`,
    '',
    'Funnel and timing: no signal yet.',
  ].join('\n');

  return (
    <ClubhouseFrame
      title={action.label}
      question="When someone presses it, does the thing actually happen?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.actions.noSignal}
      copyCode={BR.actions.copy}
      report={report}
      sources={[GRAPH_SOURCE]}
      actions={
        <>
          <Link
            href={withScope(liveHref.sessions(), scope, { act: id })}
            data-br={BR.actions.sessions}
            prefetch={false}
            className="inline-flex min-h-9 items-center rounded-fw-sm border border-border-control px-3 text-caption font-medium text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
          >
            Sessions
          </Link>
          <PackLink code={BR.actions.pack} target={id} />
        </>
      }
    >
      <p className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="break-all font-fw-mono text-caption text-text-secondary">{id}</span>
        <PageChip id={action.page} name={graph.pages[action.page]?.name} href={withScope(clubhouseHref.page(action.page), scope)} br={BR.pages.row} />
      </p>

      <Section title="The funnel">
        <NoSignal code={BR.actions.noSignal} what="Tapped, in flight, succeeded, failed, offline and busy, with retries rescued," />
      </Section>

      <Section title="Outcomes" description="Each outcome the action map lists, and the Bridge ID it lands on.">
        <ul className="divide-y divide-border-subtle">
          {outcomes.map((o) => (
            <li key={`${o.outcome}-${o.id}`} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="w-24 shrink-0 text-caption font-medium uppercase tracking-wide text-text-tertiary">{o.outcome}</span>
              <IdChip
                id={o.id}
                ch={o.ch}
                category={o.category}
                status={o.status}
                href={withScope(clubhouseHref.code(o.id), scope)}
                br={BR.actions.funnelSegment}
              />
              <span className="min-w-0 flex-1 basis-48 text-body-sm text-text-primary">
                {o.meaning ?? (o.tombstone ? `Retired ${o.tombstone.removedAt}` : 'Not in the contract')}
                {o.category ? <span className="ml-1.5 text-caption text-text-tertiary">{categoryName(o.category)}</span> : null}
              </span>
              {o.status ? <StatusTag status={o.status} /> : null}
              {o.missing || o.status === 'deprecated' ? (
                <span className="rounded-full border border-fw-warning-ring bg-fw-warning-bg px-2 py-0.5 text-caption font-medium text-fw-warning-ink">
                  drift: {o.missing ? 'unknown ID' : 'deprecated outcome'}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Section title="Wiring" description="Opened on GitHub at the live release when it is known, else main.">
          <dl className="space-y-2">
            {wiring.map((w) => (
              <div key={w.label}>
                <dt className="text-caption text-text-tertiary">{w.label}</dt>
                <dd className="min-w-0">
                  {w.value && w.value.startsWith('src/') ? (
                    <CodeLink location={w.value} code={BR.actions.wiringLink} />
                  ) : (
                    <span className="break-all font-fw-mono text-caption text-text-primary">{w.value ?? 'none'}</span>
                  )}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-caption text-text-tertiary">Tables</dt>
              <dd className="break-words font-fw-mono text-caption text-text-primary">{action.tables.join(', ') || 'none'}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-tertiary">Tests</dt>
              <dd className="space-y-0.5">
                {action.tests.length === 0 ? (
                  <span className="text-caption text-text-secondary">none listed</span>
                ) : (
                  action.tests.map((t) => <CodeLink key={t} location={t} code={BR.actions.wiringLink} />)
                )}
              </dd>
            </div>
          </dl>
        </Section>
        <Section title="Why it failed">
          <NoSignal code={BR.actions.noSignal} what="Failures grouped by server code and by the server half" />
          <div className="mt-2">
            <PendingControl code={BR.actions.failureReason} label="Open in Incidents" arrives="Each failure reason opens Incidents filtered to it once failures are counted." />
          </div>
        </Section>
        <Section title="Controls that run it" className="lg:col-span-2">
          {controls.length === 0 ? (
            <p className="text-body-sm text-text-secondary">No numbered control runs it yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {controls.map((c) => (
                <ControlChip key={c} id={c} href={withScope(clubhouseHref.control(c), scope)} br={BR.controls.row} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </ClubhouseFrame>
  );
}
