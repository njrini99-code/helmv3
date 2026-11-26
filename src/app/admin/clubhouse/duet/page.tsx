import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PackageOpen } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { createClient } from '@/lib/supabase/server';
import { Button, EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  buildPack,
  packFileName,
  renderPackMarkdown,
  resolvePackTarget,
  type ContextPack,
  type PackLiveSection,
} from '@/lib/admin/clubhouse/pack';
import { bridgePackSources, packPseudonym } from '@/lib/admin/clubhouse/pack-server';
import { clubhouseHref, liveRef, scopeEntries, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { CopyReportButton } from '../../_components/CopyReportButton';
import { ClubhouseFrame, GraphUnavailable, NoSignal, PendingControl, Section } from '../_components/frame';
import { DownloadPack } from '../_components/DownloadPack';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';

export const metadata: Metadata = { title: 'Duet desk' };

export const dynamic = 'force-dynamic';

const QUEUE_PENDING = 'The queue keeps packs in bridge_notes, which arrives with held migration 20261124090000.';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * B13 Duet desk (plan §8, §9.1): what does Claude Duet need, in one paste? Type a page, control, action, code or finding (or
 * arrive from a dossier's "Context pack") and the desk builds the pack: the contract and the code from the graph, the
 * evidence from live sources that say "No signal yet" until their tables exist. Pseudonymous unless "Include names"
 * is ticked (D7). Copy and Download are client-side; the queue (sent, verified, archived) waits on bridge_notes.
 */
export default async function DuetDeskPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.duet.failed} title="Duet desk" retryHref={clubhouseHref.duet()} />;
  const { graph, scope, pages } = read;

  const raw = (first(sp.t) ?? '').trim().slice(0, 80);
  const includeNames = first(sp.names) === '1';
  const target = raw ? resolvePackTarget(graph, raw) : null;

  let pack: ContextPack | null = null;
  if (target) {
    const supabase = (await createClient()) as unknown as SupabaseClient;
    pack = await buildPack(graph, target, {
      includeNames,
      release: liveRef(),
      pseudonymize: packPseudonym,
      sources: bridgePackSources(supabase),
    });
  }
  const markdown = pack ? renderPackMarkdown(pack) : '';
  const report = pack
    ? markdown
    : `# Duet desk (contract ${graph.contentHash})\n\nNo pack built. Type a page, control, action, code or finding to build one.`;

  return (
    <ClubhouseFrame
      title="Duet desk"
      question="What does Claude Duet need, in one paste?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.duet.noSignal}
      copyCode={BR.duet.copy}
      report={report}
      showScope={false}
      sources={[GRAPH_SOURCE, 'public.admin_events (Bridge columns, held migration 20261124090000)', 'public.bridge_notes (held)']}
    >
      <BuildForm raw={raw} includeNames={includeNames} hidden={scopeEntries(scope)} />

      {raw && !target ? (
        <div data-br={BR.duet.empty}>
          <EmptyState
            variant="search"
            title="Nothing to pack"
            description={`"${raw}" is not a page, control, action, code or finding in contract ${graph.contentHash}, nor a rel:, user: or team: id. Try P007, CTL-P007-014, ACT-P007-SEND-MESSAGE, 70603, CH-7004 or F-0001.`}
          />
        </div>
      ) : null}

      <Queue pack={pack} />

      {pack ? <Preview pack={pack} markdown={markdown} /> : null}
    </ClubhouseFrame>
  );
}

