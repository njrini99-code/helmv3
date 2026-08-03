/**
 * ============================================================================
 * Fairway · feedback · FeatureUnavailable (Wave W1 — golf legacy-tree deletion)
 * ----------------------------------------------------------------------------
 * The Fairway-styled counterpart to the legacy
 * `@/components/golf/layout/FeatureUnavailable` — a full-page "this surface
 * isn't for you" notice (wrong role, no active team, etc.) with ONE clear CTA
 * back to somewhere useful. Same anatomy + same copy contract as the legacy
 * component (title / message / actionHref / actionLabel), Fairway skin: a
 * ViewHeader masthead over an EmptyState body inside the `.fairway-ds` scope.
 *
 * Used by routes that render this BEFORE (or independent of) any
 * isRedesignEnabled() fork — e.g. a player hitting a coach-only surface — so
 * it must render correctly unconditionally, not just inside a flag branch.
 * ========================================================================== */

import Link from 'next/link';
import { Lock, ArrowRight } from 'lucide-react';
import { fairwayScope } from '@/lib/redesign/flag';
import { PageContainer } from '../app-shell/PageContainer';
import { ViewHeader } from '../view-header';
import { EmptyState } from './EmptyState';
import { Button } from '../controls/button';

export interface FeatureUnavailableProps {
  /** Short surface name — "Alerts", "Pattern Management", etc. */
  title: string;
  /** One line explaining why this surface isn't available here. */
  message: string;
  /** Where the single CTA sends the visitor. Defaults to the dashboard home. */
  actionHref?: string;
  /** CTA label. Defaults to "Back to Dashboard". */
  actionLabel?: string;
}

export function FeatureUnavailable({
  title,
  message,
  actionHref = '/golf/dashboard',
  actionLabel = 'Back to Dashboard',
}: FeatureUnavailableProps) {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <PageContainer width="prose">
        {/* #1260 — these two used to receive the SAME `title` and `message`,
            which rendered the heading and the sentence verbatim twice on every
            role-denial screen. The anatomy (masthead over body) was right; the
            content split was not. Each string now appears exactly once:
            the masthead h1 names the surface, and the card states the reason
            once above the CTA. Do not pass `description` to the ViewHeader or
            `title` to the EmptyState here — that is precisely the duplication. */}
        <ViewHeader title={title} />
        <EmptyState
          icon={<Lock className="h-7 w-7" strokeWidth={1.75} />}
          title={message}
          action={
            <Button asChild variant="primary" rightIcon={<ArrowRight className="h-3.5 w-3.5" aria-hidden />}>
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          }
        />
      </PageContainer>
    </div>
  );
}
