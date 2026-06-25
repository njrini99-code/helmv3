'use client';

/**
 * DashboardErrorState — recoverable inline error surface for coach segment
 * dashboards (college / high-school / juco / showcase).
 *
 * Why this exists: the coach dashboard data hooks expose an `error` field, but
 * the pages previously fell through to their zero/empty branch on a fetch
 * failure — making a real load failure indistinguishable from a legitimately
 * empty program. That silently violates the v2 acceptance spec, which requires
 * a DISTINCT error state per data source:
 *   "Error state: scoped message by data source, retry button, no raw stack trace"
 *   (docs/.../v2_screen_acceptance_specs.md)
 *
 * This is the *inline, recoverable* counterpart to the route-group `error.tsx`
 * (which only catches render-time throws). It is rendered when a hook's `error`
 * field is truthy, so the coach can retry without a full navigation/reload.
 *
 * Palette: cream/green GolfHelm look — reuses glass-standard + warm/primary
 * tokens VERBATIM. No navy/amber.
 */

import { Button } from '@/components/ui/button';
import { IconAlertCircle, IconRefresh } from '@/components/icons';

interface DashboardErrorStateProps {
  /**
   * Scoped, human-readable data source label so the message names *what*
   * failed (e.g. "dashboard", "your roster"). Spec: "scoped message by data
   * source". Never pass a raw error message / stack trace here.
   */
  source?: string;
  /** Retry handler — typically the hook's `refetch`. */
  onRetry?: () => void;
  /** Optional title override. */
  title?: string;
}

export function DashboardErrorState({
  source = 'this dashboard',
  onRetry,
  title = "We couldn't load your dashboard",
}: DashboardErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="relative glass-standard rounded-2xl overflow-clip p-8 sm:p-10"
    >
      <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
          <IconAlertCircle size={26} className="text-destructive" />
        </div>
        <h3 className="text-lg font-semibold text-warm-900 tracking-tight">{title}</h3>
        <p className="text-sm leading-relaxed text-warm-500 mt-2">
          Something went wrong while loading {source}. This is usually temporary —
          your data is safe. Try again in a moment.
        </p>
        {onRetry && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
            leftIcon={<IconRefresh size={15} />}
            className="mt-5"
          >
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
