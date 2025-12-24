'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/golf/EmptyState';
import { RecentActivityFeed } from '@/components/golf/RecentActivityFeed';
import { PageLoading } from '@/components/ui/loading';
import {
  IconUsers,
  IconCalendar,
  IconFlag,
  IconChartBar,
  IconGolf,
  IconPlus,
  IconArrowRight,
  IconMessage,
  IconBook,
  IconSparkles,
  IconTrendingUp,
  IconTrendingDown,
} from '@/components/icons';
import type { GolfCoach, GolfPlayer, GolfTeam } from '@/lib/types/golf';

// ============================================================================
// TYPES
// ============================================================================

interface DashboardStats {
  rosterSize: number;
  upcomingEvents: number;
  activeQualifiers: number;
  teamScoringAverage: number | null;
  previousAverage?: number | null;
}

interface CoachDashboardData {
  coach: GolfCoach;
  team: GolfTeam | null;
  stats: DashboardStats;
  recentRounds: Array<{
    id: string;
    player_name: string;
    course_name: string;
    total_score: number;
    total_to_par: number;
    round_date: string;
  }>;
  topPlayers: Array<{
    id: string;
    name: string;
    avg_score: number;
    rounds: number;
  }>;
}

interface PlayerDashboardData {
  player: GolfPlayer;
  team: GolfTeam | null;
  stats: {
    roundsPlayed: number;
    scoringAverage: number | null;
    bestRound: number | null;
    handicap: number | null;
    recentTrend?: 'up' | 'down' | 'stable';
  };
  recentRounds: Array<{
    id: string;
    course_name: string;
    total_score: number;
    total_to_par: number;
    round_date: string;
  }>;
}

// ============================================================================
// REUSABLE COMPONENTS
// ============================================================================

function MetricCard({ 
  icon, 
  iconColor,
  label, 
  value, 
  subValue,
  trend,
  href,
  delay = 0 
}: { 
  icon: React.ReactNode; 
  iconColor: string;
  label: string; 
  value: string | number;
  subValue?: string;
  trend?: { value: number; positive: boolean } | null;
  href?: string;
  delay?: number;
}) {
  const content = (
    <div 
      className={cn(
        "group relative bg-white rounded-2xl p-5 transition-all duration-200",
        "border border-slate-200/60 hover:border-slate-300/80",
        "hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
        href && "cursor-pointer"
      )}
      style={{ 
        animationDelay: `${delay}ms`,
        animation: 'fadeInUp 0.5s ease-out forwards',
        opacity: 0,
      }}
    >
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[13px] font-medium text-slate-500 mb-1">{label}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-[28px] font-semibold tracking-tight text-slate-900">{value}</p>
            {trend && (
              <span className={cn(
                'flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full',
                trend.positive 
                  ? 'text-emerald-700 bg-emerald-50' 
                  : 'text-red-600 bg-red-50'
              )}>
                {trend.positive ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
                {Math.abs(trend.value).toFixed(1)}
              </span>
            )}
          </div>
          {subValue && (
            <p className="text-xs text-slate-400 mt-1">{subValue}</p>
          )}
        </div>
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105',
          iconColor
        )}>
          {icon}
        </div>
      </div>

      {href && (
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconArrowRight size={14} className="text-slate-400" />
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function QuickActionCard({ 
  icon, 
  label, 
  description,
  href, 
  variant = 'default',
  delay = 0 
}: { 
  icon: React.ReactNode; 
  label: string;
  description?: string;
  href: string;
  variant?: 'default' | 'primary';
  delay?: number;
}) {
  return (
    <Link href={href}>
      <div 
        className={cn(
          'group relative flex items-center gap-4 p-4 rounded-xl transition-all duration-200',
          variant === 'primary' 
            ? 'bg-slate-900 text-white hover:bg-slate-800' 
            : 'bg-white border border-slate-200/60 hover:border-slate-300 hover:shadow-sm'
        )}
        style={{ 
          animationDelay: `${delay}ms`,
          animation: 'fadeInUp 0.5s ease-out forwards',
          opacity: 0,
        }}
      >
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105',
          variant === 'primary' ? 'bg-white/10' : 'bg-slate-100'
        )}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'font-medium text-[15px]',
            variant === 'primary' ? 'text-white' : 'text-slate-900'
          )}>
            {label}
          </p>
          {description && (
            <p className={cn(
              'text-xs mt-0.5',
              variant === 'primary' ? 'text-white/60' : 'text-slate-500'
            )}>
              {description}
            </p>
          )}
        </div>
        <IconArrowRight 
          size={16} 
          className={cn(
            'flex-shrink-0 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all',
            variant === 'primary' ? 'text-white/60' : 'text-slate-400'
          )} 
        />
      </div>
    </Link>
  );
}

