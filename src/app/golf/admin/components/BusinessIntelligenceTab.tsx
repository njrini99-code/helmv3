'use client';

import { useState, useMemo, ReactNode, Component, ErrorInfo } from 'react';
import type { AdminDashboardData, BIFunnelStep } from '@/app/golf/actions/admin-data';
import { AdminStatCard } from './AdminStatCard';
import { cn } from '@/lib/utils';
import {
  IconHeart,
  IconArrowDown,
  IconTrendingUp,
  IconUsers,
  IconZap,
  IconClock,
  IconChartBar,
  IconActivity,
  IconWarning,
  IconShieldAlert,
  IconTarget,
  IconStar,
  IconLayers,
  IconChevronDown,
  IconChevronUp,
} from '@/components/icons';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
} from 'recharts';

// ============================================================================
// TYPES
// ============================================================================

type BISubTab = 'growth' | 'retention' | 'usage' | 'funnel' | 'health';

interface Props {
  data: AdminDashboardData;
}

const SUB_TABS: { id: BISubTab; label: string; icon: ReactNode }[] = [
  { id: 'growth', label: 'Growth', icon: <IconTrendingUp size={14} /> },
  { id: 'retention', label: 'Retention', icon: <IconActivity size={14} /> },
  { id: 'usage', label: 'Product Usage', icon: <IconLayers size={14} /> },
  { id: 'funnel', label: 'Funnel', icon: <IconTarget size={14} /> },
  { id: 'health', label: 'Health', icon: <IconHeart size={14} /> },
];

const CHART_GREEN = 'var(--color-primary-600)';
const CHART_BLUE = '#3B82F6';
const CHART_AMBER = '#F59E0B';
const CHART_RED = '#EF4444';
const CHART_VIOLET = '#8B5CF6';

/** Safe toFixed that handles non-finite / NaN values */
function safeFixed(val: number | null | undefined, decimals: number): string {
  if (val === null || val === undefined || !isFinite(val)) return '0';
  return Number(val).toFixed(decimals);
}

// ============================================================================
// ERROR BOUNDARY (per-section)
// ============================================================================

