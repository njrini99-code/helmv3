'use client';

import { Button } from '@/components/fairway';
import { Textarea } from '@/components/ui/textarea';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { markCodeExpected } from '@/app/admin/actions/bridge-notes';

/**
 * The reason form behind "Mark expected…" (BR-0506). A client component because the ui Textarea uses forwardRef and
 * useId; the submit is still a plain form posting the server action, so it works before hydration. `max` comes from the
 * server (REASON_MAX in notes.ts), so the live model stays out of the browser bundle.
 */
export function ExpectedReasonForm({ id, max }: { id: number; max: number }) {
  return (
    <form action={markCodeExpected} className="mt-3 flex min-w-0 flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`bridge-expected-${id}`} className="text-caption font-medium text-text-secondary">
        Why is this firing normal?
      </label>
      <Textarea
        id={`bridge-expected-${id}`}
        name="reason"
        required
        maxLength={max}
        rows={3}
        placeholder="e.g. Coaches without a roster see this on purpose until they add a player."
        className="w-full rounded-fw-sm border border-border-control bg-surface px-3 py-2 text-body-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
      />
      <div>
        <Button type="submit" variant="primary" size="sm" data-br={BR.codes.markExpected}>
          Mark expected
        </Button>
      </div>
    </form>
  );
}
