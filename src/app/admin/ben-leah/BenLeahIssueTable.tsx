'use client';

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
      <td className="px-3 text-xs text-warm-500">{formatWhen(issue.updated_at)}</td>
      <td className="px-3 text-xs text-warm-500">
        {issue.closed_at ? formatWhen(issue.closed_at) : '—'}
      </td>
    </tr>
  );
}

export function BenLeahIssueTable({ issues }: { issues: BenLeahTrackedIssue[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-warm-200/70">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
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
  );
}
