import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  actionOutcomes,
  clubhouseHref,
  controlLabel,
  githubBlobUrl,
  liveRef,
  withScope,
  type SearchParams,
} from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, NoSignal, PendingControl, Section } from '../../_components/frame';
import { ActionChip, IdChip, PageChip } from '../../_components/chips';
import { GRAPH_SOURCE, readClubhouse } from '../../_components/load';

export const metadata: Metadata = { title: 'Control' };

export const dynamic = 'force-dynamic';

/**
 * B03, the control dossier (plan §8): what it is, what it runs, and its board row. Live taps, the path people take to
 * it and the dead clicks around it wait for signals (BR-0393).
 */
export default async function ClubhouseControlDossier({
  params,
  searchParams,
}: {
  params: Promise<{ ctl: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  await requireSuperAdmin();
  const { ctl } = await params;
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) {
    return <GraphUnavailable code={BR.controls.failed} title="Control" retryHref={clubhouseHref.control(ctl)} />;
  }
  const { graph, scope, pages } = read;
  const id = decodeURIComponent(ctl).toUpperCase();
  const control = graph.controls[id];
  if (!control) notFound();
  const ref = liveRef();

  const report = [
    `# ${id} ${controlLabel(control)}`,
    '',
    `Page: ${control.page} ${graph.pages[control.page]?.name ?? ''}`,
    control.description ? `Does: ${control.description}` : null,
    control.file ? `Code: ${control.file}` : null,
    `Role: ${control.role ?? 'not recorded'}; viewport: ${control.viewport ?? 'not recorded'}`,
    `Board: ${control.verdict ?? 'not on the board'}${control.board ? ` (${control.board})` : ''}`,
    `Runs: ${control.actions.join(', ') || 'no action'}`,
    '',
    'Taps and frustration: no signal yet.',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return (
    <ClubhouseFrame
      title={
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
          <span className="font-fw-mono">{id}</span>
          <span>{controlLabel(control)}</span>
        </span>
      }
      question="What can a person press, what does it do, and does it work?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.controls.noSignal}
      copyCode={BR.controls.copy}
      report={report}
      sources={[GRAPH_SOURCE]}
      actions={<PendingControl code={BR.controls.pack} label="Context pack" arrives="Packs go to the Duet desk, which lands with PR 4." />}
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Section title="What it is">
          <dl className="space-y-2 text-body-sm">
            <div>
              <dt className="text-caption text-text-tertiary">Label</dt>
              <dd className="text-text-primary">{controlLabel(control)}</dd>
            </div>
            {control.description ? (
              <div>
                <dt className="text-caption text-text-tertiary">Does</dt>
                <dd className="text-text-primary">{control.description}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-caption text-text-tertiary">Page</dt>
              <dd>
                <PageChip id={control.page} name={graph.pages[control.page]?.name} href={withScope(clubhouseHref.page(control.page), scope)} br={BR.pages.row} />
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-tertiary">Who and where</dt>
              <dd className="text-text-primary">
                {[control.surface, control.role, control.viewport].filter(Boolean).join(' · ') || 'Not recorded'}
              </dd>
            </div>
            {control.file ? (
              <div>
                <dt className="text-caption text-text-tertiary">In the code</dt>
                <dd>
                  <a
                    href={githubBlobUrl(control.file, ref)}
                    target="_blank"
                    rel="noreferrer"
                    data-br={BR.controls.codeLink}
                    className="inline-flex min-h-8 max-w-full items-center gap-1 break-all font-fw-mono text-caption text-accent-ink hover:underline"
                  >
                    {control.file}
                    <ExternalLink size={12} aria-hidden className="shrink-0" />
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        </Section>
        <Section title="What it runs" description={control.actions.length === 0 ? 'No action: it navigates or changes the view.' : undefined}>
          <ul className="space-y-3">
            {control.actions.map((actionId) => {
              const action = graph.actions[actionId];
              return (
                <li key={actionId} className="min-w-0 space-y-1.5">
                  <ActionChip id={actionId} href={withScope(clubhouseHref.action(actionId), scope)} br={BR.controls.actionChip} label={action?.label} />
                  {action ? (
                    <div className="flex flex-wrap gap-1.5">
                      {actionOutcomes(graph, action).map((o) => (
                        <IdChip
                          key={`${o.outcome}-${o.id}`}
                          id={o.id}
                          ch={o.ch}
                          category={o.category}
                          status={o.status}
                          href={withScope(clubhouseHref.code(o.id), scope)}
                          br={BR.actions.funnelSegment}
                          title={`${o.outcome}: ${o.meaning ?? 'not in the contract'}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-caption font-medium text-fw-warning-text">Not in the action map: a drift row.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
        <Section title="Live" className="lg:col-span-2">
          <NoSignal code={BR.controls.noSignal} what="Taps per day by role, platform and viewport, the step people take before it, and the dead clicks around it" />
        </Section>
        <Section title="The board">
          {control.verdict || control.board ? (
            <p className="text-body-sm text-text-primary" data-br={BR.controls.boardNote}>
              {control.verdict ? <span className="font-semibold">{control.verdict}</span> : null}
              {control.board ? <span className="text-text-secondary"> · {control.board}</span> : null}
            </p>
          ) : (
            <p className="text-body-sm text-text-secondary">Not on the design board (CLICKABLES.md).</p>
          )}
        </Section>
      </div>
    </ClubhouseFrame>
  );
}
