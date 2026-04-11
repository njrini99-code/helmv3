'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  IconSparkles,
  IconRefresh,
  IconSettings,
  IconMenu,
} from '@/components/icons';
import { useSidebar } from '@/contexts/sidebar-context';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';

interface CoachHelmHeaderProps {
  lastUpdated: string;
  alertLevel: PlayerCoachHelmDashboardData['alertLevel'];
  playerState: PlayerCoachHelmDashboardData['playerState'];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

/**
 * Formats an ISO timestamp to a relative time string
 */
function formatLastUpdated(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Returns color classes based on alert level
 */
function getAlertLevelConfig(level: PlayerCoachHelmDashboardData['alertLevel']) {
  switch (level) {
    case 'critical':
      return {
        bgColor: 'bg-red-100',
        textColor: 'text-red-700',
        label: 'Critical',
      };
    case 'warning':
      return {
        bgColor: 'bg-amber-100',
        textColor: 'text-amber-700',
        label: 'Warning',
      };
    case 'info':
      return {
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-700',
        label: 'Info',
      };
    case 'none':
    default:
      return {
        bgColor: 'bg-warm-100',
        textColor: 'text-warm-600',
        label: 'All Good',
      };
  }
}

/**
 * Returns state label configuration based on player state
 */
function getStateLabel(state: PlayerCoachHelmDashboardData['playerState']) {
  switch (state) {
    case 'improving':
      return { text: 'Trending Up', color: 'text-primary-600', bgColor: 'bg-primary-100' };
    case 'struggling':
      return { text: 'Focus Needed', color: 'text-amber-600', bgColor: 'bg-amber-100' };
    case 'stable':
      return { text: 'Steady Form', color: 'text-warm-600', bgColor: 'bg-warm-100' };
    default:
      return { text: 'Analyzing...', color: 'text-warm-500', bgColor: 'bg-warm-100' };
  }
}

export function CoachHelmHeader({
  lastUpdated,
  alertLevel,
  playerState,
  onRefresh,
  isRefreshing = false,
}: CoachHelmHeaderProps) {
  const alertConfig = getAlertLevelConfig(alertLevel);
  const stateLabel = getStateLabel(playerState);
  const { toggleMobile } = useSidebar();

  return (
    <div className="golf-mobile-page-header">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
        <div className="flex items-center justify-between gap-3">
          {/* Left: hamburger + sparkle icon + title */}
          <div className="flex items-center gap-2.5 md:gap-4 min-w-0 flex-1">
            <button
              onClick={toggleMobile}
              className={cn(
                'lg:hidden p-2 -ml-2 rounded-xl touch-manipulation flex-shrink-0',
                'text-warm-500 hover:text-warm-700 hover:bg-warm-100/80',
                'transition-colors duration-150 active:scale-95',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
              )}
              aria-label="Open navigation menu"
            >
              <IconMenu size={22} />
            </button>
            <div className="w-9 h-9 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20 flex-shrink-0">
              <IconSparkles size={18} className="text-white md:hidden" />
              <IconSparkles size={24} className="text-white hidden md:block" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg md:text-2xl font-semibold tracking-tight text-warm-900 truncate">
                CoachHelm AI
              </h1>
              <p className="text-warm-500 text-xs md:text-sm truncate">
                Your personal golf intelligence
              </p>
            </div>
          </div>

          {/* Right: badges + actions — badge hidden on mobile, icons-only */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* State badge (desktop only — icon pill takes over on mobile) */}
            <div
              className={cn(
                'hidden md:flex px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap',
                stateLabel.bgColor,
                stateLabel.color
              )}
            >
              {stateLabel.text}
            </div>

            {/* Alert level badge (desktop only, if non-none) */}
            {alertLevel !== 'none' && (
              <div
                className={cn(
                  'hidden md:flex px-3 py-1.5 rounded-full text-xs font-medium items-center gap-1.5 whitespace-nowrap',
                  alertConfig.bgColor,
                  alertConfig.textColor
                )}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  alertLevel === 'critical' ? 'bg-red-500 animate-pulse' :
                  alertLevel === 'warning' ? 'bg-amber-500' :
                  'bg-blue-500'
                )} />
                {alertConfig.label}
              </div>
            )}

            {/* Last updated (desktop only) */}
            <span className="text-xs text-warm-400 hidden lg:block whitespace-nowrap" suppressHydrationWarning>
              Updated {formatLastUpdated(lastUpdated)}
            </span>

            {/* Mobile-only state dot — visually signals status without eating space */}
            <span
              className={cn(
                'md:hidden w-2 h-2 rounded-full',
                alertLevel === 'critical' ? 'bg-red-500 animate-pulse' :
                alertLevel === 'warning' ? 'bg-amber-500' :
                playerState === 'improving' ? 'bg-primary-500' :
                playerState === 'struggling' ? 'bg-amber-500' :
                'bg-warm-400'
              )}
              aria-label={stateLabel.text}
              title={stateLabel.text}
            />

            {/* Refresh button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className={cn(
                  'p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 active:bg-white/70 transition-all flex-shrink-0',
                  isRefreshing && 'animate-spin pointer-events-none'
                )}
                title="Refresh insights"
                aria-label="Refresh insights"
              >
                <IconRefresh size={18} />
              </button>
            )}

            {/* Settings link */}
            <Link
              href="/golf/dashboard/settings"
              className="p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 active:bg-white/70 transition-all flex-shrink-0"
              title="AI Settings"
              aria-label="AI Settings"
            >
              <IconSettings size={18} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