function SectionHeader({ 
  title, 
  action,
  className 
}: { 
  title: string; 
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      <h2 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider">{title}</h2>
      {action && (
        <Link href={action.href}>
          <button className="flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors">
            {action.label}
            <IconArrowRight size={14} />
          </button>
        </Link>
      )}
    </div>
  );
}

function RoundRow({ 
  playerName, 
  courseName, 
  score, 
  toPar, 
  date, 
  showPlayer = true,
  delay = 0 
}: { 
  playerName?: string;
  courseName: string;
  score: number;
  toPar: number;
  date: string;
  showPlayer?: boolean;
  delay?: number;
}) {
  return (
    <div 
      className="group flex items-center gap-4 px-4 py-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
      style={{ 
        animationDelay: `${delay}ms`,
        animation: 'fadeInUp 0.4s ease-out forwards',
        opacity: 0,
      }}
    >
      {/* Score badge */}
      <div className={cn(
        'w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0',
        toPar < 0 ? 'bg-emerald-50' : toPar === 0 ? 'bg-slate-100' : 'bg-amber-50'
      )}>
        <span className={cn(
          'text-lg font-bold',
          toPar < 0 ? 'text-emerald-600' : toPar === 0 ? 'text-slate-700' : 'text-amber-600'
        )}>
          {score}
        </span>
        <span className={cn(
          'text-[10px] font-medium',
          toPar < 0 ? 'text-emerald-500' : toPar === 0 ? 'text-slate-500' : 'text-amber-500'
        )}>
          {toPar > 0 ? '+' : ''}{toPar}
        </span>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        {showPlayer && playerName && (
          <p className="font-medium text-slate-900 truncate">{playerName}</p>
        )}
        <p className={cn(
          'text-slate-500 truncate',
          showPlayer ? 'text-sm' : 'font-medium text-slate-900'
        )}>
          {courseName}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {new Date(date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
          })}
        </p>
      </div>

      {/* Hover indicator */}
      <IconArrowRight 
        size={16} 
        className="flex-shrink-0 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" 
      />
    </div>
  );
}

// ============================================================================
// COACH DASHBOARD
// ============================================================================

