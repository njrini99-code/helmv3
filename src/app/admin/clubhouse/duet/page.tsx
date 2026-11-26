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
import { packWatchCodes } from '@/lib/admin/clubhouse/pack';
import { readHourly, readNotes } from '@/lib/admin/clubhouse/live';
import { liveHref, type HourlyRow, type LiveRead } from '@/lib/admin/clubhouse/live-model';
import { PACK_STATUS_WORDS, oldestSent, packVerdict, queuedPack, type BridgeNoteRow, type NotesIndex, type PackVerdict } from '@/lib/admin/clubhouse/notes';
import { archivePack, markPackSent } from '@/app/admin/actions/bridge-notes';
import { clubhouseHref, liveRef, scopeEntries, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { CopyReportButton } from '../../_components/CopyReportButton';
import { ClubhouseFrame, GraphUnavailable, NoSignal, Section } from '../_components/frame';
import { LiveFailed } from '../_components/live';
import { LocalTime } from '../../_components/LocalTime';
import { DownloadPack } from '../_components/DownloadPack';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';
import { Input } from '@/components/ui/input';

export const metadata: Metadata = { title: 'Duet desk' };

export const dynamic = 'force-dynamic';

/** How far back the queue reads counters for a pack sent long ago: a month, like B10. */
const QUEUE_LOOKBACK_MS = 30 * 24 * 3_600_000;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * B13 Duet desk (plan §8, §9.1): what does Claude Duet need, in one paste? Type a page, control, action, code or finding (or
 * arrive from a dossier's "Context pack") and the desk builds the pack: the contract and the code from the graph, the
 * evidence from live sources that say "No signal yet" until their tables exist. Pseudonymous unless "Include names"
 * is ticked (D7). Copy and Download are client-side; the queue (Mark sent, Verify, Archive) is bridge_notes (notes.ts).
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

  // The queue (bridge_notes kind 'pack'): each sent pack, and where it stands after the next release.
  const notes = await readNotes();
  const since = oldestSent(notes.data.packs);
  const floor = Date.now() - QUEUE_LOOKBACK_MS;
  const hourly: LiveRead<HourlyRow[]> = since
    ? await readHourly({ sinceIso: new Date(Math.max(Date.parse(since), floor)).toISOString() })
    : { state: 'ok', data: [] };
  const queue: QueueEntry[] = notes.data.packs.map((note) => {
    const t = resolvePackTarget(graph, note.body);
    return { note, label: t?.key ?? note.body, verdict: t ? packVerdict({ sentAt: note.created_at, codes: packWatchCodes(graph, t), rows: hourly.data }) : null };
  });
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
      sources={[GRAPH_SOURCE, 'public.admin_events (Bridge columns)', 'public.bridge_notes (the queue)', 'clubhouse_signal_hourly (fixed or regressed after the next release)']}
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

      <Queue pack={pack} notes={notes} hourly={hourly} queue={queue} />

      {pack ? <Preview pack={pack} markdown={markdown} queued={notes.state === 'ok' ? queuedPack(notes.data, pack.target.key) : null} notesState={notes.state} verdict={queue.find((q) => q.note.body === pack.target.key)?.verdict ?? null} /> : null}
    </ClubhouseFrame>
  );
}

