'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  IconUsers,
  IconTrendingUp,
  IconMessageSquare,
  IconZap,
  IconRocket,
  IconClock,
  IconArrowRight,
  IconChartBar,
  IconTarget,
  IconTrophy,
} from '@/components/icons';
import { STATUS_COLORS } from '../crm-config';
import type { Coach, CoachStatus, PipelineStage } from '../crm-config';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/skeleton';
import { WeeklyPulse } from './dashboard/WeeklyPulse';

interface CRMDashboardProps {
  allCoaches: Coach[];
  /** True while the initial coach fetch is in flight. Optional — callers that
   * don't pass it keep the previous (immediate) empty-state behavior. */
  loading?: boolean;
  stats: {
    total: number;
    byStatus: Record<CoachStatus, number>;
    byStage: Record<string, number>;
    starred: number;
    hot: number;
    followUpsDue: number;
    contacted: number;
    inPipeline: number;
  };
  pipelineStages: PipelineStage[];
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }>;
  onBulkUpdate: (ids: string[], updates: Partial<Coach>) => Promise<void>;
  onRefresh: () => void;
  onNavigate: (tab: 'today' | 'dashboard' | 'list' | 'outreach', view?: 'table' | 'board' | 'conferences') => void;
  onCoachClick?: (coach: Coach) => void;
}

