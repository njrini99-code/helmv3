import Link from 'next/link';
import { ExternalLink, GitPullRequest } from 'lucide-react';
import type { WorkLogEntry } from '@/lib/admin/github-pr-timeline';
import type { WorkArea } from '@/lib/admin/pr-body-parser';
import { StatusPill, Surface, StatTile, type FwStatusTone } from '@/components/fairway';

const AREA_META: Record<WorkArea, { label: string; tone: FwStatusTone }> = {
  golf: { label: 'GolfHelm', tone: 'success' },
  baseball: { label: 'BaseballHelm', tone: 'info' },
  coachhelm: { label: 'CoachHelm', tone: 'accent' },
  bridge: { label: 'Helm Bridge', tone: 'neutral' },
  platform: { label: 'Platform', tone: 'neutral' },
  mobile: { label: 'Mobile', tone: 'info' },
  shared: { label: 'Shared', tone: 'warning' },
  unknown: { label: 'Cross-cutting', tone: 'neutral' },
};

const STATE_META: Record<WorkLogEntry['state'], { label: string; tone: FwStatusTone }> = {
  merged: { label: 'Merged', tone: 'success' },
  open: { label: 'Open', tone: 'info' },
  closed: { label: 'Closed', tone: 'neutral' },
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timelineDate(entry: WorkLogEntry): string {
  return entry.merged_at ?? entry.closed_at ?? entry.created_at;
}

function groupByMonth(entries: WorkLogEntry[]): Array<{ month: string; entries: WorkLogEntry[] }> {
  const groups = new Map<string, WorkLogEntry[]>();
  for (const entry of entries) {
    const date = new Date(timelineDate(entry));
    const month = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const bucket = groups.get(month) ?? [];
    bucket.push(entry);
    groups.set(month, bucket);
  }
  return [...groups.entries()].map(([month, monthEntries]) => ({ month, entries: monthEntries }));
}

function TimelineCard({ entry }: { entry: WorkLogEntry }) {
  const area = AREA_META[entry.parsed.area];
  const state = STATE_META[entry.state];
  const problem = entry.parsed.problem ?? entry.parsed.summary ?? 'No problem summary in the PR template yet.';
  const fix =
    entry.parsed.fix ??
    entry.parsed.timelineNote ??
    entry.parsed.summary ??
    'Add a Partner-readable summary or Git Activity Timeline note to this PR.';

  return (
    <article className="relative pl-8">
      <span
        className="absolute left-[7px] top-5 h-[calc(100%-0.5rem)] w-px bg-gradient-to-b from-accent-500/50 to-warm-200/40"
        aria-hidden
      />
      <span
        className="absolute left-0 top-5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-accent-500 bg-surface shadow-sm"
        aria-hidden
      />

      <Surface padding="sm" className="border border-warm-200/70 shadow-glass">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={area.tone} dot size="sm">
                {area.label}
              </StatusPill>
              <StatusPill tone={state.tone} dot size="sm">
                {state.label}
              </StatusPill>
              {entry.parsed.changeTypes.slice(0, 2).map((type) => (
                <StatusPill key={type} tone="neutral" dot={false} size="sm">
                  {type}
                </StatusPill>
              ))}
            </div>
            <h3 className="text-base font-semibold text-warm-900">
              <Link
                href={entry.html_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-start gap-1 hover:text-accent-700 hover:underline"
              >
                <span className="font-fw-mono text-sm text-warm-500">#{entry.number}</span>
                <span>{entry.title}</span>
                <ExternalLink size={14} className="mt-1 shrink-0 opacity-60" aria-hidden />
              </Link>
            </h3>
            <p className="text-xs text-warm-500">
              {formatDay(timelineDate(entry))}
              {entry.authorLogin ? ` · @${entry.authorLogin}` : null}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-fw-md bg-surface-sunken px-3 py-2">
            <p className="text-caption font-semibold uppercase tracking-widest text-warm-500">Problem</p>
            <p className="mt-1 text-sm leading-relaxed text-warm-800">{problem}</p>
          </div>
          <div className="rounded-fw-md bg-accent-50/60 px-3 py-2">
            <p className="text-caption font-semibold uppercase tracking-widest text-accent-700">Fix / outcome</p>
            <p className="mt-1 text-sm leading-relaxed text-warm-800">{fix}</p>
          </div>
        </div>

        {entry.parsed.timelineNote && entry.parsed.timelineNote !== fix ? (
          <p className="mt-3 border-t border-warm-200/70 pt-3 text-xs text-warm-600">
            <span className="font-semibold text-warm-700">Partner line:</span> {entry.parsed.timelineNote}
          </p>
        ) : null}
      </Surface>
    </article>
  );
}

export function WorkTimeline({
  entries,
  repoLabel,
  authorLogins,
  counts,
}: {
  entries: WorkLogEntry[];
  repoLabel: string;
  authorLogins: string[];
  counts: {
    total: number;
    merged: number;
    open: number;
    byArea: Record<WorkArea, number>;
  };
}) {
  const months = groupByMonth(entries);
  const topAreas = (Object.entries(counts.byArea) as Array<[WorkArea, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="success" dot size="sm">
            GitHub PRs
          </StatusPill>
          {authorLogins.length > 0 ? (
            <StatusPill tone="neutral" dot={false} size="sm">
              {authorLogins.map((login) => `@${login}`).join(', ')}
            </StatusPill>
          ) : (
            <StatusPill tone="warning" dot size="sm">
              all authors
            </StatusPill>
          )}
        </div>
        <Link
          href={`https://github.com/${repoLabel}/pulls`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline"
        >
          <GitPullRequest size={14} aria-hidden />
          Open {repoLabel} pulls
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2">
          <StatTile label="PRs tracked" value={counts.total} tone="neutral" mono />
        </div>
        <div className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2">
          <StatTile label="Merged" value={counts.merged} tone="neutral" mono />
        </div>
        <div className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2">
          <StatTile label="Open" value={counts.open} tone="neutral" mono />
        </div>
        <div className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2">
          <p className="text-caption uppercase tracking-widest text-warm-500">Top areas</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topAreas.length > 0 ? (
              topAreas.map(([area, count]) => (
                <StatusPill key={area} tone={AREA_META[area].tone} dot={false} size="sm">
                  {AREA_META[area].label} · {count}
                </StatusPill>
              ))
            ) : (
              <span className="text-xs text-warm-500">—</span>
            )}
          </div>
        </div>
      </div>

      <Surface padding="sm" className="border border-dashed border-warm-300/80 bg-surface-sunken/40">
        <p className="text-sm text-warm-700">
          Summaries are parsed from your PR template — fill in{' '}
          <code className="text-xs">Partner-readable summary</code>,{' '}
          <code className="text-xs">Area</code>, and{' '}
          <code className="text-xs">Git Activity Timeline note</code>. No AI guessing: if a section is empty, the card
          tells you what to add on the next PR.
        </p>
      </Surface>

      <div className="space-y-8">
        {months.map(({ month, entries: monthEntries }) => (
          <section key={month} className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">{month}</h2>
            <div className="space-y-4">
              {monthEntries.map((entry) => (
                <TimelineCard key={entry.number} entry={entry} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
