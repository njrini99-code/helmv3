'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  Users,
  TrendingUp,
  MessageSquare,
  Trophy,
  Zap,
  Rocket,
  Clock,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Target,
  Mail,
} from 'lucide-react';
import type { Coach, CoachStatus, PipelineStage } from '../crm-config';

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
  statusConfig,
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

  // Stale leads: in pipeline (not new_lead, not closed), no contact in 14+ days
  const staleLeads = useMemo(() => {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    return allCoaches.filter(c => {
      const inPipeline = !['new_lead', 'closed_won', 'closed_lost', 'not_interested', 'bad_timing'].includes(c.status);
      const noRecentContact = !c.last_contacted_at || new Date(c.last_contacted_at) < fourteenDaysAgo;
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
      await onBulkUpdate(newLeads.map(c => c.id), { status: 'researching' as CoachStatus });
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
          icon={<Users size={20} />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Total Coaches"
          value={stats.total}
          detail={`${divisionStats.d2} D2 · ${divisionStats.d3} D3`}
        />
        <KPICard
          icon={<TrendingUp size={20} />}
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
          label="In Pipeline"
          value={stats.inPipeline}
          detail={`${stats.total > 0 ? Math.round((stats.inPipeline / stats.total) * 100) : 0}% of total`}
        />
        <KPICard
          icon={<MessageSquare size={20} />}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          label="Contacted"
          value={stats.contacted}
          detail={`${stats.total > 0 ? Math.round((stats.contacted / stats.total) * 100) : 0}% contact rate`}
        />
        <KPICard
          icon={<Trophy size={20} />}
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
          label="Won"
          value={stats.byStatus.closed_won || 0}
          detail="Closed customers"
          accent
        />
        <KPICard
          icon={<Target size={20} />}
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          label="Hot Leads"
          value={stats.hot}
          detail={`${stats.followUpsDue} follow-ups due`}
          className="hidden xl:block"
        />
      </div>

      {/* ── Getting Started (only when all new leads) ── */}
      {allNewLeads && (
        <div className="glass-standard rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center mx-auto mb-5">
            <Rocket size={28} className="text-primary-600" />
          </div>
          <h3 className="text-xl font-bold text-warm-900 mb-2">Ready to start your pipeline</h3>
          <p className="text-sm text-warm-500 max-w-lg mx-auto mb-6 leading-relaxed">
            You have <span className="font-semibold text-warm-700">{stats.total} coaches</span> ready to work.
            Start by researching your top prospects — prioritize by conference, division, or star your favorites first.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => handleResearchNext(10)}
              disabled={processing === 'research'}
              className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-[background-color,box-shadow] text-sm shadow-sm shadow-primary-500/25 disabled:opacity-50 hover:shadow-md"
            >
              <span className="flex items-center gap-2">
                <Zap size={16} />
                Research Top 10
              </span>
            </button>
            <button
              onClick={() => handleResearchNext(25)}
              disabled={processing === 'research'}
              className="px-5 py-2.5 bg-white border border-warm-200/50 text-warm-700 rounded-xl font-medium hover:bg-warm-50 active:bg-warm-100 transition-colors text-sm disabled:opacity-50"
            >
              Research Top 25
            </button>
            <button
              onClick={() => onNavigate('list')}
              className="px-5 py-2.5 text-warm-500 hover:text-warm-700 rounded-xl font-medium transition-colors text-sm"
            >
              View All →
            </button>
          </div>
        </div>
      )}

      {/* ── Pipeline Funnel + Conference Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline Funnel — 2 cols */}
        <div className="lg:col-span-2 glass-standard rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-warm-400" />
              <h3 className="text-sm font-semibold text-warm-500 uppercase tracking-wider">Pipeline Funnel</h3>
            </div>
            <button
              onClick={() => onNavigate('pipeline')}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 transition-colors"
            >
              View Pipeline <ArrowRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {funnelData.map((stage) => {
              const maxCount = Math.max(...funnelData.map(s => s.count), 1);
              const widthPct = (stage.count / maxCount) * 100;
              return (
                <div key={stage.id} className="flex items-center gap-4 group">
                  <div className="w-24 text-right flex-shrink-0">
                    <p className="text-sm font-medium text-warm-700 group-hover:text-warm-900 transition-colors">{stage.label}</p>
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-9 rounded-lg bg-warm-50/80 overflow-hidden">
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
                    {/* Hover tooltip showing exact numbers */}
                    <div className="absolute inset-0 flex items-center justify-end pr-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {widthPct <= 15 && stage.count > 0 && (
                        <span className="text-label font-semibold text-warm-600 bg-white/80 rounded px-1.5 py-0.5">{stage.pct}%</span>
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
        <div className="glass-standard rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-warm-500 uppercase tracking-wider">Top Conferences</h3>
            <span className="text-xs text-warm-400">{conferenceStats.length} shown</span>
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
        <div className="glass-standard rounded-2xl p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock size={16} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Follow-ups Due</h3>
              <p className="text-xs text-warm-500">{followUpsDueToday.length} coaches need attention</p>
            </div>
          </div>
          {followUpsDueToday.length === 0 ? (
            <EmptyState icon={<Clock size={18} className="text-warm-300" />} title="No follow-ups due" subtitle="Schedule follow-ups from coach detail" />
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {followUpsDueToday.slice(0, 8).map(coach => (
                <CoachRow
                  key={coach.id}
                  coach={coach}
                  statusConfig={statusConfig}
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
        <div className="glass-standard rounded-2xl p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Stale Leads</h3>
              <p className="text-xs text-warm-500">{staleLeads.length} no contact 14+ days</p>
            </div>
          </div>
          {staleLeads.length === 0 ? (
            <EmptyState icon={<AlertTriangle size={18} className="text-warm-300" />} title="No stale leads" subtitle="All pipeline leads are actively worked" />
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {staleLeads.slice(0, 8).map(coach => (
                <CoachRow
                  key={coach.id}
                  coach={coach}
                  statusConfig={statusConfig}
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
        <div className="glass-standard rounded-2xl p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-primary-50 flex items-center justify-center">
              <Zap size={16} className="text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-warm-900">Recent Activity</h3>
              <p className="text-xs text-warm-500">Latest pipeline changes</p>
            </div>
          </div>
          {recentlyUpdated.length === 0 ? (
            <EmptyState icon={<Zap size={18} className="text-warm-300" />} title="No activity yet" subtitle="Start working leads to see activity" />
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {recentlyUpdated.map(coach => (
                <CoachRow
                  key={coach.id}
                  coach={coach}
                  statusConfig={statusConfig}
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
        <div className="glass-standard rounded-2xl p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <Mail size={16} className="text-blue-600" />
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
              color="text-emerald-600"
              bgColor="bg-emerald-50/50"
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
          <div className="bg-white/70 backdrop-blur-xl border border-primary-100/40 rounded-2xl shadow-glass p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <Zap size={18} className="text-primary-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-warm-900">Quick Actions</h3>
                  <p className="text-xs text-warm-500 mt-0.5">
                    {stats.byStatus.new_lead || 0} new leads remaining
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleResearchNext(10)}
                  disabled={processing === 'research' || (stats.byStatus.new_lead || 0) === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm bg-primary-600 text-white hover:bg-primary-700 transition-[background-color,transform,box-shadow] shadow-sm shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Zap size={16} /> Research Next 10
                </button>
                <button
                  onClick={() => onNavigate('pipeline')}
                  className="px-4 py-2.5 bg-white border border-warm-200/50 text-warm-700 rounded-xl font-medium hover:bg-warm-50 active:bg-warm-100 transition-[background-color,transform] text-sm hover:-translate-y-0.5"
                >
                  Open Pipeline
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Division Breakdown */}
        <div className={cn(
          'glass-standard rounded-2xl p-5',
          allNewLeads && 'lg:col-span-2'
        )}>
          <h3 className="text-sm font-semibold text-warm-500 uppercase tracking-wider mb-4">Division Breakdown</h3>
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
  icon, iconBg, iconColor, label, value, detail, accent, className,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  detail: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(
      'relative overflow-hidden',
      'bg-white/70 backdrop-blur-xl',
      'border rounded-2xl',
      'shadow-glass',
      'p-4 lg:p-5',
      'transition-[transform,box-shadow] duration-200 group',
      'hover:-translate-y-0.5 hover:shadow-lg',
      accent ? 'border-l-[3px] border-l-primary-500 border-t-white/20 border-r-white/20 border-b-white/20' : 'border-white/20',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-label font-semibold text-warm-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-warm-900 tabular-nums tracking-tight mt-1">{value}</p>
          <p className="text-xs text-warm-400 mt-1">{detail}</p>
        </div>
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
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
  statusConfig?: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }>;
  badge?: string;
  badgeColor?: string;
  onClick?: (coach: Coach) => void;
}) {
  return (
    <div
      onClick={() => onClick?.(coach)}
      className="flex items-center gap-3 p-2 rounded-xl hover:bg-warm-50/50 transition-colors cursor-pointer"
    >
      <span className={cn(
        'text-micro font-bold px-1.5 py-0.5 rounded flex-shrink-0',
        coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700'
      )}>
        {coach.division}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-warm-900 truncate">{coach.name}</p>
        <p className="text-label text-warm-400 truncate">{coach.school} · {coach.conference}</p>
      </div>
      {badge && (
        <span className={cn('text-micro font-medium flex-shrink-0 tabular-nums', badgeColor || 'text-warm-500')}>
          {badge}
        </span>
      )}
    </div>
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
