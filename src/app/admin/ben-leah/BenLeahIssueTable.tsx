'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { BenLeahTrackedIssue } from '@/lib/admin/ben-leah-issue-tracker';
import { StatusPill, type FwStatusTone } from '@/components/fairway';
import { BenLeahIssueWorkflowSelect } from './BenLeahIssueWorkflowSelect';

const TRACK_META: Record<
  BenLeahTrackedIssue['trackStatus'],
  { label: string; tone: FwStatusTone }
> = {
  open: { label: 'Open', tone: 'warning' },
  in_progress: { label: 'In progress', tone: 'info' },
  in_production: { label: 'In production', tone: 'success' },
  fixed_pending_deploy: { label: 'Fixed · pending deploy', tone: 'warning' },
  fixed: { label: 'Fixed', tone: 'success' },
  wont_fix: { label: "Won't fix", tone: 'neutral' },
};

const KIND_LABEL: Record<string, string> = {
  bug: 'Bug',
  change: 'Change',
  addition: 'Addition',
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * This is a Client Component: `formatWhen` resolves against the RUNTIME's
 * timezone, so calling it directly in render bakes the server's UTC render
 * into the SSR HTML and recomputes to the viewer's local zone on hydration —
 * a guaranteed text mismatch (the same bug class LocalTime.tsx documents;
 * that shared component doesn't apply here as-is since its variants don't
 * carry these custom month/day/hour/minute options). Same fix, replicated:
 * a deterministic placeholder until a post-hydration effect swaps in the
 * localized string.
 */
function FormattedWhen({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(formatWhen(iso));
  }, [iso]);

  return <span suppressHydrationWarning>{label ?? '—'}</span>;
}

function IssueRow({ issue }: { issue: BenLeahTrackedIssue }) {
  const meta = TRACK_META[issue.trackStatus];

  return (
    <tr>
      <td className="sticky left-0 z-10 bg-surface py-2 pl-3 pr-3">
        <Link
          href={issue.html_url}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-1 font-fw-mono text-xs text-accent-700 hover:underline"
        >
          #{issue.number}
          <ExternalLink size={12} className="opacity-60 group-hover:opacity-100" aria-hidden />
        </Link>
        <p className="mt-1 max-w-[280px] truncate text-sm font-medium text-warm-900" title={issue.displayTitle}>
          {issue.displayTitle}
        </p>
      </td>
      <td className="px-3">
        <StatusPill tone={meta.tone} dot size="sm">
          {meta.label}
        </StatusPill>
      </td>
      <td className="px-3">
        <BenLeahIssueWorkflowSelect issue={issue} />
      </td>
      <td className="px-3 text-xs text-warm-600">
        {issue.kind ? KIND_LABEL[issue.kind] ?? issue.kind : '—'}
      </td>
      <td className="px-3 text-xs capitalize text-warm-600">{issue.priority ?? '—'}</td>
      <td className="px-3 text-xs text-warm-600">{issue.category ?? '—'}</td>
      <td className="px-3 text-xs text-warm-500">
        <FormattedWhen iso={issue.updated_at} />
      </td>
      <td className="px-3 text-xs text-warm-500">
        {issue.closed_at ? <FormattedWhen iso={issue.closed_at} /> : '—'}
      </td>
    </tr>
  );
}

// Mobile Doctrine rule 8: a `min-w-[980px]` table inside `overflow-x-auto`
// is a horizontal-scroll anti-pattern on a phone-primary reading surface —
// it just relocates the page-overflow problem inside a box instead of
// solving it. Below `md` this renders full-width cards instead: identity
// (issue # + title, wrapped not truncated) + 2-3 key stats (derived status,
// type/priority/category) + the workflow control + a tap-through link to
// GitHub. The desktop table is untouched at `md`+.
function IssueCard({ issue }: { issue: BenLeahTrackedIssue }) {
  const meta = TRACK_META[issue.trackStatus];

  return (
    <div className="space-y-3 rounded-xl border border-warm-200/70 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={issue.html_url}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1 font-fw-mono text-xs text-accent-700 hover:underline"
          >
            #{issue.number}
            <ExternalLink size={12} className="opacity-60 group-hover:opacity-100" aria-hidden />
          </Link>
          {/* break-words, not truncate — Mobile Doctrine's "text clipped
              mid-word" defect class. A long issue title should wrap, never
              cut off inside a card whose width is the whole viewport. */}
          <p className="mt-1 break-words text-sm font-medium text-warm-900">{issue.displayTitle}</p>
        </div>
        <StatusPill tone={meta.tone} dot size="sm" className="shrink-0">
          {meta.label}
        </StatusPill>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-600">
        <span>{issue.kind ? KIND_LABEL[issue.kind] ?? issue.kind : '—'}</span>
        <span aria-hidden className="text-warm-300">·</span>
        <span className="capitalize">{issue.priority ?? '—'}</span>
        <span aria-hidden className="text-warm-300">·</span>
        <span>{issue.category ?? '—'}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-warm-500">
        <span>
          Updated <FormattedWhen iso={issue.updated_at} />
        </span>
        {issue.closed_at ? (
          <span>
            Closed <FormattedWhen iso={issue.closed_at} />
          </span>
        ) : null}
      </div>

      <div>
        <span className="text-xs font-semibold uppercase tracking-widest text-warm-500">
          Set workflow
        </span>
        <div className="mt-1">
          <BenLeahIssueWorkflowSelect issue={issue} />
        </div>
      </div>
    </div>
  );
}

export function BenLeahIssueTable({ issues }: { issues: BenLeahTrackedIssue[] }) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {issues.map((issue) => (
          <IssueCard key={issue.number} issue={issue} />
        ))}
      </div>

      {/* max-h + overflow-auto (not just overflow-x-auto) — the sticky thead
          below only pins relative to a scroll container that actually
          scrolls internally; matches the `<thead className="sticky top-0
          z-10 ...">` inside a `max-h-[28rem] overflow-auto` wrapper idiom
          already used for a long reviewed-item list in
          src/components/baseball/import-center/ImportWizardClient.tsx. */}
      <div className="hidden max-h-[28rem] overflow-auto rounded-xl border border-warm-200/70 md:block">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="sticky top-0 z-20 bg-surface-sunken">
            <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
              <th className="sticky left-0 z-10 bg-surface-sunken py-2 pl-3 pr-3">Issue</th>
              <th className="px-3">Derived status</th>
              <th className="px-3">Set workflow</th>
              <th className="px-3">Type</th>
              <th className="px-3">Priority</th>
              <th className="px-3">Category</th>
              <th className="px-3">Updated</th>
              <th className="px-3">Closed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-200/60 bg-surface">
            {issues.map((issue) => (
              <IssueRow key={issue.number} issue={issue} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
