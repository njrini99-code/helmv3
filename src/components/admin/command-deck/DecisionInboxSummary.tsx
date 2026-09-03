import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { DecisionInboxSummary as DecisionInboxSummaryModel } from '@/lib/admin/command-deck/decisions';
import { PanelAllClear, PanelStale } from '@/app/admin/_components/PanelStates';
import { InlineNotice } from '@/components/fairway';

const KIND_LABEL: Readonly<Record<DecisionInboxSummaryModel['items'][number]['kind'], string>> = {
  'repair-needs-evidence': 'REPAIR NEEDS EVIDENCE',
  'migration-hold': 'MIGRATION ON HOLD',
};

/**
 * DECISION INBOX summary (brief §10, §34) — human-judgment items only.
 *
 * "No decisions waiting on you" is a genuine calm empty state ONLY when
 * `summary.readable` is true — see `decisions.ts`'s own doc comment. A
 * `readable: false` inbox never renders as calm, mirroring the same
 * contract `AttentionStack`/`AttentionQueue` already hold for
 * `canClaimAllClear`.
 *
 * `readable: false` does NOT mean "discard everything", though: it only
 * means HELD.md itself failed to read. `summary.items` can already contain
 * genuine `'needs-evidence'` rows from `selectAttention` — a completely
 * different, independently-readable source. Replacing those real items with
 * a blank "could not read" panel would itself be an "unknown rendered as
 * healthy" mistake in reverse: a known item silently dropped from view.
 * So this only falls back to the full unreadable panel when there is
 * NOTHING to show either way; otherwise it shows what IS known, with an
 * explicit caveat that the held-migration slice specifically may be
 * incomplete.
 */
export function DecisionInboxSummary({ summary, checkedAt }: { summary: DecisionInboxSummaryModel; checkedAt: string }) {
  if (!summary.readable && summary.items.length === 0) {
    return (
      <PanelStale
        label="Decision inbox"
        error="A held-migration source could not be read this refresh — this list may be incomplete."
      />
    );
  }

  if (summary.items.length === 0) {
    return <PanelAllClear label="No decisions waiting on you" checkedAt={checkedAt} />;
  }

  return (
    <div className="space-y-1.5">
      {!summary.readable ? (
        <InlineNotice tone="warning">
          A held-migration source could not be read this refresh — the items below may be
          missing migration-hold decisions.
        </InlineNotice>
      ) : null}
      <ul className="space-y-1.5">
        {summary.items.map((item) => (
          <li key={item.id} className={cn('rounded-lg bg-surface-sunken px-3 py-2')}>
            <span className="text-eyebrow font-bold uppercase tracking-wide text-fw-warning-ink">
              {KIND_LABEL[item.kind]}
            </span>
            {item.href ? (
              <Link href={item.href} className="block text-body-sm font-medium text-warm-900 hover:underline">
                {item.title}
              </Link>
            ) : (
              <p className="text-body-sm font-medium text-warm-900">{item.title}</p>
            )}
            <p className="mt-0.5 text-caption text-warm-600">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