function CoachDashboard({ data }: { data: CoachDashboardData }) {
  const { coach, team, stats, recentRounds, topPlayers } = data;
  const greeting = getGreeting();
  const firstName = coach.full_name?.split(' ')[0] || 'Coach';

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {greeting}, {firstName}
              </h1>
              <p className="text-slate-500 mt-0.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {team?.name || 'Golf Team'}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-sm text-slate-500">
                <kbd className="px-1.5 py-0.5 bg-white rounded text-xs font-medium shadow-sm">⌘</kbd>
                <kbd className="px-1.5 py-0.5 bg-white rounded text-xs font-medium shadow-sm">K</kbd>
                <span className="text-slate-400 ml-1">Quick actions</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard 
            icon={<IconUsers size={20} className="text-emerald-600" />}
            iconColor="bg-emerald-50"
            label="Roster Size"
            value={stats.rosterSize}
            subValue="Active players"
            href="/golf/dashboard/roster"
            delay={0}
          />
          <MetricCard 
            icon={<IconCalendar size={20} className="text-blue-600" />}
            iconColor="bg-blue-50"
            label="Upcoming Events"
            value={stats.upcomingEvents}
            subValue="This month"
            href="/golf/dashboard/calendar"
            delay={50}
          />
          <MetricCard 
            icon={<IconFlag size={20} className="text-amber-600" />}
            iconColor="bg-amber-50"
            label="Active Qualifiers"
            value={stats.activeQualifiers}
            href="/golf/dashboard/qualifiers"
            delay={100}
          />
          <MetricCard 
            icon={<IconChartBar size={20} className="text-violet-600" />}
            iconColor="bg-violet-50"
            label="Team Average"
            value={stats.teamScoringAverage ? stats.teamScoringAverage.toFixed(1) : '--'}
            trend={stats.previousAverage && stats.teamScoringAverage 
              ? { value: stats.previousAverage - stats.teamScoringAverage, positive: stats.teamScoringAverage < stats.previousAverage }
              : null}
            href="/golf/dashboard/stats"
            delay={150}
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Quick Actions */}
          <div className="space-y-6">
            <div>
              <SectionHeader title="Quick Actions" />
              <div className="space-y-2">
                <QuickActionCard 
                  icon={<IconPlus size={18} className="text-white" />}
                  label="Add Player"
                  description="Invite to roster"
                  href="/golf/dashboard/roster"
                  variant="primary"
                  delay={200}
                />
                <QuickActionCard 
                  icon={<IconFlag size={18} className="text-slate-600" />}
                  label="Create Qualifier"
                  description="Set up team qualifier"
                  href="/golf/dashboard/qualifiers"
                  delay={250}
                />
                <QuickActionCard 
                  icon={<IconCalendar size={18} className="text-slate-600" />}
                  label="Schedule Event"
                  description="Practice or tournament"
                  href="/golf/dashboard/calendar"
                  delay={300}
                />
                <QuickActionCard 
                  icon={<IconBook size={18} className="text-slate-600" />}
                  label="Post Announcement"
                  description="Team updates"
                  href="/golf/dashboard/announcements"
                  delay={350}
                />
                <QuickActionCard 
                  icon={<IconMessage size={18} className="text-slate-600" />}
                  label="Messages"
                  description="Team communication"
                  href="/golf/dashboard/messages"
                  delay={400}
                />
              </div>
            </div>

            {/* Top Performers */}
            {topPlayers.length > 0 && (
              <div>
                <SectionHeader title="Top Performers" action={{ label: 'View All', href: '/golf/dashboard/stats' }} />
                <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
                  {topPlayers.slice(0, 3).map((player, i) => (
                    <div key={player.id} className={cn(
                      'flex items-center gap-3 px-4 py-3',
                      i !== topPlayers.length - 1 && 'border-b border-slate-100'
                    )}>
                      <div className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                        i === 0 ? 'bg-amber-100 text-amber-700' :
                        i === 1 ? 'bg-slate-100 text-slate-600' :
                        'bg-orange-50 text-orange-600'
                      )}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{player.name}</p>
                        <p className="text-xs text-slate-500">{player.rounds} rounds</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">{player.avg_score.toFixed(1)}</p>
                        <p className="text-xs text-slate-400">avg</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Recent Rounds */}
          <div className="lg:col-span-2">
            <SectionHeader 
              title="Recent Rounds" 
              action={{ label: 'View All', href: '/golf/dashboard/stats' }}
            />
            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
              {recentRounds.length === 0 ? (
                <EmptyState 
                  type="rounds" 
                  compact 
                  description="Players can submit rounds from their dashboard"
                  action={undefined}
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentRounds.map((round, i) => (
                    <RoundRow
                      key={round.id}
                      playerName={round.player_name}
                      courseName={round.course_name}
                      score={round.total_score}
                      toPar={round.total_to_par}
                      date={round.round_date}
                      delay={200 + i * 50}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Activity Feed */}
            {team && (
              <div className="mt-6">
                <SectionHeader title="Recent Activity" />
                <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
                  <RecentActivityFeed teamId={team.id} limit={5} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSS Keyframes */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// PLAYER DASHBOARD
// ============================================================================

function PlayerDashboard({ data }: { data: PlayerDashboardData }) {
  const { player, team, stats, recentRounds } = data;
  const greeting = getGreeting();

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {greeting}, {player.first_name}
              </h1>
              <p className="text-slate-500 mt-0.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {team?.name || 'Golf Team'}
                <span className="text-slate-300">•</span>
                <span className="capitalize">{player.year?.replace('_', ' ') || 'Player'}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard 
            icon={<IconGolf size={20} className="text-emerald-600" />}
            iconColor="bg-emerald-50"
            label="Rounds Played"
            value={stats.roundsPlayed}
            href="/golf/dashboard/rounds"
            delay={0}
          />
          <MetricCard 
            icon={<IconChartBar size={20} className="text-blue-600" />}
            iconColor="bg-blue-50"
            label="Scoring Average"
            value={stats.scoringAverage ? stats.scoringAverage.toFixed(1) : '--'}
            trend={stats.recentTrend === 'up' 
              ? { value: 0.5, positive: false } 
              : stats.recentTrend === 'down' 
              ? { value: 0.5, positive: true } 
              : null}
            href="/golf/dashboard/stats"
            delay={50}
          />
          <MetricCard 
            icon={<IconFlag size={20} className="text-amber-600" />}
            iconColor="bg-amber-50"
            label="Best Round"
            value={stats.bestRound || '--'}
            delay={100}
          />
          <MetricCard 
            icon={<IconSparkles size={20} className="text-violet-600" />}
            iconColor="bg-violet-50"
            label="Handicap"
            value={stats.handicap !== null ? stats.handicap.toFixed(1) : '--'}
            delay={150}
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Quick Actions */}
          <div>
            <SectionHeader title="Quick Actions" />
            <div className="space-y-2">
              <QuickActionCard 
                icon={<IconPlus size={18} className="text-white" />}
                label="Submit Round"
                description="Log your score"
                href="/golf/dashboard/rounds"
                variant="primary"
                delay={200}
              />
              <QuickActionCard 
                icon={<IconChartBar size={18} className="text-slate-600" />}
                label="View My Stats"
                description="Performance analytics"
                href="/golf/dashboard/stats"
                delay={250}
              />
              <QuickActionCard 
                icon={<IconCalendar size={18} className="text-slate-600" />}
                label="View Calendar"
                description="Upcoming events"
                href="/golf/dashboard/calendar"
                delay={300}
              />
              <QuickActionCard 
                icon={<IconMessage size={18} className="text-slate-600" />}
                label="Messages"
                description="Chat with coaches"
                href="/golf/dashboard/messages"
                delay={350}
              />
            </div>
          </div>

          {/* Right Column - Recent Rounds */}
          <div className="lg:col-span-2">
            <SectionHeader 
              title="My Recent Rounds" 
              action={{ label: 'View All', href: '/golf/dashboard/rounds' }}
            />
            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
              {recentRounds.length === 0 ? (
                <EmptyState 
                  type="rounds" 
                  compact
                  action={{ label: 'Submit First Round', href: '/golf/dashboard/rounds' }}
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentRounds.map((round, i) => (
                    <RoundRow
                      key={round.id}
                      courseName={round.course_name}
                      score={round.total_score}
                      toPar={round.total_to_par}
                      date={round.round_date}
                      showPlayer={false}
                      delay={200 + i * 50}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CSS Keyframes */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function GolfDashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'coach' | 'player' | null>(null);
  const [coachData, setCoachData] = useState<CoachDashboardData | null>(null);
  const [playerData, setPlayerData] = useState<PlayerDashboardData | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if coach
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('*, team:golf_teams(*), organization:golf_organizations(*)')
        .eq('user_id', user.id)
        .single();

      if (coach) {
        setUserRole('coach');

        const teamId = coach.team_id;
        let rosterSize = 0;
        let upcomingEvents = 0;
        let activeQualifiers = 0;
        let recentRounds: any[] = [];
        let teamScoringAverage: number | null = null;
        let topPlayers: any[] = [];

        if (teamId) {
          // Get roster size
          const { count: rosterCount } = await supabase
            .from('golf_players')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', teamId);
          rosterSize = rosterCount || 0;

          // Get upcoming events
          const { count: eventsCount } = await supabase
            .from('golf_events')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', teamId)
            .gte('start_date', new Date().toISOString().split('T')[0]);
          upcomingEvents = eventsCount || 0;

          // Get active qualifiers
          const { count: qualifiersCount } = await supabase
            .from('golf_qualifiers')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', teamId)
            .in('status', ['upcoming', 'in_progress']);
          activeQualifiers = qualifiersCount || 0;

          // Get team players
          const { data: players } = await supabase
            .from('golf_players')
            .select('id, first_name, last_name')
            .eq('team_id', teamId);

          if (players && players.length > 0) {
            const playerIds = players.map(p => p.id);
            
            // Get recent rounds
            const { data: rounds } = await supabase
              .from('golf_rounds')
              .select('*, player:golf_players(first_name, last_name)')
              .in('player_id', playerIds)
              .not('total_score', 'is', null)
              .order('round_date', { ascending: false })
              .limit(6);

            recentRounds = (rounds || []).map((r: any) => ({
              id: r.id,
              player_name: `${r.player?.first_name || ''} ${r.player?.last_name || ''}`.trim() || 'Unknown',
              course_name: r.course_name,
              total_score: r.total_score || 0,
              total_to_par: r.total_to_par || 0,
              round_date: r.round_date,
            }));

            // Calculate team average and top players
            const playerStats = await Promise.all(players.map(async (p) => {
              const { data: pRounds } = await supabase
                .from('golf_rounds')
                .select('total_score')
                .eq('player_id', p.id)
                .not('total_score', 'is', null);
              
              const scores = pRounds?.map(r => r.total_score).filter(Boolean) as number[] || [];
              return {
                id: p.id,
                name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                avg_score: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 999,
                rounds: scores.length,
              };
            }));

            // Filter and sort top players
            topPlayers = playerStats
              .filter(p => p.rounds >= 1 && p.avg_score < 999)
              .sort((a, b) => a.avg_score - b.avg_score)
              .slice(0, 5);

            // Calculate team average
            const validPlayers = playerStats.filter(p => p.avg_score < 999);
            if (validPlayers.length > 0) {
              teamScoringAverage = validPlayers.reduce((sum, p) => sum + p.avg_score, 0) / validPlayers.length;
            }
          }
        }

        setCoachData({
          coach: coach as GolfCoach,
          team: coach.team as GolfTeam,
          stats: {
            rosterSize,
            upcomingEvents,
            activeQualifiers,
            teamScoringAverage,
          },
          recentRounds,
          topPlayers,
        });

        setLoading(false);
        return;
      }

      // Check if player
      const { data: player } = await supabase
        .from('golf_players')
        .select('*, team:golf_teams(*)')
        .eq('user_id', user.id)
        .single();

      if (player) {
        setUserRole('player');

        const { data: rounds } = await supabase
          .from('golf_rounds')
          .select('*')
          .eq('player_id', player.id)
          .not('total_score', 'is', null)
          .order('round_date', { ascending: false });

        const playerRounds = rounds || [];
        const roundsPlayed = playerRounds.length;
        const scores = playerRounds.map((r: any) => r.total_score).filter(Boolean) as number[];
        const scoringAverage = scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : null;
        const bestRound = scores.length > 0
          ? Math.min(...scores)
          : null;

        // Calculate recent trend (last 5 vs previous 5)
        let recentTrend: 'up' | 'down' | 'stable' | undefined;
        if (scores.length >= 6) {
          const recent5 = scores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
          const prev5 = scores.slice(5, 10).reduce((a, b) => a + b, 0) / Math.min(5, scores.length - 5);
          if (recent5 < prev5 - 0.5) recentTrend = 'down';
          else if (recent5 > prev5 + 0.5) recentTrend = 'up';
          else recentTrend = 'stable';
        }

        setPlayerData({
          player: player as GolfPlayer,
          team: player.team as GolfTeam,
          stats: {
            roundsPlayed,
            scoringAverage,
            bestRound,
            handicap: player.handicap,
            recentTrend,
          },
          recentRounds: playerRounds.slice(0, 5).map((r: any) => ({
            id: r.id,
            course_name: r.course_name,
            total_score: r.total_score || 0,
            total_to_par: r.total_to_par || 0,
            round_date: r.round_date,
          })),
        });

        setLoading(false);
      }
    }

    loadDashboard();
  }, [supabase]);

  if (loading) {
    return <PageLoading />;
  }

  if (userRole === 'coach' && coachData) {
    return <CoachDashboard data={coachData} />;
  }

  if (userRole === 'player' && playerData) {
    return <PlayerDashboard data={playerData} />;
  }

  return <PageLoading />;
}