function BuildForm({ raw, includeNames, hidden }: { raw: string; includeNames: boolean; hidden: Array<[string, string]> }) {
  return (
    <form action={clubhouseHref.duet()} method="get" role="search" aria-label="Build a context pack" className="flex min-w-0 flex-wrap items-end gap-3">
      {hidden.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
        <label htmlFor="bridge-duet-target" className="text-caption font-medium text-text-secondary">
          What to pack: a page, control, action, code or finding, or a release, person or team
        </label>
        <Input
          id="bridge-duet-target"
          name="t"
          defaultValue={raw}
          required
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          placeholder="P007 · CTL-P007-014 · 70603 · CH-7004 · F-0001 · rel:<sha> · user:<id>"
          className="min-h-10 w-full rounded-fw-sm border border-border-control bg-surface px-3 font-fw-mono text-body-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
        />
      </div>
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

interface QueueEntry {
  note: BridgeNoteRow;
  /** The target key; a target no longer in the contract shows as stored. */
  label: string;
  /** Null when the target no longer resolves. */
  verdict: PackVerdict | null;
}

const STATUS_TONE: Record<PackVerdict['status'], string> = {
  sent: 'border-border-subtle bg-surface-sunken text-text-secondary',
  waiting: 'border-border-subtle bg-surface-sunken text-text-secondary',
  fixed: 'border-fw-success bg-fw-success-bg text-fw-success-ink',
  regressed: 'border-fw-danger/40 bg-fw-danger-bg text-fw-danger-ink',
};

function StatusChip({ verdict }: { verdict: PackVerdict | null }) {
  if (!verdict) return <span className="rounded-full border border-border-subtle px-2 py-0.5 text-caption text-text-tertiary">no longer in the contract</span>;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-caption ${STATUS_TONE[verdict.status]}`}>
      {PACK_STATUS_WORDS[verdict.status]}
      {verdict.release ? <span className="font-fw-mono"> · {verdict.release.slice(0, 7)}</span> : null}
      {verdict.status === 'regressed' ? <span className="font-fw-mono tabular-nums"> · {verdict.firing}</span> : null}
    </span>
  );
}

/** BR-1305: opens B10 at the release that decides the pack, which shows whether its codes stopped. */
function VerifyControl({ verdict }: { verdict: PackVerdict | null }) {
  if (verdict?.release) {
    return (
      <Link
        href={liveHref.release(verdict.release)}
        prefetch={false}
        data-br={BR.duet.verify}
        className="inline-flex min-h-9 items-center rounded-fw-sm border border-border-control bg-surface px-3 text-caption font-medium text-text-primary hover:border-border-strong hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
      >
        Verify after release
      </Link>
    );
  }
  const why = !verdict
    ? 'The target is no longer in the contract.'
    : verdict.status === 'sent'
      ? 'This pack has no failure codes of its own; its release comparison (B10) decides it.'
      : 'No release has shipped since it was sent; the first one decides it.';
  return (
    <Button type="button" variant="ghost" size="sm" disabled data-br={BR.duet.verify} title={why}>
      Verify after release
    </Button>
  );
}

/** BR-1306: takes the pack off the queue (the row stays in bridge_notes, archived). */
function ArchiveControl({ note, back }: { note: BridgeNoteRow; back?: string }) {
  return (
    <form action={archivePack}>
      <input type="hidden" name="note" value={note.id} />
      {back ? <input type="hidden" name="t" value={back} /> : null}
      <Button type="submit" variant="ghost" size="sm" data-br={BR.duet.archive}>
        Archive
      </Button>
    </form>
  );
}

/** The queue: the pack being built (new), then every sent pack with where it stands. */
function Queue({ pack, notes, hourly, queue }: { pack: ContextPack | null; notes: LiveRead<NotesIndex>; hourly: LiveRead<HourlyRow[]>; queue: QueueEntry[] }) {
  const fresh = pack && !queue.some((q) => q.note.body === pack.target.key) ? pack : null;
  return (
    <Section title="Queue" description="New, sent, waiting for a release, fixed, regressed. The first release after a pack is sent decides it.">
      <div className="space-y-3">
        {notes.state === 'error' ? <LiveFailed code={BR.duet.failed} label="The queue (bridge_notes)" error={notes.error} retryHref={clubhouseHref.duet()} /> : null}
        {fresh || queue.length ? (
          <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle">
            {fresh ? (
              <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <a href="#pack-preview" data-br={BR.duet.packRow} className="inline-flex min-h-8 min-w-0 items-center font-fw-mono text-body-sm font-medium text-accent-ink hover:underline">
                  {fresh.target.label}
                </a>
                <span className="rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 text-caption text-text-secondary">new · not sent</span>
                <span className="text-caption text-text-tertiary">{fresh.people === 'names' ? 'with names' : 'pseudonymous'}</span>
              </li>
            ) : null}
            {queue.map((q) => (
              <li key={q.note.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Link
                  href={clubhouseHref.duet(q.label)}
                  prefetch={false}
                  data-br={BR.duet.packRow}
                  className="inline-flex min-h-8 min-w-0 items-center break-all font-fw-mono text-body-sm font-medium text-accent-ink hover:underline"
                >
                  {q.label}
                </Link>
                <StatusChip verdict={q.verdict} />
                <span className="text-caption text-text-tertiary">
                  sent <LocalTime iso={q.note.created_at} variant="datetime" fallback="—" />
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <VerifyControl verdict={q.verdict} />
                  <ArchiveControl note={q.note} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div data-br={BR.duet.empty}>
            <EmptyState
              variant="subtle"
              title="No pack yet"
              description="Build one above, or press Context pack on a dossier, a release, a person, a team or a readiness finding. Mark it sent to keep it on the queue."
            />
          </div>
        )}
        {queue.length && hourly.state === 'no-signal' ? (
          <NoSignal code={BR.duet.noSignal} what="Whether the next release fixed each pack (the signal counters)" />
        ) : null}
        {queue.length && hourly.state === 'error' ? (
          <LiveFailed code={BR.duet.failed} label="The counters that decide fixed or regressed" error={hourly.error} retryHref={clubhouseHref.duet()} />
        ) : null}
      </div>
    </Section>
  );
}

function Preview({
  pack,
  markdown,
  queued,
  notesState,
  verdict,
}: {
  pack: ContextPack;
  markdown: string;
  queued: BridgeNoteRow | null;
  notesState: LiveRead<NotesIndex>['state'];
  verdict: PackVerdict | null;
}) {
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
            {pack.target.page
              ? `${pack.reproduce.routes[0] ?? 'no route'} · ${pack.reproduce.roles.join(', ') || 'signed out'}`
              : 'Not one page: the sessions in the evidence'}
            {pack.reproduce.steps.length ? ` · ${pack.reproduce.steps.length} steps` : ''}
          </Part>
          <Part n="7" title="Done means">
            {pack.done.codes.length ? `${pack.done.codes.length} codes stop firing; ` : ''}
            {pack.done.checks.map((c) => `${c}; `).join('')}
            {pack.done.gates.join(', ')} green
          </Part>
          <Part n="·" title="People">
            {pack.people === 'names' ? 'Names included (you ticked it)' : 'Pseudonymous ids only (D7)'}
          </Part>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          {queued ? (
            <>
              <span className="text-caption text-text-secondary">
                Sent <LocalTime iso={queued.created_at} variant="datetime" fallback="—" />
              </span>
              <StatusChip verdict={verdict} />
              <VerifyControl verdict={verdict} />
              <ArchiveControl note={queued} back={pack.target.key} />
            </>
          ) : (
            <MarkSentControl pack={pack} notesState={notesState} />
          )}
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

/**
 * BR-1304: puts the pack on the queue as sent. The row keeps the target key only. A person's or a team's pack is not
 * kept: bridge_notes is kept forever, and a pack names its subject by id (D7).
 */
function MarkSentControl({ pack, notesState }: { pack: ContextPack; notesState: LiveRead<NotesIndex>['state'] }) {
  const personal = pack.target.kind === 'person' || pack.target.kind === 'team';
  if (personal || notesState !== 'ok') {
    const why = personal
      ? "A person's or a team's pack is not kept on the queue: the queue is kept forever and would hold their id (D7). Copy or download it instead."
      : 'The queue (bridge_notes) could not be read, so a pack cannot be marked sent right now.';
    return (
      <Button type="button" variant="secondary" size="sm" disabled data-br={BR.duet.markSent} title={why}>
        Mark sent
      </Button>
    );
  }
  return (
    <form action={markPackSent}>
      <input type="hidden" name="t" value={pack.target.key} />
      <Button type="submit" variant="secondary" size="sm" data-br={BR.duet.markSent}>
        Mark sent
      </Button>
    </form>
  );
}