function BuildForm({ raw, includeNames, hidden }: { raw: string; includeNames: boolean; hidden: Array<[string, string]> }) {
  return (
    <form action={clubhouseHref.duet()} method="get" role="search" aria-label="Build a context pack" className="flex min-w-0 flex-wrap items-end gap-3">
      {hidden.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
        <span className="text-caption font-medium text-text-secondary">What to pack: a page, control, action, code or finding, or a release, person or team</span>
        <input
          name="t"
          defaultValue={raw}
          required
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          placeholder="P007 · CTL-P007-014 · 70603 · CH-7004 · F-0001 · rel:<sha> · user:<id>"
          className="min-h-10 w-full rounded-fw-sm border border-border-control bg-surface px-3 font-fw-mono text-body-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
        />
      </label>
      <label data-br={BR.duet.names} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-body-sm text-text-secondary">
        <input type="checkbox" name="names" value="1" defaultChecked={includeNames} className="size-4 accent-accent-600" />
        Include names
      </label>
      <Button type="submit" variant="primary" size="md" data-br={BR.duet.build} leftIcon={<PackageOpen size={16} aria-hidden />}>
        Build pack
      </Button>
    </form>
  );
}

/** The queue (new, sent, waiting for a release, fixed, regressed). This pack shows as an unsaved row until it can be kept. */
function Queue({ pack }: { pack: ContextPack | null }) {
  return (
    <Section title="Queue" description="New, sent, waiting for a release, confirmed fixed, regressed.">
      <div className="space-y-3">
        {pack ? (
          <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle">
            <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <a href="#pack-preview" data-br={BR.duet.packRow} className="inline-flex min-h-8 min-w-0 items-center font-fw-mono text-body-sm font-medium text-accent-ink hover:underline">
                {pack.target.label}
              </a>
              <span className="rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 text-caption text-text-secondary">new · not saved</span>
              <span className="text-caption text-text-tertiary">{pack.people === 'names' ? 'with names' : 'pseudonymous'}</span>
            </li>
          </ul>
        ) : (
          <div data-br={BR.duet.empty}>
            <EmptyState
              variant="subtle"
              title="No pack yet"
              description="Build one above, or press Context pack on a dossier, a release, a person, a team or a readiness finding."
            />
          </div>
        )}
        <NoSignal code={BR.duet.noSignal} what="Saved packs, their status, and whether the next release fixed them" />
      </div>
    </Section>
  );
}

function Preview({ pack, markdown }: { pack: ContextPack; markdown: string }) {
  const c = pack.contractRows;
  return (
    <Section
      id="pack-preview"
      title={<span className="break-words">{pack.target.label}</span>}
      description={pack.ask.question}
      actions={
        <>
          <span data-br={BR.duet.copy}>
            <CopyReportButton report={markdown} label="Copy pack" size="sm" />
          </span>
          <DownloadPack markdown={markdown} fileName={packFileName(pack)} code={BR.duet.download} />
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid gap-x-6 gap-y-3 text-body-sm sm:grid-cols-2">
          <Part n="1" title="The ask">
            {pack.ask.about}. <Link href={pack.target.href} className="text-accent-ink hover:underline">Open the dossier</Link>
          </Part>
          <Part n="2" title="The contract">
            <span className="font-fw-mono tabular-nums">{c.ids.length}</span> IDs, <span className="font-fw-mono tabular-nums">{c.actions.length}</span> actions,{' '}
            <span className="font-fw-mono tabular-nums">{c.controls.length}</span> controls
            {c.truncated ? <span className="text-text-tertiary"> ({c.truncated} more IDs on the dossier)</span> : null}
          </Part>
          <Part n="3" title="The evidence">
            <EvidenceStates sections={pack.evidence} />
          </Part>
          <Part n="4" title="The code">
            <span className="font-fw-mono tabular-nums">{pack.code.files.length}</span> files, <span className="font-fw-mono tabular-nums">{pack.code.tests.length}</span> tests
            {pack.code.tables.length ? <span className="text-text-secondary"> · {pack.code.tables.join(', ')}</span> : null}
          </Part>
          <Part n="5" title="What to read">
            <span className="font-fw-mono tabular-nums">{pack.read.length}</span> documents
          </Part>
          <Part n="6" title="How to reproduce">
            {pack.reproduce.routes[0] ?? 'no route'} · {pack.reproduce.roles.join(', ') || 'signed out'}
          </Part>
          <Part n="7" title="Done means">
            {pack.done.codes.length ? `${pack.done.codes.length} codes stop firing; ` : ''}
            {pack.done.gates.join(', ')} green
          </Part>
          <Part n="·" title="People">
            {pack.people === 'names' ? 'Names included (you ticked it)' : 'Pseudonymous ids only (D7)'}
          </Part>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <PendingControl code={BR.duet.markSent} label="Mark sent" arrives={QUEUE_PENDING} />
          <PendingControl code={BR.duet.verify} label="Verify after release" arrives={QUEUE_PENDING} />
          <PendingControl code={BR.duet.archive} label="Archive" arrives={QUEUE_PENDING} />
        </div>

        <details className="rounded-fw-md border border-border-subtle">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-body-sm font-medium text-text-primary hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
            The paste (Markdown with one JSON block)
          </summary>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words border-t border-border-subtle bg-surface-sunken px-3 py-2 font-fw-mono text-caption text-text-primary">
            {markdown}
          </pre>
        </details>
      </div>
    </Section>
  );
}

function Part({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-baseline gap-1.5 text-caption font-medium text-text-tertiary">
        <span className="font-fw-mono">{n}</span>
        {title}
      </dt>
      <dd className="mt-0.5 min-w-0 break-words text-text-primary">{children}</dd>
    </div>
  );
}

function EvidenceStates({ sections }: { sections: PackLiveSection[] }) {
  return (
    <ul className="space-y-0.5">
      {sections.map((s) => (
        <li key={s.source} className="flex min-w-0 items-baseline gap-1.5" title={s.note}>
          <span
            aria-hidden
            className={`inline-block size-2 shrink-0 translate-y-[-1px] rounded-full ${
              s.state === 'ok' ? 'bg-fw-success' : s.state === 'failed' ? 'bg-fw-danger' : 'border border-dashed border-text-tertiary'
            }`}
          />
          <span className="min-w-0">
            {s.title}
            <span className="text-text-tertiary"> · {s.state === 'ok' ? `${s.rows?.length ?? 0} rows` : s.state === 'failed' ? 'failed to read' : 'no signal yet'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
