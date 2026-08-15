/**
 * ============================================================================
 * Fairway · feedback · FeatureUnavailable (Wave W1 — golf legacy-tree deletion)
 * ----------------------------------------------------------------------------
 * The Fairway-styled counterpart to the legacy
 * `@/components/golf/layout/FeatureUnavailable` — a full-page "this surface
 * isn't for you" notice (wrong role, no active team, etc.) with ONE clear CTA
 * back to somewhere useful. Same anatomy + same copy contract as the legacy
 * component (title / message / actionHref / actionLabel).
 *
 * #1318 — this used to stack a left-aligned `ViewHeader` masthead ABOVE a
 * centered `EmptyState` body. `ViewHeader`'s h1 lives in a `flex-row
 * justify-between` title column sized to its own text — it has no centering
 * wrapper of its own, it is simply left-edge-aligned inside the page column.
 * `EmptyState` independently centers ITS OWN content (`items-center
 * text-center`) inside that same column. Two different alignment rules for
 * the same visual column put the h1 and the body/button on two different
 * axes — measured on prod at 266px and 182px apart on the CoachHelm and
 * Notification-preferences role-denial screens. `/golf/dashboard/classes`
 * never had this bug because it never mounts a separate masthead here: the
 * wrong-role state is ONE `EmptyState` (icon + title + description + CTA),
 * card-framed in a `Surface`, so every line shares the EmptyState's own
 * centered axis. This component now uses that exact shape — one
 * implementation, not a masthead-plus-body composite — so title, message,
 * and action always share one axis by construction.
 *
 * Used by routes that render this BEFORE (or independent of) any
 * isRedesignEnabled() fork — e.g. a player hitting a coach-only surface — so
 * it must render correctly unconditionally, not just inside a flag branch.
 * ========================================================================== */

import Link from 'next/link';
import { Lock, ArrowRight } from 'lucide-react';
import { fairwayScope } from '@/lib/redesign/flag';
import { PageContainer } from '../app-shell/PageContainer';
import { Surface } from '../surfaces/surface';
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
      {/* Same shape as the Classes wrong-role state: one centered column,
          one card, one EmptyState — title/message/action share one axis
          because there is no separate masthead to disagree with it. */}
      <PageContainer width="prose" flow={false}>
        <Surface elevation="border" padding="lg">
          <EmptyState
            icon={<Lock className="h-7 w-7" strokeWidth={1.75} />}
            title={title}
            description={message}
            action={
              <Button asChild variant="primary" rightIcon={<ArrowRight className="h-3.5 w-3.5" aria-hidden />}>
                <Link href={actionHref}>{actionLabel}</Link>
              </Button>
            }
          />
        </Surface>
      </PageContainer>
    </div>
  );
}
