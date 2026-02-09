'use client';

import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconTarget,
  IconActivity,
} from '@/components/icons';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';

interface PlayerStateCardProps {
  playerState: PlayerCoachHelmDashboardData['playerState'];
  playerName: string;
}

/**
 * Configuration for each player state
 */
function getStateConfig(state: PlayerCoachHelmDashboardData['playerState']) {
  switch (state) {
    case 'improving':
      return {
        icon: IconTrendingUp,
        iconColor: 'text-green-500',
        iconBgColor: 'bg-green-100',
        accentColor: 'bg-gradient-to-r from-green-400 to-green-600',
        title: 'On the Rise',
        subtitle: 'Your game is trending upward',
        message: 'Great work! Your recent performance shows consistent improvement. Keep building on this momentum.',
        borderColor: 'border-green-200',
        glowColor: 'before:bg-green-500/10',
      };
    case 'stable':
      return {
        icon: IconTarget,
        iconColor: 'text-blue-500',
        iconBgColor: 'bg-blue-100',
        accentColor: 'bg-gradient-to-r from-blue-400 to-blue-600',
        title: 'Steady Performance',
        subtitle: 'Consistent and reliable',
        message: 'You are maintaining a solid level of play. Focus on small improvements to take your game to the next level.',
        borderColor: 'border-blue-200',
        glowColor: 'before:bg-blue-500/10',
      };
    case 'struggling':
      return {
        icon: IconTrendingDown,
        iconColor: 'text-amber-500',
        iconBgColor: 'bg-amber-100',
        accentColor: 'bg-gradient-to-r from-amber-400 to-amber-600',
        title: 'Room to Improve',
        subtitle: 'Let\'s get back on track',
        message: 'Every golfer faces challenges. Review your focus areas below and work with your coach to address key patterns.',
        borderColor: 'border-amber-200',
        glowColor: 'before:bg-amber-500/10',
      };
    case 'unknown':
    default:
      return {
        icon: IconActivity,
        iconColor: 'text-slate-500',
        iconBgColor: 'bg-slate-100',
        accentColor: 'bg-gradient-to-r from-slate-400 to-slate-600',
        title: 'Building Your Profile',
        subtitle: 'More data needed',
        message: 'Play more rounds to unlock personalized AI insights and performance predictions.',
        borderColor: 'border-slate-200',
        glowColor: 'before:bg-slate-500/5',
      };
  }
}

export function PlayerStateCard({ playerState, playerName }: PlayerStateCardProps) {
  const config = getStateConfig(playerState);
  const Icon = config.icon;

  // Get first name for personalization
  const firstName = playerName.split(' ')[0] || 'Player';

  return (
    <GlassCard
      className={cn(
        'relative overflow-hidden',
        config.glowColor
      )}
      glow="subtle"
    >
      {/* Top accent bar */}
      <div className={cn('absolute top-0 left-0 right-0 h-1', config.accentColor)} />

      <div className="flex items-start gap-4">
        {/* State icon */}
        <m.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0',
            config.iconBgColor
          )}
        >
          <Icon size={28} className={config.iconColor} />
        </m.div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <p className="text-xs font-medium text-warm-400 uppercase tracking-wider mb-1">
              Current Form
            </p>
            <h3 className="text-xl font-semibold text-warm-900 mb-1">
              {config.title}
            </h3>
            <p className={cn('text-sm font-medium mb-3', config.iconColor)}>
              {config.subtitle}
            </p>
          </m.div>

          <m.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="text-sm text-warm-600 leading-relaxed"
          >
            {config.message}
          </m.p>
        </div>
      </div>

      {/* Personalized greeting (shown on larger screens) */}
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-4 pt-4 border-t border-white/20 hidden sm:block"
      >
        <p className="text-sm text-warm-500">
          {playerState === 'improving' && (
            <>Keep it up, <span className="font-medium text-warm-700">{firstName}</span>! Your dedication is paying off.</>
          )}
          {playerState === 'stable' && (
            <>Solid consistency, <span className="font-medium text-warm-700">{firstName}</span>. Ready to push further?</>
          )}
          {playerState === 'struggling' && (
            <>Stay focused, <span className="font-medium text-warm-700">{firstName}</span>. Every great player faces adversity.</>
          )}
          {playerState === 'unknown' && (
            <>Welcome, <span className="font-medium text-warm-700">{firstName}</span>. Log some rounds to get started.</>
          )}
        </p>
      </m.div>
    </GlassCard>
  );
}
