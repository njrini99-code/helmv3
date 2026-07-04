'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  currentWorkflowSelection,
  type BenLeahTrackedIssue,
  type BenLeahWorkflowSelection,
} from '@/lib/admin/ben-leah-issue-tracker';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { updateBenLeahIssueWorkflow } from './actions';

const WORKFLOW_OPTIONS: Array<{ value: BenLeahWorkflowSelection; label: string }> = [
  { value: 'triaged', label: 'Triaged' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'in_production', label: 'In production' },
  { value: 'wont_fix', label: "Won't fix" },
];

const selectClass = cn(
  'min-w-[9.5rem] rounded-fw-md border border-border-subtle bg-surface px-2 py-1 text-xs text-warm-900 shadow-flat outline-none',
  'focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 disabled:opacity-60',
);

export function BenLeahIssueWorkflowSelect({ issue }: { issue: BenLeahTrackedIssue }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = currentWorkflowSelection(issue.labels);

  const onChange = (raw: string) => {
    if (!raw) return;
    const next = raw as BenLeahWorkflowSelection;
    if (next === current) return;
    setError(null);
    startTransition(async () => {
      const result = await updateBenLeahIssueWorkflow(issue.number, issue.labels, next);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <NativeSelect
        aria-label={`Workflow status for issue ${issue.number}`}
        className={selectClass}
        value={current ?? ''}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
      >
        {!current ? (
          <option value="" disabled>
            Set workflow…
          </option>
        ) : null}
        {WORKFLOW_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      {error ? <p className="max-w-[12rem] text-caption text-fw-danger">{error}</p> : null}
    </div>
  );
}
