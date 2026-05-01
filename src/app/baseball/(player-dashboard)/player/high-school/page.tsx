'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconEye,
  IconStar,
  IconMessage,
  IconVideo,
  IconChevronRight,
  IconEdit,
  IconTarget,
  IconArrowRight,
  IconUsers,
} from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useBaseballPlayerDashboard } from '@/hooks/use-baseball-dashboard';
import { getFullName, formatHeight, pluralize } from '@/lib/utils';

function BentoStatSkeleton() {
  return (
    <div className="glass-standard rounded-2xl overflow-clip animate-pulse p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-3.5 bg-warm-200 rounded w-20 mb-3" />
          <div className="h-7 bg-warm-200 rounded w-16 mb-2" />
          <div className="h-3 bg-warm-100 rounded w-28" />
        </div>
        <div className="w-11 h-11 rounded-xl bg-warm-100" />
      </div>
    </div>
  );
}

function BentoStatCard({
  label,
  value,
  change,
  icon: Icon,
  iconBg = 'bg-warm-100',
  iconColor = 'text-warm-600',
  href,
}: {
  label: string;
  value: number | string;
  change?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconBg?: string;
  iconColor?: string;
  href?: string;
}) {
  const content = (
    <div className="relative group glass-standard rounded-2xl overflow-clip transition-all duration-300 hover:shadow-lg hover:-tranwarm-y-0.5 p-5">
      <ShineEffect />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm leading-relaxed text-warm-500 font-medium">{label}</p>
          <p className="font-semibold text-warm-900 mt-1 text-2xl">
            <span className="tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</span>
          </p>
          {change && (
            <p className="text-xs text-warm-400 mt-1.5">{change}</p>
          )}
        </div>
        <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} group-hover:scale-110 transition-transform duration-300`}>
          <Icon size={22} />
        </div>
      </div>
      {href && (
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconChevronRight size={16} className="text-warm-400" />
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

export default function HSPlayerDashboardPage() {
  const { player, loading: authLoading } = useAuth();
  const { stats: playerStats } = useBaseballPlayerDashboard();

  if (authLoading) return <PageLoading />;

  return (
    <>
      <Header title="Dashboard" subtitle={`Welcome back, ${player?.first_name || 'Player'}`} />
      <div className="p-6 lg:p-8 space-y-6">
        {/* Recruiting Activation Banner */}
        {!player?.recruiting_activated && (
          <div className="relative bg-gradient-to-r from-warm-900 via-warm-800 to-warm-900 rounded-2xl border border-warm-700/50 p-6 overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-warm-700/20 rounded-full blur-3xl" />
            <div className="relative z-10 flex items-center gap-6">
              <div className="w-14 h-14 rounded-2xl glass-subtle flex items-center justify-center flex-shrink-0">
                <IconTarget size={28} className="text-white" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold tracking-tight text-white mb-1">
                  Ready to get recruited?
                </h3>
                <p className="text-warm-300">
                  Activate recruiting to make your profile visible to college coaches and unlock powerful features.
                </p>
              </div>
              <Link href="/baseball/dashboard/activate">
                <Button size="lg" className="bg-white text-warm-900 hover:bg-warm-100 transition-colors active:bg-warm-200 shadow-xl px-6">
                  Activate Now <IconArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Profile Card */}
        <div className="relative glass-standard rounded-2xl p-6 overflow-clip">
          <ShineEffect />
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <Avatar name={getFullName(player?.first_name, player?.last_name)} size="2xl" src={player?.avatar_url} />
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-warm-900">{player?.first_name} {player?.last_name}</h2>
                  <p className="text-warm-500">{player?.primary_position} • Class of {player?.grad_year}</p>
                  <p className="text-sm leading-relaxed text-warm-400 mt-1">{player?.high_school_name} • {player?.city}, {player?.state}</p>
                </div>
                <Link href="/baseball/dashboard/profile">
                  <Button variant="secondary" size="sm" className="gap-2">
                    <IconEdit size={14} /> Edit Profile
                  </Button>
                </Link>
              </div>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Badge variant={player?.recruiting_activated ? 'success' : 'secondary'}>
                  {player?.recruiting_activated ? 'Recruiting Active' : 'Recruiting Inactive'}
                </Badge>
                <Badge variant="secondary">
                  {player?.profile_completion_percent}% Complete
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {!playerStats ? (
            <>
              <BentoStatSkeleton />
              <BentoStatSkeleton />
              <BentoStatSkeleton />
              <BentoStatSkeleton />
            </>
          ) : (
            <>
              <BentoStatCard
                label="Profile Views"
                value={playerStats.profileViews || 0}
                change={playerStats.profileViewsChange ? `${playerStats.profileViewsChange > 0 ? '+' : ''}${playerStats.profileViewsChange}% vs last week` : 'This week'}
                icon={IconEye}
                iconBg="bg-blue-50"
                iconColor="text-blue-500"
                href="/baseball/dashboard/analytics"
              />
              <BentoStatCard
                label="On Watchlists"
                value={playerStats.watchlistCount || 0}
                change="Coaches interested"
                icon={IconStar}
                iconBg="bg-amber-50"
                iconColor="text-amber-500"
              />
              <BentoStatCard
                label="Messages"
                value={playerStats.unreadMessages || 0}
                change={pluralize(playerStats.unreadMessages || 0, 'unread')}
                icon={IconMessage}
                iconBg="bg-purple-50"
                iconColor="text-purple-500"
                href="/baseball/dashboard/messages"
              />
              <BentoStatCard
                label="Video Views"
                value={playerStats.videoViews || 0}
                change="Total views"
                icon={IconVideo}
                iconBg="bg-primary-50"
                iconColor="text-primary-500"
                href="/baseball/dashboard/videos"
              />
            </>
          )}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Your Stats */}
          <div className="relative glass-standard rounded-2xl overflow-clip">
            <ShineEffect />
            <div className="px-6 py-4 border-b border-warm-100/50">
              <h2 className="font-semibold text-warm-900 tracking-tight">Your Stats</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Height', value: formatHeight(player?.height_feet, player?.height_inches) },
                  { label: 'Weight', value: player?.weight_lbs ? `${player.weight_lbs} lbs` : '—' },
                  { label: player?.pitch_velo ? 'Pitch Velo' : 'Exit Velo', value: `${player?.pitch_velo || player?.exit_velo || '—'}${(player?.pitch_velo || player?.exit_velo) ? ' mph' : ''}` },
                  { label: 'GPA', value: player?.gpa?.toFixed(2) || '—' },
                ].map((stat) => (
                  <div key={stat.label} className="p-4 bg-warm-50/80 rounded-xl border border-warm-100/50 hover:bg-warm-100/80 hover:scale-[1.02] hover:shadow-sm transition-all duration-200">
                    <p className="text-xs text-warm-500 uppercase tracking-wide font-medium">{stat.label}</p>
                    <p className="text-xl font-semibold tracking-tight text-warm-900 mt-1 tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="relative glass-standard rounded-2xl overflow-clip">
            <ShineEffect />
            <div className="px-6 py-4 border-b border-warm-100/50">
              <h2 className="font-semibold text-warm-900 tracking-tight">Quick Actions</h2>
            </div>
            <div className="p-6 space-y-3">
              {[
                { href: '/baseball/dashboard/profile', icon: IconEdit, label: 'Complete your profile', description: 'Add stats, videos, and more' },
                { href: '/baseball/dashboard/colleges', icon: IconUsers, label: 'Browse colleges', description: 'Discover programs that fit you' },
                { href: '/baseball/dashboard/messages', icon: IconMessage, label: 'Check messages', description: 'Stay connected with coaches' },
              ].map((action) => (
                <Link key={action.href} href={action.href}>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-warm-50/80 border border-warm-100/50 hover:bg-warm-100/80 hover:border-warm-200/50 transition-all duration-200 group cursor-pointer">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                      <action.icon size={18} className="text-warm-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-warm-900 group-hover:text-primary-600 transition-colors">{action.label}</p>
                      <p className="text-xs text-warm-500">{action.description}</p>
                    </div>
                    <IconChevronRight size={16} className="text-warm-300 group-hover:text-warm-500 group-hover:tranwarm-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
