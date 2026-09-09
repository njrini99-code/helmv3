'use client';

/**
 * Changed-field diff for the edit-mode review receipt (§2.2). Highlights
 * only what actually changed, with the previous value beside it — never a
 * full restatement of the form.
 */

import type { ChangedFieldEntry } from './changeDetection';

export interface EventChangeSummaryProps {
  changes: ChangedFieldEntry[];
}

export function EventChangeSummary({ changes }: EventChangeSummaryProps) {
  if (changes.length === 0) {
    return (
      <p className="font-fw-sans text-caption text-text-tertiary">No changes yet.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5" aria-label="Changed fields">
      {changes.map((change) => (
        <li
          key={change.key}
          className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-fw-sans text-caption text-text-secondary"
        >
          <span className="font-medium text-text-primary">{change.label}:</span>
          <span className="text-text-tertiary line-through">{change.before}</span>
          <span aria-hidden className="text-text-tertiary">→</span>
          <span className="text-text-primary">{change.after}</span>
        </li>
      ))}
    </ul>
  );
}
