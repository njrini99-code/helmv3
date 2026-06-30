'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  readModelStateLabel,
  type ReadModelLoadState,
} from '@/lib/product-trust/read-model-state';
import { IconWarning, IconShieldAlert } from '@/components/icons';

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
 */
export function ReadModelStateNotice({
  state,
  title,
  onRetry,
  className,
}: ReadModelStateNoticeProps) {
  const Icon = state === 'unauthorized' ? IconShieldAlert : IconWarning;
  const heading = title ?? TITLES[state];

  return (
    <Card variant="glass" className={className}>
      <CardContent className="p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Icon size={26} className="text-amber-600" />
        </div>
        <h3 className="text-lg font-semibold text-warm-900 mb-2">{heading}</h3>
        <p className="text-warm-500 max-w-md mx-auto mb-4">{readModelStateLabel(state)}</p>
        {onRetry && state !== 'unauthorized' ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