interface SectionErrorBoundaryProps {
  children: ReactNode;
  sectionName: string;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`BI Section "${this.props.sectionName}" error:`, error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-2xl p-6 text-center">
          <IconWarning className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700">
            Failed to render {this.props.sectionName}
          </p>
          <p className="text-xs text-red-500 mt-1">
            {this.state.error?.message || 'Unknown error'}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// GLASS CARD WRAPPER
// ============================================================================

function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl p-5 md:p-6',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// SECTION HEADER
// ============================================================================

function BISectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-warm-500 uppercase tracking-wider">{title}</h3>
      {subtitle && <p className="text-xs text-warm-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ============================================================================
// FUNNEL BAR (reusable horizontal bar)
// ============================================================================

function FunnelBars({ steps, maxCount }: { steps: BIFunnelStep[]; maxCount?: number }) {
  const top = maxCount ?? (steps.length > 0 ? steps[0]!.count : 1);

  if (steps.length === 0) {
    return (
      <div className="text-center py-8 text-warm-400 text-sm">No funnel data available</div>
    );
  }

  return (
    <div className="space-y-2.5">
      {steps.map((step, i) => {
        const widthPct = top > 0 ? (step.count / top) * 100 : 0;
        return (
          <div key={step.step} className="flex items-center gap-3">
            <div className="w-20 sm:w-32 md:w-40 text-right flex-shrink-0">
              <p className="text-sm font-medium text-warm-700 truncate">{step.step}</p>
            </div>
            <div className="flex-1 relative">
              <div className="h-7 rounded-lg bg-warm-50 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-lg transition-all duration-700',
                    i === 0
                      ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                      : widthPct >= 50
                        ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                        : widthPct >= 25
                          ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                          : 'bg-gradient-to-r from-red-500 to-red-400'
                  )}
                  style={{ width: `${Math.max(widthPct, 4)}%` }}
                />
              </div>
            </div>
            <div className="w-16 sm:w-24 text-right flex-shrink-0">
              <span className="text-sm font-bold text-warm-900 tabular-nums">{step.count}</span>
              <span className="text-xs text-warm-400 ml-1">({safeFixed(step.pctOfTop, 0)}%)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// CUSTOM TOOLTIP for Recharts
// ============================================================================

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-warm-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl border border-white/10">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-warm-300">{entry.name}:</span>
          <span className="font-semibold">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
        </p>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BusinessIntelligenceTab({ data }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<BISubTab>('growth');

  // Graceful fallback if bi data is undefined (backward compatibility)
  const bi = data.bi;
  if (!bi) {
    return (
      <div className="space-y-6">
        <GlassCard>
          <div className="text-center py-12">
            <IconChartBar className="w-10 h-10 text-warm-300 mx-auto mb-3" />
            <p className="text-warm-500 font-medium">Business Intelligence data is not available yet.</p>
            <p className="text-warm-400 text-sm mt-1">Please refresh the dashboard to load BI metrics.</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <div className="rounded-2xl border border-white/30 bg-white/65 backdrop-blur-[16px] p-5 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-warm-900">Platform Intelligence</h3>
            <p className="mt-1 text-sm text-warm-500">
              {bi.growth.overallActivationRate >= 40 ? 'Platform health is strong' :
               bi.growth.overallActivationRate >= 25 ? 'Platform health needs attention' :
               'Platform health is critical'} &middot; {safeFixed(bi.growth.overallActivationRate, 0)}% activation rate
            </p>
          </div>
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-2xl',
            bi.growth.overallActivationRate >= 40 ? 'bg-primary-50 text-primary-600' :
            bi.growth.overallActivationRate >= 25 ? 'bg-amber-50 text-amber-600' :
            'bg-red-50 text-red-600'
          )}>
            <IconTrendingUp size={20} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-warm-50/60 px-3 py-2.5">
            <p className="text-[11px] font-medium text-warm-400 uppercase tracking-wider">Activation</p>
            <p className="text-lg font-bold text-warm-900 tabular-nums mt-0.5">
              {safeFixed(bi.growth.overallActivationRate, 0)}%
              {bi.growth.userGrowthRateWoW !== 0 && (
                <span className={cn(
                  'ml-1.5 text-xs font-medium',
                  bi.growth.userGrowthRateWoW > 0 ? 'text-primary-600' : 'text-red-600'
                )}>
                  {bi.growth.userGrowthRateWoW > 0 ? '\u2191' : '\u2193'} {safeFixed(Math.abs(bi.growth.userGrowthRateWoW), 1)}%
                </span>
              )}
            </p>
          </div>
          <div className="rounded-xl bg-warm-50/60 px-3 py-2.5">
            <p className="text-[11px] font-medium text-warm-400 uppercase tracking-wider">D7 Retention</p>
            <p className="text-lg font-bold text-warm-900 tabular-nums mt-0.5">{safeFixed(bi.retention.d7.rate, 0)}%</p>
          </div>
          <div className="rounded-xl bg-warm-50/60 px-3 py-2.5">
            <p className="text-[11px] font-medium text-warm-400 uppercase tracking-wider">WAU Stickiness</p>
            <p className="text-lg font-bold text-warm-900 tabular-nums mt-0.5">{safeFixed(bi.retention.stickinessLogins, 0)}%</p>
          </div>
          <div className="rounded-xl bg-warm-50/60 px-3 py-2.5">
            <p className="text-[11px] font-medium text-warm-400 uppercase tracking-wider">At-Risk</p>
            <p className={cn(
              'text-lg font-bold tabular-nums mt-0.5',
              bi.health.atRiskAccounts.length === 0 ? 'text-primary-600' : bi.health.atRiskAccounts.length <= 5 ? 'text-amber-600' : 'text-red-600'
            )}>
              {bi.health.atRiskAccounts.length}
            </p>
          </div>
        </div>
      </div>

      {/* Sub-navigation pills */}
      <div className="sticky top-0 z-10 bg-cream-100/80 backdrop-blur-md py-2">
      <div className="flex items-center gap-1 p-1 bg-white/50 backdrop-blur-sm border border-white/30 rounded-full w-full sm:w-fit overflow-x-auto">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap',
              activeSubTab === tab.id
                ? 'bg-white shadow-sm text-warm-900'
                : 'text-warm-500 hover:text-warm-700'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      </div>

      {/* Section content */}
      <SectionErrorBoundary sectionName={activeSubTab}>
        {activeSubTab === 'growth' && <GrowthSection bi={bi} />}
        {activeSubTab === 'retention' && <RetentionSection bi={bi} />}
        {activeSubTab === 'usage' && <UsageSection bi={bi} />}
        {activeSubTab === 'funnel' && <FunnelSection bi={bi} />}
        {activeSubTab === 'health' && <HealthSection bi={bi} />}
      </SectionErrorBoundary>
    </div>
  );
}

// ============================================================================
// SECTION A: GROWTH
// ============================================================================

function GrowthSection({ bi }: { bi: AdminDashboardData['bi'] }) {
  const g = bi.growth;
  const signupSparkline = g.signupsByWeek.map((w) => w.count);

  return (
    <div className="space-y-6">
      {/* Narrative Callout */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-blue-800">
        {g.userGrowthRateWoW > 0
          ? `Growth is accelerating: +${safeFixed(g.userGrowthRateWoW, 1)}% WoW signup growth. Median time-to-first-value is ${g.medianTTFVDays !== null ? `${g.medianTTFVDays} days` : 'N/A'}.`
          : `Signup growth has slowed. Focus on activation: ${safeFixed(g.overallActivationRate, 0)}% of users are activated.`}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AdminStatCard
          label="Activation Rate"
          value={g.overallActivationRate}
          suffix="%"
          icon={<IconZap size={20} />}
          accentColor={g.overallActivationRate >= 40 ? 'green' : g.overallActivationRate >= 20 ? 'amber' : 'red'}
          detail={`Players ${safeFixed(g.playerActivationRate, 0)}% / Coaches ${safeFixed(g.coachActivationRate, 0)}%`}
          trend={g.userGrowthRateWoW !== 0 ? { value: g.userGrowthRateWoW, label: 'WoW' } : undefined}
        />
        <AdminStatCard
          label="Activated Users"
          value={g.activatedPlayers + g.activatedCoaches}
          icon={<IconUsers size={20} />}
          accentColor="blue"
          detail={`${g.activatedPlayers} players, ${g.activatedCoaches} coaches`}
        />
        <AdminStatCard
          label="Median TTFV"
          value={g.medianTTFVDays !== null ? g.medianTTFVDays : '---'}
          suffix={g.medianTTFVDays !== null ? 'd' : ''}
          icon={<IconClock size={20} />}
          accentColor={g.medianTTFVDays !== null && g.medianTTFVDays <= 3 ? 'green' : 'amber'}
          detail="Time to first value"
        />
        <AdminStatCard
          label="WoW Growth"
          value={g.userGrowthRateWoW}
          suffix="%"
          icon={<IconTrendingUp size={20} />}
          accentColor={g.userGrowthRateWoW > 0 ? 'green' : g.userGrowthRateWoW === 0 ? 'amber' : 'red'}
          trend={g.roundGrowthRateWoW !== 0 ? { value: g.roundGrowthRateWoW, label: 'Rounds WoW' } : undefined}
          sparklineData={signupSparkline.length >= 2 ? signupSparkline : undefined}
        />
      </div>

      {/* Vercel visitors card (if available) */}
      {bi.vercel && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <GlassCard className="text-center">
            <p className="text-xs font-medium text-warm-400 uppercase tracking-wider mb-1">Visitors 24h</p>
            <p className="text-2xl font-bold text-warm-900 tabular-nums">{bi.vercel.visitors24h.toLocaleString()}</p>
          </GlassCard>
          <GlassCard className="text-center">
            <p className="text-xs font-medium text-warm-400 uppercase tracking-wider mb-1">Visitors 7d</p>
            <p className="text-2xl font-bold text-warm-900 tabular-nums">{bi.vercel.visitors7d.toLocaleString()}</p>
          </GlassCard>
          <GlassCard className="text-center">
            <p className="text-xs font-medium text-warm-400 uppercase tracking-wider mb-1">Visitors 30d</p>
            <p className="text-2xl font-bold text-warm-900 tabular-nums">{bi.vercel.visitors30d.toLocaleString()}</p>
          </GlassCard>
        </div>
      )}

      {/* Activation Funnel */}
      <div>
        <BISectionHeader title="Activation Funnel" subtitle="From signup to first value action" />
        <GlassCard className="overflow-x-auto">
          <FunnelBars steps={g.activationFunnel} />
        </GlassCard>
      </div>

      {/* Signup Trend Area Chart */}
      <div>
        <BISectionHeader title="Signup Trend" subtitle="Weekly signups over time" />
        <GlassCard className="overflow-x-auto">
          {g.signupsByWeek.length >= 2 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={g.signupsByWeek} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="signupGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_GREEN} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_GREEN} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={{ stroke: '#d6d3d1' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Signups"
                  stroke={CHART_GREEN}
                  strokeWidth={2}
                  fill="url(#signupGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: CHART_GREEN }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-warm-400 text-sm">Not enough data for chart</div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION B: RETENTION
// ============================================================================

function RetentionSection({ bi }: { bi: AdminDashboardData['bi'] }) {
  const r = bi.retention;

  const retentionBarData = [
    { name: 'D1', rate: r.d1.rate, retained: r.d1.retained, total: r.d1.total },
    { name: 'D7', rate: r.d7.rate, retained: r.d7.retained, total: r.d7.total },
    { name: 'D30', rate: r.d30.rate, retained: r.d30.retained, total: r.d30.total },
  ];

  const dauWauMauData = [
    { name: 'DAU', rounds: r.dauRounds, logins: r.dauLogins },
    { name: 'WAU', rounds: r.wauRounds, logins: r.wauLogins },
    { name: 'MAU', rounds: r.mauRounds, logins: r.mauLogins },
  ];

  return (
    <div className="space-y-6">
      {/* Narrative Callout */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-blue-800">
        D7 retention is {safeFixed(r.d7.rate, 0)}% ({r.d7.rate >= 30 ? 'healthy' : 'needs improvement'}).
        DAU/MAU stickiness: {safeFixed(r.stickinessLogins, 0)}% for logins.
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AdminStatCard
          label="D1 Retention"
          value={r.d1.rate}
          suffix="%"
          icon={<IconActivity size={20} />}
          accentColor={r.d1.rate >= 40 ? 'green' : r.d1.rate >= 20 ? 'amber' : 'red'}
          detail={`${r.d1.retained}/${r.d1.total} users`}
        />
        <AdminStatCard
          label="D7 Retention"
          value={r.d7.rate}
          suffix="%"
          icon={<IconActivity size={20} />}
          accentColor={r.d7.rate >= 25 ? 'green' : r.d7.rate >= 10 ? 'amber' : 'red'}
          detail={`${r.d7.retained}/${r.d7.total} users`}
        />
        <AdminStatCard
          label="D30 Retention"
          value={r.d30.rate}
          suffix="%"
          icon={<IconActivity size={20} />}
          accentColor={r.d30.rate >= 15 ? 'green' : r.d30.rate >= 5 ? 'amber' : 'red'}
          detail={`${r.d30.retained}/${r.d30.total} users`}
        />
        <AdminStatCard
          label="Stickiness"
          value={r.stickinessLogins}
          suffix="%"
          icon={<IconChartBar size={20} />}
          accentColor={r.stickinessLogins >= 20 ? 'green' : 'amber'}
          detail={`DAU/MAU (Rounds: ${r.stickinessRounds}%)`}
        />
      </div>

      {/* Retention + Role Breakdown side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Retention Comparison Bar Chart */}
        <div>
          <BISectionHeader title="Retention Comparison" subtitle="D1 / D7 / D30 retention rates" />
          <GlassCard>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={retentionBarData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#78716c', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: '#d6d3d1' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="rate" name="Retention %" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {retentionBarData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.rate >= 30 ? CHART_GREEN : entry.rate >= 15 ? CHART_AMBER : CHART_RED}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </div>

        {/* DAU/WAU/MAU Breakdown */}
        <div>
          <BISectionHeader title="Active Users" subtitle="DAU / WAU / MAU by activity type" />
          <GlassCard>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dauWauMauData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#78716c', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: '#d6d3d1' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: '#78716c' }}
                />
                <Bar dataKey="rounds" name="Rounds" fill={CHART_GREEN} radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="logins" name="Logins" fill={CHART_BLUE} radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </div>
      </div>

      {/* Role Retention */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <GlassCard className="text-center">
          <p className="text-xs font-medium text-warm-400 uppercase tracking-wider mb-1">Coach Weekly Retention</p>
          <p className={cn(
            'text-[28px] md:text-[32px] font-light tabular-nums tracking-[-0.025em]',
            r.coachWeeklyRetention >= 30 ? 'text-primary-600' : 'text-amber-600'
          )}>
            {r.coachWeeklyRetention}%
          </p>
        </GlassCard>
        <GlassCard className="text-center">
          <p className="text-xs font-medium text-warm-400 uppercase tracking-wider mb-1">Player Weekly Retention</p>
          <p className={cn(
            'text-[28px] md:text-[32px] font-light tabular-nums tracking-[-0.025em]',
            r.playerWeeklyRetention >= 30 ? 'text-primary-600' : 'text-amber-600'
          )}>
            {r.playerWeeklyRetention}%
          </p>
        </GlassCard>
      </div>

      {/* Cohort Retention Heatmap */}
      <div>
        <BISectionHeader title="Cohort Retention Matrix" subtitle="Weekly cohort retention over time" />
        <GlassCard className="overflow-x-auto">
          <CohortHeatmap cohorts={r.cohortMatrix} />
        </GlassCard>
      </div>
    </div>
  );
}

// ============================================================================
// COHORT HEATMAP
// ============================================================================

function CohortHeatmap({
  cohorts,
}: {
  cohorts: { cohortWeek: string; cohortSize: number; retentionByWeek: number[] }[];
}) {
  if (cohorts.length === 0) {
    return <div className="text-center py-8 text-warm-400 text-sm">No cohort data available</div>;
  }

  const maxWeeks = Math.max(...cohorts.map((c) => c.retentionByWeek.length));

  function getCellColor(rate: number): string {
    if (rate >= 60) return 'bg-primary-500 text-white';
    if (rate >= 40) return 'bg-primary-400 text-white';
    if (rate >= 25) return 'bg-primary-300 text-warm-900';
    if (rate >= 15) return 'bg-primary-200 text-warm-900';
    if (rate >= 5) return 'bg-primary-100 text-warm-700';
    return 'bg-warm-50 text-warm-400';
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className="text-left text-warm-500 font-medium px-2 py-1.5 whitespace-nowrap">Cohort</th>
          <th className="text-center text-warm-500 font-medium px-2 py-1.5">Size</th>
          {Array.from({ length: maxWeeks }).map((_, i) => (
            <th key={i} className="text-center text-warm-500 font-medium px-2 py-1.5 whitespace-nowrap">
              W{i}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cohorts.map((cohort) => (
          <tr key={cohort.cohortWeek} className="border-t border-white/20">
            <td className="text-warm-700 font-medium px-2 py-1.5 whitespace-nowrap">{cohort.cohortWeek}</td>
            <td className="text-center text-warm-600 tabular-nums px-2 py-1.5">{cohort.cohortSize}</td>
            {cohort.retentionByWeek.map((rate, i) => (
              <td key={i} className="px-0.5 py-0.5">
                <div
                  className={cn(
                    'rounded px-2 py-1 text-center tabular-nums font-medium',
                    getCellColor(rate)
                  )}
                >
                  {rate}%
                </div>
              </td>
            ))}
            {/* Fill remaining columns */}
            {Array.from({ length: maxWeeks - cohort.retentionByWeek.length }).map((_, i) => (
              <td key={`empty-${i}`} className="px-0.5 py-0.5">
                <div className="rounded px-2 py-1 text-center text-warm-300 bg-warm-50/50">--</div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================================
// SECTION C: PRODUCT USAGE
// ============================================================================

function UsageSection({ bi }: { bi: AdminDashboardData['bi'] }) {
  const u = bi.usage;

  // Sort features by last30d usage descending
  const sortedFeatures = useMemo(
    () => [...u.featureAdoption].sort((a, b) => b.last30d - a.last30d),
    [u.featureAdoption]
  );

  return (
    <div className="space-y-6">
      {/* Narrative Callout */}
      <div className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        u.deadFeatures.length > 0
          ? "border-amber-100 bg-amber-50/50 text-amber-800"
          : "border-blue-100 bg-blue-50/50 text-blue-800"
      )}>
        {u.featureAdoption.length} features tracked. {u.deadFeatures.length > 0
          ? `${u.deadFeatures.length} dead feature${u.deadFeatures.length === 1 ? '' : 's'} detected with zero usage in 30 days.`
          : 'All features showing active usage in the last 30 days.'}
      </div>

      {/* Dead Features Warning */}
      {u.deadFeatures.length > 0 && (
        <div className="bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-2xl p-4 flex items-start gap-3">
          <IconShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Dead Features Detected</p>
            <p className="text-xs text-red-600 mt-0.5">
              The following features had zero usage in the last 30 days:{' '}
              <span className="font-medium">{u.deadFeatures.join(', ')}</span>
            </p>
          </div>
        </div>
      )}

      {/* Feature Adoption Horizontal Bar Chart */}
      <div>
        <BISectionHeader title="Feature Adoption" subtitle="Usage count in the last 30 days (sorted)" />
        <GlassCard>
          {sortedFeatures.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(280, sortedFeatures.length * 36)}>
              <BarChart
                data={sortedFeatures}
                layout="vertical"
                margin={{ top: 5, right: 40, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={{ stroke: '#d6d3d1' }}
                />
                <YAxis
                  type="category"
                  dataKey="feature"
                  tick={{ fontSize: 10, fill: '#57534e' }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="last30d" name="Last 30d" fill={CHART_GREEN} radius={[0, 6, 6, 0]} maxBarSize={24}>
                  {sortedFeatures.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.last30d === 0 ? CHART_RED : CHART_GREEN}
                      opacity={entry.last30d === 0 ? 0.5 : 0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-warm-400 text-sm">No feature adoption data</div>
          )}
        </GlassCard>
      </div>

      {/* Feature-Retention Correlation */}
      <div>
        <BISectionHeader title="Feature-Retention Correlation" subtitle="How each feature impacts user retention" />
        <GlassCard className="overflow-x-auto">
          {u.featureRetentionCorrelation.length > 0 ? (
            <table className="w-full text-sm min-w-[380px]">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left text-warm-500 font-medium py-2 px-3">Feature</th>
                  <th className="text-right text-warm-500 font-medium py-2 px-3">With Feature</th>
                  <th className="text-right text-warm-500 font-medium py-2 px-3">Without</th>
                  <th className="text-right text-warm-500 font-medium py-2 px-3">Lift</th>
                </tr>
              </thead>
              <tbody>
                {[...u.featureRetentionCorrelation]
                  .sort((a, b) => b.lift - a.lift)
                  .map((row) => (
                    <tr key={row.feature} className="border-t border-white/10 hover:bg-white/30 transition-colors">
                      <td className="py-2 px-3 font-medium text-warm-800">{row.feature}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-warm-700">{row.retentionWith}%</td>
                      <td className="py-2 px-3 text-right tabular-nums text-warm-500">{row.retentionWithout}%</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                            row.lift > 0
                              ? 'bg-primary-50 text-primary-700'
                              : row.lift < 0
                                ? 'bg-red-50 text-red-700'
                                : 'bg-warm-100 text-warm-500'
                          )}
                        >
                          {row.lift > 0 ? '+' : ''}{row.lift}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8 text-warm-400 text-sm">No correlation data available</div>
          )}
        </GlassCard>
      </div>

      {/* Object Creation Trend Lines */}
      <div>
        <BISectionHeader title="Content Creation Trends" subtitle="Rounds, events, and messages created per week" />
        <GlassCard>
          {u.objectCreationByWeek.length >= 2 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={u.objectCreationByWeek} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={{ stroke: '#d6d3d1' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: '#78716c' }}
                />
                <Line
                  type="monotone"
                  dataKey="rounds"
                  name="Rounds"
                  stroke={CHART_GREEN}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="events"
                  name="Events"
                  stroke={CHART_BLUE}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="messages"
                  name="Messages"
                  stroke={CHART_VIOLET}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-warm-400 text-sm">Not enough data for chart</div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION D: FUNNEL & FRICTION
// ============================================================================

function FunnelSection({ bi }: { bi: AdminDashboardData['bi'] }) {
  const f = bi.funnel;

  return (
    <div className="space-y-6">
      {/* Narrative Callout */}
      <div className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        (f.biggestPlayerDropoff && f.biggestPlayerDropoff.pct >= 50) || (f.biggestCoachDropoff && f.biggestCoachDropoff.pct >= 50)
          ? "border-amber-100 bg-amber-50/50 text-amber-800"
          : "border-blue-100 bg-blue-50/50 text-blue-800"
      )}>
        {f.biggestPlayerDropoff
          ? `Largest player drop-off: ${f.biggestPlayerDropoff.from} to ${f.biggestPlayerDropoff.to} (${f.biggestPlayerDropoff.pct}% loss).`
          : 'No significant player drop-offs detected.'}
        {f.biggestCoachDropoff
          ? ` Largest coach drop-off: ${f.biggestCoachDropoff.from} to ${f.biggestCoachDropoff.to} (${f.biggestCoachDropoff.pct}% loss).`
          : ''}
      </div>

      {/* Biggest Drop-off Callouts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {f.biggestPlayerDropoff && (
          <DropoffCallout
            title="Biggest Player Drop-off"
            dropoff={f.biggestPlayerDropoff}
            variant="amber"
          />
        )}
        {f.biggestCoachDropoff && (
          <DropoffCallout
            title="Biggest Coach Drop-off"
            dropoff={f.biggestCoachDropoff}
            variant="red"
          />
        )}
      </div>

      {/* Player Onboarding Funnel */}
      <div>
        <BISectionHeader title="Player Onboarding Funnel" subtitle="Step-by-step player journey" />
        <GlassCard>
          <FunnelBars steps={f.playerOnboarding} />
        </GlassCard>
      </div>

      {/* Coach Onboarding Funnel */}
      <div>
        <BISectionHeader title="Coach Onboarding Funnel" subtitle="Step-by-step coach journey" />
        <GlassCard>
          <FunnelBars steps={f.coachOnboarding} />
        </GlassCard>
      </div>

      {/* Error Rates by Feature Area */}
      <div>
        <BISectionHeader title="Errors by Feature Area" subtitle="Error counts and critical errors by area" />
        <GlassCard>
          {f.errorsByFeatureArea.length > 0 ? (
            <div className="space-y-0 divide-y divide-warm-100">
              {(() => {
                const sorted = [...f.errorsByFeatureArea].sort((a, b) => b.count - a.count);
                const maxCount = sorted[0]?.count ?? 1;
                return sorted.map((area) => (
                  <ErrorAreaRow key={area.area} area={area} maxCount={maxCount} />
                ));
              })()}
            </div>
          ) : (
            <div className="text-center py-8 text-warm-400 text-sm">No error data available</div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

// ============================================================================
// DROP-OFF CALLOUT CARD
// ============================================================================

function DropoffCallout({
  title,
  dropoff,
  variant,
}: {
  title: string;
  dropoff: { from: string; to: string; dropoff: number; pct: number };
  variant: 'amber' | 'red';
}) {
  const colors = variant === 'amber'
    ? 'bg-amber-50/80 border-amber-200/60 text-amber-900'
    : 'bg-red-50/80 border-red-200/60 text-red-900';
  const iconColor = variant === 'amber' ? 'text-amber-500' : 'text-red-500';
  const badgeColor = variant === 'amber'
    ? 'bg-amber-100 text-amber-800'
    : 'bg-red-100 text-red-800';

  return (
    <div className={cn('rounded-2xl border p-5 backdrop-blur-sm', colors)}>
      <div className="flex items-start gap-3">
        <IconArrowDown className={cn('w-5 h-5 flex-shrink-0 mt-0.5', iconColor)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs mt-1 opacity-80">
            {dropoff.from} &rarr; {dropoff.to}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold', badgeColor)}>
              -{dropoff.dropoff} users ({dropoff.pct}% drop)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ERROR AREA ROW (expandable)
// ============================================================================

function ErrorAreaRow({ area, maxCount }: { area: { area: string; count: number; critical: number; recentErrors: { message: string; severity: string; created_at: string; url: string }[] }; maxCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const barWidth = maxCount > 0 ? (area.count / maxCount) * 100 : 0;

  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  };

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 py-3 px-1 hover:bg-warm-50/50 transition-colors text-left"
      >
        <span className="text-xs font-medium text-warm-600 w-20 sm:w-[120px] shrink-0 text-right truncate">{area.area}</span>
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-5 bg-warm-50 rounded-full overflow-hidden relative">
            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${barWidth}%` }} />
            {area.critical > 0 && (
              <div className="absolute inset-y-0 left-0 h-full bg-red-400 rounded-full" style={{ width: `${(area.critical / maxCount) * 100}%` }} />
            )}
          </div>
          <span className="text-xs font-semibold text-warm-700 w-8 text-right">{area.count}</span>
          {area.critical > 0 && (
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">{area.critical} crit</span>
          )}
        </div>
        {area.recentErrors.length > 0 && (
          expanded ? <IconChevronUp className="w-3.5 h-3.5 text-warm-400 shrink-0" /> : <IconChevronDown className="w-3.5 h-3.5 text-warm-400 shrink-0" />
        )}
      </button>
      {expanded && area.recentErrors.length > 0 && (
        <div className="ml-8 sm:ml-[132px] mb-3 space-y-1.5">
          {area.recentErrors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-warm-50/80 rounded-lg px-3 py-2">
              <span className={cn(
                'shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full',
                err.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'
              )} />
              <div className="min-w-0 flex-1">
                <p className="text-warm-700 break-words leading-snug">{err.message || 'No message'}</p>
                <div className="flex items-center gap-2 mt-0.5 text-warm-400">
                  <span>{formatTime(err.created_at)}</span>
                  {err.url && <span className="truncate max-w-[200px]">{err.url}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SECTION E: HEALTH & OPPORTUNITY
// ============================================================================

function HealthSection({ bi }: { bi: AdminDashboardData['bi'] }) {
  const h = bi.health;
  const [healthSortField, setHealthSortField] = useState<'score' | 'playerCount' | 'roundsThisMonth'>('score');
  const [healthSortDir, setHealthSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedTeams = useMemo(() => {
    return [...h.teamHealthScores].sort((a, b) => {
      const aVal = a[healthSortField];
      const bVal = b[healthSortField];
      return healthSortDir === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });
  }, [h.teamHealthScores, healthSortField, healthSortDir]);

  const topConversionScore = h.conversionProxies.length > 0
    ? Math.max(...h.conversionProxies.map((c) => c.score))
    : 0;

  function toggleSort(field: typeof healthSortField) {
    if (healthSortField === field) {
      setHealthSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setHealthSortField(field);
      setHealthSortDir('desc');
    }
  }

  function SortIcon({ field }: { field: typeof healthSortField }) {
    if (healthSortField !== field) return null;
    return healthSortDir === 'desc' ? (
      <IconChevronDown size={12} className="inline ml-0.5" />
    ) : (
      <IconChevronUp size={12} className="inline ml-0.5" />
    );
  }

  return (
    <div className="space-y-6">
      {/* Narrative Callout */}
      <div className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        h.atRiskAccounts.length > 5
          ? "border-amber-100 bg-amber-50/50 text-amber-800"
          : "border-primary-100 bg-primary-50/50 text-primary-800"
      )}>
        {h.atRiskAccounts.length} account{h.atRiskAccounts.length === 1 ? '' : 's'} at risk.{' '}
        {h.teamHealthScores.filter(t => t.riskLevel === 'critical').length} team{h.teamHealthScores.filter(t => t.riskLevel === 'critical').length === 1 ? '' : 's'} in critical status.
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <AdminStatCard
          label="Power Users"
          value={h.powerUsers.pct}
          suffix="%"
          icon={<IconStar size={20} />}
          accentColor="violet"
          detail={`${h.powerUsers.count} users`}
        />
        <AdminStatCard
          label="At-Risk Accounts"
          value={h.atRiskAccounts.length}
          icon={<IconWarning size={20} />}
          accentColor={h.atRiskAccounts.length === 0 ? 'green' : h.atRiskAccounts.length <= 5 ? 'amber' : 'red'}
          detail={h.atRiskAccounts.length === 0 ? 'All clear' : 'Needs attention'}
        />
        <AdminStatCard
          label="Top Conversion Score"
          value={topConversionScore}
          suffix="/100"
          icon={<IconTarget size={20} />}
          accentColor={topConversionScore >= 60 ? 'green' : 'amber'}
          detail={`${h.conversionProxies.filter((c) => c.tier === 'high').length} high-tier teams`}
        />
      </div>

      {/* Team Health Scores Table */}
      <div>
        <BISectionHeader title="Team Health Scores" subtitle="Click column headers to sort" />
        <GlassCard className="overflow-x-auto">
          {sortedTeams.length > 0 ? (
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left text-warm-500 font-medium py-3 px-3">Team</th>
                  <th className="hidden md:table-cell text-left text-warm-500 font-medium py-3 px-3">Org</th>
                  <th
                    className="text-right text-warm-500 font-medium py-3 px-3 cursor-pointer hover:text-warm-700 select-none"
                    onClick={() => toggleSort('score')}
                  >
                    <span className="hidden md:inline">Score</span><span className="md:hidden">Scr</span> <SortIcon field="score" />
                  </th>
                  <th className="text-center text-warm-500 font-medium py-3 px-3">
                    <span className="hidden md:inline">Grade</span><span className="md:hidden">Gr</span>
                  </th>
                  <th
                    className="text-right text-warm-500 font-medium py-3 px-3 cursor-pointer hover:text-warm-700 select-none"
                    onClick={() => toggleSort('playerCount')}
                  >
                    <span className="hidden md:inline">Players</span><span className="md:hidden">Plrs</span> <SortIcon field="playerCount" />
                  </th>
                  <th className="hidden lg:table-cell text-right text-warm-500 font-medium py-3 px-3">
                    <span className="hidden md:inline">Active</span><span className="md:hidden">Act%</span>
                  </th>
                  <th
                    className="text-right text-warm-500 font-medium py-3 px-3 cursor-pointer hover:text-warm-700 select-none"
                    onClick={() => toggleSort('roundsThisMonth')}
                  >
                    <span className="hidden md:inline">Rounds/Mo</span><span className="md:hidden">R/Mo</span> <SortIcon field="roundsThisMonth" />
                  </th>
                  <th className="text-center text-warm-500 font-medium py-3 px-3">Risk</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((team) => (
                  <tr key={team.teamId} className="border-t border-white/10 hover:bg-white/30 transition-colors">
                    <td className="py-2 px-3 font-medium text-warm-800">{team.teamName}</td>
                    <td className="hidden md:table-cell py-2 px-3 text-warm-500 text-xs">{team.orgName || '--'}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-warm-900">{team.score}</td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
                          team.grade === 'A' && 'bg-primary-100 text-primary-800',
                          team.grade === 'B' && 'bg-blue-100 text-blue-800',
                          team.grade === 'C' && 'bg-amber-100 text-amber-800',
                          team.grade === 'D' && 'bg-orange-100 text-orange-800',
                          team.grade === 'F' && 'bg-red-100 text-red-800'
                        )}
                      >
                        {team.grade}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-warm-700">{team.playerCount}</td>
                    <td className="hidden lg:table-cell py-2 px-3 text-right tabular-nums text-warm-700">{team.activePlayerCount}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-warm-700">{team.roundsThisMonth}</td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          team.riskLevel === 'healthy' && 'bg-primary-50 text-primary-700',
                          team.riskLevel === 'at_risk' && 'bg-amber-50 text-amber-700',
                          team.riskLevel === 'critical' && 'bg-red-50 text-red-700'
                        )}
                      >
                        {team.riskLevel === 'healthy' ? 'Healthy' : team.riskLevel === 'at_risk' ? 'At Risk' : 'Critical'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8 text-warm-400 text-sm">No team health data available</div>
          )}
        </GlassCard>
      </div>

      {/* At-Risk Accounts */}
      {h.atRiskAccounts.length > 0 && (
        <div>
          <BISectionHeader title="At-Risk Accounts" subtitle="Users and teams showing churn signals" />
          <GlassCard className="overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left text-warm-500 font-medium py-3 px-3">Name</th>
                  <th className="text-left text-warm-500 font-medium py-3 px-3">Type</th>
                  <th className="hidden md:table-cell text-left text-warm-500 font-medium py-3 px-3">Team</th>
                  <th className="text-right text-warm-500 font-medium py-3 px-3">Risk Score</th>
                  <th className="hidden md:table-cell text-right text-warm-500 font-medium py-3 px-3">Days Inactive</th>
                  <th className="hidden md:table-cell text-left text-warm-500 font-medium py-3 px-3">Signals</th>
                </tr>
              </thead>
              <tbody>
                {h.atRiskAccounts.map((acct) => (
                  <tr key={`${acct.type}-${acct.id}`} className="border-t border-white/10 hover:bg-white/30 transition-colors">
                    <td className="py-2 px-3 font-medium text-warm-800">
                      {acct.name}
                      <span className="md:hidden block text-xs text-warm-400 font-normal mt-0.5">
                        {acct.daysSinceLastActive}d inactive
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          acct.type === 'coach' && 'bg-blue-50 text-blue-700',
                          acct.type === 'player' && 'bg-primary-50 text-primary-700',
                          acct.type === 'team' && 'bg-violet-50 text-violet-700'
                        )}
                      >
                        {acct.type}
                      </span>
                    </td>
                    <td className="hidden md:table-cell py-2 px-3 text-warm-500 text-xs">{acct.teamName || '--'}</td>
                    <td className="py-2 px-3 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold',
                          acct.riskScore >= 70 ? 'bg-red-100 text-red-800' : acct.riskScore >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-warm-100 text-warm-700'
                        )}
                      >
                        {acct.riskScore}
                      </span>
                    </td>
                    <td className="hidden md:table-cell py-2 px-3 text-right tabular-nums text-warm-600">{acct.daysSinceLastActive}d</td>
                    <td className="hidden md:table-cell py-2 px-3 max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {acct.riskSignals.slice(0, 3).map((signal, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-warm-100 text-warm-600"
                          >
                            {signal}
                          </span>
                        ))}
                        {acct.riskSignals.length > 3 && (
                          <span className="text-[10px] text-warm-400">+{acct.riskSignals.length - 3} more</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </div>
      )}

      {/* Conversion Proxy Leaderboard */}
      <div>
        <BISectionHeader title="Conversion Proxy Leaderboard" subtitle="Teams ranked by conversion readiness score" />
        <GlassCard className="overflow-x-auto">
          {h.conversionProxies.length > 0 ? (
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="hidden md:table-cell text-left text-warm-500 font-medium py-2 px-3">#</th>
                  <th className="text-left text-warm-500 font-medium py-2 px-3">Team</th>
                  <th className="text-right text-warm-500 font-medium py-2 px-3">Score</th>
                  <th className="text-center text-warm-500 font-medium py-2 px-3">Tier</th>
                  <th className="text-right text-warm-500 font-medium py-2 px-3">Players</th>
                  <th className="hidden md:table-cell text-right text-warm-500 font-medium py-2 px-3">Active %</th>
                  <th className="hidden md:table-cell text-right text-warm-500 font-medium py-2 px-3">Rnds/Wk</th>
                  <th className="hidden md:table-cell text-center text-warm-500 font-medium py-2 px-3">AI</th>
                  <th className="hidden md:table-cell text-right text-warm-500 font-medium py-2 px-3">Tenure</th>
                </tr>
              </thead>
              <tbody>
                {[...h.conversionProxies]
                  .sort((a, b) => b.score - a.score)
                  .map((proxy, i) => (
                    <tr key={proxy.teamId} className="border-t border-white/10 hover:bg-white/30 transition-colors">
                      <td className="hidden md:table-cell py-2 px-3 text-warm-400 tabular-nums text-xs">{i + 1}</td>
                      <td className="py-2 px-3 font-medium text-warm-800">{proxy.teamName}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-warm-900">{proxy.score}</td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            proxy.tier === 'high' && 'bg-primary-50 text-primary-700',
                            proxy.tier === 'medium' && 'bg-amber-50 text-amber-700',
                            proxy.tier === 'low' && 'bg-warm-100 text-warm-600'
                          )}
                        >
                          {proxy.tier}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-warm-700">{proxy.signals.playerCount}</td>
                      <td className="hidden md:table-cell py-2 px-3 text-right tabular-nums text-warm-700">{proxy.signals.activePlayerPct}%</td>
                      <td className="hidden md:table-cell py-2 px-3 text-right tabular-nums text-warm-700">{safeFixed(proxy.signals.roundsPerWeek, 1)}</td>
                      <td className="hidden md:table-cell py-2 px-3 text-center">
                        {proxy.signals.aiAdoption ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">Y</span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-warm-100 text-warm-400 text-xs">N</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell py-2 px-3 text-right tabular-nums text-warm-600 text-xs">{proxy.signals.tenureDays}d</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8 text-warm-400 text-sm">No conversion data available</div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