export function CRMDashboard({
  allCoaches,
  loading = false,
  stats,
  pipelineStages,
  statusConfig: _statusConfig,
  onBulkUpdate,
  onRefresh,
  onNavigate,
  onCoachClick,
}: CRMDashboardProps) {
  const [processing, setProcessing] = useState<string | null>(null);

  // Email performance moved to Outreach → Analytics (it was a duplicate of
  // that surface); the dashboard's email trend now lives in WeeklyPulse.

  const allNewLeads = stats.byStatus.new_lead === stats.total && stats.total > 0;

  // Division breakdown — count every division present in the data, not just D2/D3
  const divisionBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    allCoaches.forEach(c => {
      if (!c.division) return;
      counts[c.division] = (counts[c.division] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
  }, [allCoaches]);

  // Conference breakdown (top 8)
  const conferenceStats = useMemo(() => {
    const counts: Record<string, number> = {};
    allCoaches.forEach(c => {
      if (!c.conference) return;
      counts[c.conference] = (counts[c.conference] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [allCoaches]);

  // Follow-ups due today
  const followUpsDueToday = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return allCoaches.filter(c =>
      c.next_follow_up_at && new Date(c.next_follow_up_at) <= today
    );
  }, [allCoaches]);

  // Stale leads: in pipeline (not new_lead, not closed), no contact in 7+ days
  const staleLeads = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return allCoaches.filter(c => {
      const inPipeline = !['new_lead', 'won', 'lost', 'nurture'].includes(c.status);
      const noRecentContact = !c.last_contacted_at || new Date(c.last_contacted_at) < sevenDaysAgo;
      return inPipeline && noRecentContact;
    });
  }, [allCoaches]);

  // Recently updated coaches
  const recentlyUpdated = useMemo(() => {
    return [...allCoaches]
      .filter(c => c.status !== 'new_lead')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 6);
  }, [allCoaches]);

  // Conversion funnel percentages
  const funnelData = useMemo(() => {
    const total = stats.total || 1;
    const stages = pipelineStages.map(stage => ({
      ...stage,
      count: stats.byStage[stage.id] || 0,
      pct: Math.round(((stats.byStage[stage.id] || 0) / total) * 100),
    }));
    return stages;
  }, [stats, pipelineStages]);

  const handleResearchNext = async (count: number) => {
    setProcessing('research');
    try {
      const newLeads = allCoaches
        .filter(c => c.status === 'new_lead')
        .sort((a, b) => {
          if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.name.localeCompare(b.name);
        })
        .slice(0, count);
      if (newLeads.length === 0) return;
      await onBulkUpdate(newLeads.map(c => c.id), { status: 'contacted' as CoachStatus });
      onRefresh();
    } finally {
      setProcessing(null);
    }
  };

  const handleCoachRowClick = (coach: Coach) => {
    onCoachClick?.(coach);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-[1400px] mx-auto">
      {/* ── Weekly Pulse ── */}
      <WeeklyPulse />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
        <KPICard
          icon={<IconUsers size={20} />}
          iconBg="bg-surface-tint"
          iconColor="text-text-secondary"
          label="Total Coaches"
          value={stats.total}
          detail={divisionBreakdown.slice(0, 2).map(d => `${d.count} ${d.label}`).join(' · ') || 'No divisions yet'}
        />
        <KPICard
          icon={<IconTrendingUp size={20} />}
          iconBg="bg-accent-50"
          iconColor="text-accent-700"
          label="In Pipeline"
          value={stats.inPipeline}
          detail={`${stats.total > 0 ? Math.round((stats.inPipeline / stats.total) * 100) : 0}% of total`}
        />
        <KPICard
          icon={<IconMessageSquare size={20} />}
          iconBg="bg-accent-100"
          iconColor="text-accent-800"
          label="Contacted"
          value={stats.contacted}
          detail={`${stats.total > 0 ? Math.round((stats.contacted / stats.total) * 100) : 0}% contact rate`}
        />
        <KPICard
          icon={<IconTrophy size={20} />}
          iconBg="bg-fw-success-bg"
          iconColor="text-fw-success-ink"
          label="Won"
          value={stats.byStatus.won || 0}
          detail="Closed customers"
        />
        <KPICard
          icon={<IconTarget size={20} />}
          iconBg="bg-fw-warning-bg"
          iconColor="text-fw-warning-ink"
          label="Hot Leads"
          value={stats.hot}
          detail={`${followUpsDueToday.length} follow-ups due`}
          className="hidden xl:block"
        />
      </div>

      {/* ── Getting Started (only when all new leads) ── */}
      {allNewLeads && (
        <div className="glass-standard rounded-2xl p-8 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center mx-auto mb-5">
            <IconRocket size={28} className="text-primary-600" />
          </div>
          <h3 className="text-xl font-bold text-warm-900 mb-2">Ready to start your pipeline</h3>
          <p className="text-sm text-warm-500 max-w-lg mx-auto mb-6 leading-relaxed">
            You have <span className="font-semibold text-warm-700">{stats.total} coaches</span> ready to work.
            Start by contacting your top prospects — prioritize by conference, division, or star your favorites first.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="primary"
              onClick={() => handleResearchNext(10)}
              disabled={processing === 'research'}
              className="w-full sm:w-auto px-5 py-2.5 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-all duration-200 text-sm shadow-sm shadow-primary-500/25 disabled:opacity-50 hover:shadow-md"
            >
              <span className="flex items-center justify-center gap-2">
                <IconArrowRight size={16} />
                Move Top 10 to Pipeline
              </span>
            </Button>
            <Button variant="ghost"
              onClick={() => handleResearchNext(25)}
              disabled={processing === 'research'}
              className="w-full sm:w-auto px-5 py-2.5 bg-cream-100 border border-warm-200 text-warm-700 rounded-xl font-medium hover:bg-warm-50 active:bg-warm-100 transition-all duration-200 text-sm disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                <IconArrowRight size={16} />
                Move Top 25 to Pipeline
              </span>
            </Button>
            <Button variant="ghost"
              onClick={() => onNavigate('list', 'board')}
              className="w-full sm:w-auto px-5 py-2.5 text-warm-500 hover:text-warm-700 rounded-xl font-medium transition-all duration-200 text-sm"
            >
              View All <IconArrowRight size={12} className="inline" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Pipeline Funnel + Conference Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline Funnel — 2 cols */}
        <div className="lg:col-span-2 glass-standard rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center">
                <IconChartBar size={16} className="text-accent-700" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-warm-900">Pipeline Funnel</h3>
                <p className="text-xs text-warm-500">Conversion by stage</p>
              </div>
            </div>
            <Button variant="ghost"
              onClick={() => onNavigate('list', 'board')}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 transition-colors"
            >
              View board <IconArrowRight size={12} />
            </Button>
          </div>
          <div className="space-y-3">
            {funnelData.map((stage) => {
              const maxCount = Math.max(...funnelData.map(s => s.count), 1);
              const widthPct = (stage.count / maxCount) * 100;
              return (
                <div key={stage.id} className="flex items-center gap-2 sm:gap-4 group">
                  <div className="w-20 sm:w-28 flex items-center gap-2 flex-shrink-0 justify-end">
                    <span className="flex-shrink-0">{stage.icon}</span>
                    <p className="text-xs sm:text-sm font-medium text-warm-700 group-hover:text-warm-900 transition-colors truncate">{stage.label}</p>
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-8 rounded-lg bg-warm-50/80 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-lg transition-[width,opacity] duration-700 ease-out flex items-center',
                          `bg-gradient-to-r ${stage.gradient}`,
                          'group-hover:brightness-110',
                          stage.count === 0 && 'opacity-0'
                        )}
                        style={{ width: `${Math.max(widthPct, stage.count > 0 ? 3 : 0)}%` }}
                      >
                        {widthPct > 15 && (
                          <span className="text-white/90 text-xs font-semibold pl-3">{stage.pct}%</span>
                        )}
                      </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-end pr-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {widthPct <= 15 && stage.count > 0 && (
                        <span className="text-label font-semibold text-warm-600 bg-cream-50 rounded px-1.5 py-0.5">{stage.pct}%</span>
                      )}
                    </div>
                  </div>
                  <div className="w-12 text-right flex-shrink-0">
                    <span className="text-sm font-bold text-warm-900 tabular-nums">{stage.count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Conference Breakdown — 1 col */}
        <div className="glass-standard rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-surface-tint flex items-center justify-center">
                <IconTrophy size={16} className="text-text-secondary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-warm-900">Top Conferences</h3>
                <p className="text-xs text-warm-500">{conferenceStats.length} shown</p>
              </div>
            </div>
          </div>
          <div className="space-y-2.5">
            {conferenceStats.map((conf) => {
              const pct = stats.total > 0 ? Math.round((conf.count / stats.total) * 100) : 0;
              return (
                <div key={conf.name} className="flex items-center gap-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-warm-700 truncate group-hover:text-warm-900 transition-colors">
                        {conf.name}
                      </p>
                      <span className="text-xs font-bold text-warm-900 tabular-nums ml-2">{conf.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-warm-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-500 transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Needs attention + Recent Activity ──
          The old Follow-ups Due / Stale Leads panels duplicated the Today
          tab's queues (and Email Performance duplicated Outreach analytics).
          Dashboard now MEASURES; Today/Outreach are where you ACT — this card
          keeps the counts and points there. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-standard rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-fw-warning-bg flex items-center justify-center">
              <IconClock size={16} className="text-fw-warning-ink" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Needs attention</h3>
              <p className="text-xs text-warm-500">Act on these from Today</p>
            </div>
          </div>
          <div className="space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-warm-700">Follow-ups due</span>
              <span className="text-sm font-semibold text-fw-warning-ink tabular-nums">{loading ? '—' : followUpsDueToday.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-warm-700">Stale leads (7d+)</span>
              <span className="text-sm font-semibold text-fw-danger-ink tabular-nums">{loading ? '—' : staleLeads.length}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => onNavigate('today')}
            className="mt-4 w-full justify-center rounded-xl bg-cream-100 hover:bg-cream-200 text-sm font-medium text-warm-900 min-h-[40px]"
          >
            Open Today queue
          </Button>
        </div>

        {/* Recent Activity */}
        <div className="glass-standard rounded-2xl p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <IconZap size={16} className="text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Recent Activity</h3>
              <p className="text-xs text-warm-500">Latest pipeline changes</p>
            </div>
          </div>
          {loading ? (
            <ListSkeleton items={3} />
          ) : recentlyUpdated.length === 0 ? (
            <EmptyState icon={<IconZap size={18} className="text-warm-300" />} title="No activity yet" subtitle="Start working leads to see activity" />
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {recentlyUpdated.map(coach => (
                <CoachRow
                  key={coach.id}
                  coach={coach}
                  onClick={handleCoachRowClick}
                  badge={formatRelative(coach.updated_at)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions + Division Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quick Actions — cleaner callout */}
        {!allNewLeads && (
          <div className="glass-standard rounded-2xl shadow-sm p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <IconZap size={18} className="text-primary-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-warm-900">Quick Actions</h3>
                  <p className="text-xs text-warm-500 mt-0.5">
                    {stats.byStatus.new_lead || 0} new leads remaining
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="primary"
                  onClick={() => handleResearchNext(10)}
                  disabled={processing === 'research' || (stats.byStatus.new_lead || 0) === 0}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm bg-primary-500 text-white hover:bg-primary-600 transition-all duration-200 shadow-sm shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 hover:shadow-md flex-1 sm:flex-initial"
                >
                  <IconArrowRight size={16} /> Move to Pipeline
                </Button>
                <Button variant="ghost"
                  onClick={() => onNavigate('list', 'board')}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cream-100 border border-warm-200 text-warm-700 rounded-xl font-medium hover:bg-warm-50 active:bg-warm-100 transition-all duration-200 text-sm hover:-translate-y-0.5 flex-1 sm:flex-initial"
                >
                  <IconChartBar size={16} /> Open Coaches
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Division Breakdown */}
        <div className={cn(
          'glass-standard rounded-2xl p-5 shadow-sm',
          allNewLeads && 'lg:col-span-2'
        )}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center">
              <IconUsers size={16} className="text-warm-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Division Breakdown</h3>
              <p className="text-xs text-warm-500">By division</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {divisionBreakdown.map((d) => (
              <DivisionCard
                key={d.label}
                label={d.label}
                count={d.count}
                total={stats.total}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function KPICard({
  icon, iconBg, iconColor, label, value, detail, className,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  detail: string;
  className?: string;
}) {
  return (
    <div className={cn(
      'relative overflow-hidden',
      'glass-standard rounded-xl sm:rounded-2xl',
      'shadow-sm',
      'p-3.5 sm:p-5',
      'transition-[transform,box-shadow] duration-200 group',
      'hover:-translate-y-0.5 hover:shadow-lg',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-caption sm:text-xs text-warm-500 uppercase tracking-wider font-semibold">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-warm-900 tabular-nums tracking-tight mt-1">{value}</p>
          <p className="hidden sm:block text-xs text-warm-400 mt-1">{detail}</p>
        </div>
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          'transition-transform duration-200 group-hover:scale-105',
          iconBg, iconColor
        )}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function DivisionCard({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface-tint/60">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-accent-50">
        <span className="text-lg font-bold text-accent-800">
          {label}
        </span>
      </div>
      <div>
        <p className="text-2xl font-bold text-warm-900 tabular-nums">{count}</p>
        <p className="text-xs text-warm-500">{pct}% of total</p>
      </div>
    </div>
  );
}

function CoachRow({
  coach, badge, badgeColor, onClick,
}: {
  coach: Coach;
  badge?: string;
  badgeColor?: string;
  onClick?: (coach: Coach) => void;
}) {
  const statusColor = STATUS_COLORS[coach.status];
  return (
    <Button variant="ghost"
      type="button"
      onClick={() => onClick?.(coach)}
      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-warm-50/50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
      aria-label={`Open ${coach.name} at ${coach.school}`}
    >
      <span className={cn(
        'text-micro font-bold px-1.5 py-0.5 rounded flex-shrink-0',
        'bg-surface-tint text-text-secondary ring-1 ring-border-subtle'
      )}>
        {coach.division}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {statusColor && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusColor.dot)} />}
          <p className="text-sm font-medium text-warm-900 truncate">{coach.name}</p>
        </div>
        <p className="text-label text-warm-400 truncate">{coach.school} · {coach.conference}</p>
      </div>
      {badge && (
        <span className={cn('text-micro font-medium flex-shrink-0 tabular-nums', badgeColor || 'text-warm-500')}>
          {badge}
        </span>
      )}
    </Button>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="py-8 text-center">
      <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
        {icon}
      </div>
      <p className="text-sm font-medium text-warm-500">{title}</p>
      <p className="text-xs text-warm-400 mt-0.5">{subtitle}</p>
    </div>
  );
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
