'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  IconUsers,
  IconTrendingUp,
  IconMessageSquare,
  IconZap,
  IconRocket,
  IconClock,
  IconWarning,
  IconArrowRight,
  IconChartBar,
  IconTarget,
  IconMail,
  IconTrophy,
} from '@/components/icons';
import { STATUS_COLORS } from '../crm-config';
import type { Coach, CoachStatus, PipelineStage } from '../crm-config';
import { Button } from '@/components/ui/button';

interface CRMDashboardProps {
  allCoaches: Coach[];
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
  onNavigate: (tab: 'dashboard' | 'list' | 'pipeline') => void;
  onCoachClick?: (coach: Coach) => void;
}

export function CRMDashboard({
  allCoaches,
  stats,
  pipelineStages,
  statusConfig: _statusConfig,
  onBulkUpdate,
  onRefresh,
  onNavigate,
  onCoachClick,
}: CRMDashboardProps) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [emailStats, setEmailStats] = useState<{
    total_sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
  } | null>(null);

  // Fetch email performance stats
  useEffect(() => {
    async function fetchEmailStats() {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_crm_email_stats');
      if (!error && data) {
        setEmailStats(data as { total_sent: number; delivered: number; opened: number; clicked: number; bounced: number });
      }
    }
    fetchEmailStats();
  }, []);

  const allNewLeads = stats.byStatus.new_lead === stats.total && stats.total > 0;

  // Division breakdown
  const divisionStats = useMemo(() => {
    const d2 = allCoaches.filter(c => c.division === 'D2').length;
    const d3 = allCoaches.filter(c => c.division === 'D3').length;
    return { d2, d3 };
  }, [allCoaches]);

  // Conference breakdown (top 8)
  const conferenceStats = useMemo(() => {
    const counts: Record<string, number> = {};
    allCoaches.forEach(c => {
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
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <KPICard
          icon={<IconUsers size={20} />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Total Coaches"
          value={stats.total}
          detail={`${divisionStats.d2} D2 · ${divisionStats.d3} D3`}
        />
        <KPICard
          icon={<IconTrendingUp size={20} />}
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
          label="In Pipeline"
          value={stats.inPipeline}
          detail={`${stats.total > 0 ? Math.round((stats.inPipeline / stats.total) * 100) : 0}% of total`}
        />
        <KPICard
          icon={<IconMessageSquare size={20} />}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          label="Contacted"
          value={stats.contacted}
          detail={`${stats.total > 0 ? Math.round((stats.contacted / stats.total) * 100) : 0}% contact rate`}
        />
        <KPICard
          icon={<IconTrophy size={20} />}
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
          label="Won"
          value={stats.byStatus.won || 0}
          detail="Closed customers"
        />
        <KPICard
          icon={<IconTarget size={20} />}
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          label="Hot Leads"
          value={stats.hot}
          detail={`${stats.followUpsDue} follow-ups due`}
          className="hidden xl:block"
        />
      </div>

      {/* ── Today's Focus ── */}
      <div className="glass-standard rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
            <IconTarget size={16} className="text-primary-600" />
          </div>
          <h3 className="text-sm font-semibold text-warm-900">Today&apos;s Focus</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-100/50">
            <IconClock size={16} className="text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold tabular-nums text-warm-900">{followUpsDueToday.length}</p>
              <p className="text-xs text-warm-500">Follow-ups due today</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50/60 border border-red-100/50">
            <IconWarning size={16} className="text-red-600 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold tabular-nums text-warm-900">{staleLeads.length}</p>
              <p className="text-xs text-warm-500">Stale leads (no contact 7+ days)</p>
            </div>
          </div>
        </div>
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
              onClick={() => onNavigate('list')}
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
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <IconChartBar size={16} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-warm-900">Pipeline Funnel</h3>
                <p className="text-xs text-warm-500">Conversion by stage</p>
              </div>
            </div>
            <Button variant="ghost"
              onClick={() => onNavigate('pipeline')}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 transition-colors"
            >
              View Pipeline <IconArrowRight size={12} />
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
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <IconTrophy size={16} className="text-violet-600" />
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

      {/* ── Three-column: Follow-ups + Stale Leads + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's Follow-ups */}
        <div className="glass-standard rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <IconClock size={16} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Follow-ups Due</h3>
              <p className="text-xs text-warm-500">{followUpsDueToday.length} coaches need attention</p>
            </div>
          </div>
          {followUpsDueToday.length === 0 ? (
            <EmptyState icon={<IconClock size={18} className="text-warm-300" />} title="No follow-ups due" subtitle="Schedule follow-ups from coach detail" />
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {followUpsDueToday.slice(0, 8).map(coach => (
                <CoachRow
                  key={coach.id}
                  coach={coach}
                  onClick={handleCoachRowClick}
                  badge={
                    coach.next_follow_up_at
                      ? formatRelative(coach.next_follow_up_at)
                      : undefined
                  }
                  badgeColor="text-amber-600"
                />
              ))}
              {followUpsDueToday.length > 8 && (
                <p className="text-xs text-warm-400 text-center pt-2">+{followUpsDueToday.length - 8} more</p>
              )}
            </div>
          )}
        </div>

        {/* Stale Leads */}
        <div className="glass-standard rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <IconWarning size={16} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Stale Leads</h3>
              <p className="text-xs text-warm-500">{staleLeads.length} no contact 7+ days</p>
            </div>
          </div>
          {staleLeads.length === 0 ? (
            <EmptyState icon={<IconWarning size={18} className="text-warm-300" />} title="No stale leads" subtitle="All pipeline leads are actively worked" />
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {staleLeads.slice(0, 8).map(coach => (
                <CoachRow
                  key={coach.id}
                  coach={coach}
                  onClick={handleCoachRowClick}
                  badge={
                    coach.last_contacted_at
                      ? `${Math.floor((Date.now() - new Date(coach.last_contacted_at).getTime()) / 86400000)}d ago`
                      : 'Never'
                  }
                  badgeColor="text-red-600"
                />
              ))}
              {staleLeads.length > 8 && (
                <p className="text-xs text-warm-400 text-center pt-2">+{staleLeads.length - 8} more</p>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass-standard rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <IconZap size={16} className="text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Recent Activity</h3>
              <p className="text-xs text-warm-500">Latest pipeline changes</p>
            </div>
          </div>
          {recentlyUpdated.length === 0 ? (
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

      {/* ── Email Performance ── */}
      {emailStats && emailStats.total_sent > 0 && (
        <div className="glass-standard rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <IconMail size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Email Performance</h3>
              <p className="text-xs text-warm-500">{emailStats.total_sent} emails tracked</p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <EmailStatBox
              label="Delivery Rate"
              value={emailStats.total_sent > 0 ? Math.round((emailStats.delivered / emailStats.total_sent) * 100) : 0}
              color="text-primary-600"
              bgColor="bg-primary-50/50"
            />
            <EmailStatBox
              label="Open Rate"
              value={emailStats.total_sent > 0 ? Math.round((emailStats.opened / emailStats.total_sent) * 100) : 0}
              color="text-blue-600"
              bgColor="bg-blue-50/50"
            />
            <EmailStatBox
              label="Click Rate"
              value={emailStats.total_sent > 0 ? Math.round((emailStats.clicked / emailStats.total_sent) * 100) : 0}
              color="text-violet-600"
              bgColor="bg-violet-50/50"
            />
            <EmailStatBox
              label="Bounce Rate"
              value={emailStats.total_sent > 0 ? Math.round((emailStats.bounced / emailStats.total_sent) * 100) : 0}
              color="text-red-600"
              bgColor="bg-red-50/50"
            />
          </div>
        </div>
      )}

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
                  onClick={() => onNavigate('pipeline')}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cream-100 border border-warm-200 text-warm-700 rounded-xl font-medium hover:bg-warm-50 active:bg-warm-100 transition-all duration-200 text-sm hover:-translate-y-0.5 flex-1 sm:flex-initial"
                >
                  <IconChartBar size={16} /> Open Pipeline
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
              <p className="text-xs text-warm-500">D2 vs D3 distribution</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DivisionCard label="D2" count={divisionStats.d2} total={stats.total} color="blue" />
            <DivisionCard label="D3" count={divisionStats.d3} total={stats.total} color="primary" />
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
      'glass-standard rounded-2xl',
      'shadow-sm',
      'p-5',
      'transition-[transform,box-shadow] duration-200 group',
      'hover:-translate-y-0.5 hover:shadow-lg',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-warm-500 uppercase tracking-wider font-semibold">{label}</p>
          <p className="text-2xl font-bold text-warm-900 tabular-nums tracking-tight mt-1">{value}</p>
          <p className="text-xs text-warm-400 mt-1">{detail}</p>
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

function DivisionCard({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-xl border',
      color === 'blue' ? 'bg-blue-50/50 border-blue-200/30' : 'bg-primary-50/50 border-primary-200/30'
    )}>
      <div className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center',
        color === 'blue' ? 'bg-blue-100' : 'bg-primary-100'
      )}>
        <span className={cn('text-lg font-bold', color === 'blue' ? 'text-blue-700' : 'text-primary-700')}>
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
        coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700'
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

function EmailStatBox({ label, value, color, bgColor }: { label: string; value: number; color: string; bgColor: string }) {
  return (
    <div className={cn('p-3 rounded-xl border border-warm-100/50', bgColor)}>
      <p className="text-2xl font-bold tabular-nums text-warm-900">{value}%</p>
      <p className={cn('text-xs font-medium mt-0.5', color)}>{label}</p>
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
