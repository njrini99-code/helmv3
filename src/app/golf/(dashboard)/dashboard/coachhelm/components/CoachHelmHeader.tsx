'use client';

import { m } from 'framer-motion';
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
    <div className="relative border-b border-warm-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-5">
        <div className="flex items-center justify-between">
          {/* Left side: hamburger, icon, and title */}
          <div className="flex items-center gap-3 md:gap-4">
            <button
              onClick={toggleMobile}
              className={cn(
                'lg:hidden p-2.5 -ml-2 rounded-xl touch-manipulation',
                'text-warm-500 hover:text-warm-700 hover:bg-warm-100/80',
                'transition-colors duration-150 active:scale-95',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
              )}
              aria-label="Open navigation menu"
            >
              <IconMenu size={22} />
            </button>
            <m.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20"
            >
              <IconSparkles size={24} className="text-white" />
            </m.div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-warm-900">
                CoachHelm AI
              </h1>
              <p className="text-warm-500 text-sm">
                Your personal golf intelligence
              </p>
            </div>
          </div>

          {/* Right side: Badges and actions */}
          <div className="flex items-center gap-3">
            {/* State badge */}
            <m.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium',
                stateLabel.bgColor,
                stateLabel.color
              )}
            >
              {stateLabel.text}
            </m.div>

            {/* Alert level badge - only show if not 'none' */}
            {alertLevel !== 'none' && (
              <m.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium hidden sm:flex items-center gap-1.5',
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
              </m.div>
            )}

            {/* Last updated */}
            <span className="text-xs text-warm-400 hidden sm:block">
              Updated {formatLastUpdated(lastUpdated)}
            </span>

            {/* Refresh button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className={cn(
                  'p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 active:bg-white/70 transition-all',
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
              className="p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 active:bg-white/70 transition-all"
              title="AI Settings"
            >
              <IconSettings size={18} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
