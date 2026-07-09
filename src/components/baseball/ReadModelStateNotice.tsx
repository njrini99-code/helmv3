'use client';

import { Button } from '@/components/ui/button';
import { EditorsLetter } from '@/components/baseball/living-annual';
import {
  readModelStateLabel,
  type ReadModelLoadState,
} from '@/lib/product-trust/read-model-state';

interface ReadModelStateNoticeProps {
  state: Exclude<ReadModelLoadState, 'ready' | 'empty'>;
  title?: string;
  onRetry?: () => void;
  className?: string;
}

const TITLES: Record<Exclude<ReadModelLoadState, 'ready' | 'empty'>, string> = {
  unauthorized: 'Access restricted',
  error: 'Could not load data',
  partial: 'Some data unavailable',
};

/**
 * Explicit load-state surface for legacy client pages (#413).
 * Never collapses failures into a healthy empty state.
 *
 * Living-Annual doctrine (design-system-living-annual.md §7): empty AND error
 * states both render through `<EditorsLetter>` — "no yellow warning boxes
 * anywhere." This previously rendered its own amber-tinted icon chip
 * (`bg-amber-50` / `text-amber-600`), which is exactly the pattern the kit
 * replaces; composing `EditorsLetter` here fixes every call site at once
 * (announcements, documents, travel, camps, compare, dev-plan).
 */
export function ReadModelStateNotice({
  state,
  title,
  onRetry,
  className,
}: ReadModelStateNoticeProps) {
  const heading = title ?? TITLES[state];

  return (
    <EditorsLetter
      ink="team"
      title={heading}
      body={readModelStateLabel(state)}
      className={className}
      action={
        onRetry && state !== 'unauthorized' ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}
