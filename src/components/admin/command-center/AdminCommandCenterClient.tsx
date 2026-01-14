'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminCommandCenterMetrics } from './types';

const PIPELINE_LABELS: Record<string, string> = {
  watchlist: 'Watchlist',
  high_priority: 'Priority',
  contacted: 'Contacted',
  campus_visit: 'Visit',
  offer_extended: 'Offer',
  committed: 'Committed',
  uninterested: 'Uninterested',
};

const PIPELINE_TONES: Record<string, string> = {
  watchlist: 'from-slate-400 to-slate-500',
  high_priority: 'from-amber-400 to-amber-500',
  contacted: 'from-cyan-400 to-cyan-500',
  campus_visit: 'from-emerald-400 to-emerald-500',
  offer_extended: 'from-green-400 to-green-500',
  committed: 'from-emerald-500 to-emerald-600',
  uninterested: 'from-rose-400 to-rose-500',
};

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullNumber = new Intl.NumberFormat('en-US');

function formatValue(value: number | null, suffix = '') {
  if (value === null) return '-';
  return `${compactNumber.format(value)}${suffix}`;
}

function formatFull(value: number | null, suffix = '') {
  if (value === null) return '-';
  return `${fullNumber.format(value)}${suffix}`;
}

export function AdminCommandCenterClient({
  metrics,
  adminEmail,
}: {
  metrics: AdminCommandCenterMetrics;
  adminEmail?: string | null;
}) {
  const stickiness =
    metrics.activity.activeSenders30d > 0
      ? metrics.activity.activeSenders7d / metrics.activity.activeSenders30d
      : 0;
  const updatedAtLabel = metrics.updatedAt
    ? new Date(metrics.updatedAt).toLocaleString()
    : 'Unknown';

  const funnelSteps = [
    {
      label: 'Signups (30d)',
      value: metrics.totals.newUsers30d,
      note: 'Users created in last 30 days',
    },
    {
      label: 'Profiles Started',
      value:
        metrics.onboarding.baseball.playersTotal +
        metrics.onboarding.baseball.coachesTotal +
        metrics.onboarding.golf.playersTotal +
        metrics.onboarding.golf.coachesTotal,
      note: 'Profiles with onboarding started',
    },
    {
      label: 'Profiles Completed',
      value:
        metrics.onboarding.baseball.playersCompleted +
        metrics.onboarding.baseball.coachesCompleted +
        metrics.onboarding.golf.playersCompleted +
        metrics.onboarding.golf.coachesCompleted,
      note: 'Onboarding completed',
    },
    {
      label: 'Player Profiles Complete',
      value:
        metrics.onboarding.baseball.playersProfileComplete +
        metrics.onboarding.golf.playersProfileComplete,
      note: 'Profile completion signals',
    },
    {
      label: 'First Value (Tracked)',
      value: null,
      note: 'Needs event instrumentation',
    },
  ];

  const pipelineTotal = Object.values(metrics.baseball.watchlistStages).reduce(
    (sum, value) => sum + value,
    0
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <div className="min-h-screen bg-cream-gradient">
      {/* Header */}
      <div
        className={cn(
          'sticky top-0 z-20',
          'bg-white/60 backdrop-blur-[24px]',
          'border-b border-white/30',
          'shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
        )}
      >
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400 mb-1">
                Executive Command Center
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Helm Command Center
              </h1>
              <p className="text-slate-500 mt-0.5 text-sm max-w-xl">
                Real-time operating metrics across recruiting, golf operations, and platform health.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusChip
                label={metrics.status.connected ? 'Data: Connected' : 'Data: Limited'}
                tone={metrics.status.connected ? 'emerald' : 'amber'}
              />
              <StatusChip
                label={`Updated ${updatedAtLabel}`}
                tone="slate"
              />
              {adminEmail ? <StatusChip label={adminEmail} tone="primary" /> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <motion.div
        className="max-w-7xl mx-auto px-6 py-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Stats Grid */}
        <motion.section variants={itemVariants} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            label="Active Users (7d)"
            value={metrics.activity.activeSenders7d}
            note="Message senders last 7 days"
            tone="primary"
          />
          <StatCard
            icon={BarChart3}
            label="New Signups (30d)"
            value={metrics.totals.newUsers30d}
            note="Users created last 30 days"
            tone="cyan"
          />
          <StatCard
            icon={Activity}
            label="Messages (7d)"
            value={metrics.activity.messages7d}
            note="Total messages sent"
            tone="slate"
          />
          <StatCard
            icon={ShieldCheck}
            label="Auth Risk (7d)"
            value={metrics.auth.failedLogins7d}
            note={`${metrics.auth.lockedAccounts} locked accounts`}
            tone="amber"
          />
        </motion.section>

        <Section
          title="User Journey & Conversion"
          subtitle="Where new users drop off and who finds value."
        >
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <GlassCard>
              <div className="space-y-5">
                {funnelSteps.map((step) => (
                  <FunnelStep
                    key={step.label}
                    label={step.label}
                    value={step.value}
                    note={step.note}
                    maxValue={funnelSteps[0]?.value ?? 0}
                  />
                ))}
              </div>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Conversion Notes</h3>
              <p className="text-sm text-slate-500 mb-4">
                Track onboarding step abandonment, profile completion, and the first
                meaningful action for each role. Add instrumentation for &quot;first value&quot;
                events to lock in conversion rates.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniStat label="Baseball Players" value={metrics.onboarding.baseball.playersCompleted} />
                <MiniStat label="Golf Players" value={metrics.onboarding.golf.playersCompleted} />
                <MiniStat label="Baseball Coaches" value={metrics.onboarding.baseball.coachesCompleted} />
                <MiniStat label="Golf Coaches" value={metrics.onboarding.golf.coachesCompleted} />
              </div>
            </GlassCard>
          </div>
        </Section>

        <Section
          title="Engagement Depth"
          subtitle="Stickiness, habitual usage, and feature pull."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <EngagementCard
              title="Weekly / Monthly Stickiness"
              value={`${Math.round(stickiness * 100)}%`}
              subtitle="WAU / MAU proxy from messages"
              trend={`${formatFull(metrics.activity.activeSenders7d)}/${formatFull(metrics.activity.activeSenders30d)} active`}
            />
            <EngagementCard
              title="Baseball Activity (7d)"
              value={formatFull(metrics.activity.baseballActive7d)}
              subtitle="Message senders tagged baseball"
              trend="Tie to discover + pipeline events"
            />
            <EngagementCard
              title="Golf Activity (7d)"
              value={formatFull(metrics.activity.golfActive7d)}
              subtitle="Message senders tagged golf"
              trend="Add rounds + calendar signals"
            />
          </div>
        </Section>

        <Section
          title="Sport Operations"
          subtitle="Feature usage and operational health by sport."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <SportCard
              title="Baseball Recruiting"
              accent="emerald"
              stats={[
                { label: 'Recruiting Active', value: metrics.baseball.recruitingActivePlayers },
                { label: 'Videos (30d)', value: metrics.baseball.videos30d },
                { label: 'Engagement (30d)', value: metrics.baseball.engagementEvents30d },
              ]}
            >
              <div className="space-y-3 mt-4">
                <div className="text-xs uppercase tracking-widest text-slate-400">
                  Pipeline Motion
                </div>
                <div className="space-y-2">
                  {Object.entries(metrics.baseball.watchlistStages).map(([stage, count]) => (
                    <PipelineBar
                      key={stage}
                      label={PIPELINE_LABELS[stage] || stage}
                      count={count}
                      total={pipelineTotal}
                      tone={PIPELINE_TONES[stage] || 'from-slate-400 to-slate-500'}
                    />
                  ))}
                </div>
              </div>
            </SportCard>

            <SportCard
              title="Golf Team Ops"
              accent="cyan"
              stats={[
                { label: 'Rounds (30d)', value: metrics.golf.rounds30d },
                { label: 'Events (30d)', value: metrics.golf.events30d },
                { label: 'Active Players', value: metrics.golf.activePlayers30d },
              ]}
            >
              <div className="space-y-3 mt-4">
                <div className="text-xs uppercase tracking-widest text-slate-400">
                  Adoption Signals
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniStat label="Profiles Complete" value={metrics.onboarding.golf.playersProfileComplete} />
                  <MiniStat label="Coaches Complete" value={metrics.onboarding.golf.coachesCompleted} />
                  <MiniStat label="Teams Onboarded" value={metrics.onboarding.golf.coachesTotal} />
                  <MiniStat label="Players Total" value={metrics.onboarding.golf.playersTotal} />
                </div>
              </div>
            </SportCard>
          </div>
        </Section>

        <Section
          title="Platform Health"
          subtitle="Stability signals and operational risk."
        >
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Live Health Snapshot</h3>
                <span className="text-xs text-slate-400">Add APM + logs</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 mb-4">
                <MiniStat label="Auth Failures (7d)" value={metrics.auth.failedLogins7d} />
                <MiniStat label="Locked Accounts" value={metrics.auth.lockedAccounts} />
                <MiniStat label="API p95" value={null} suffix="ms" />
                <MiniStat label="Error Rate" value={null} suffix="%" />
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-500">
                Connect infrastructure telemetry (Sentry, Supabase logs, edge metrics)
                to surface latency, query duration, and errors by feature.
              </div>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Risk Alerts</h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
                  Player discovery map needs query latency metrics.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-cyan-400 flex-shrink-0" />
                  Add audit trail for admin-level data access.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-slate-400 flex-shrink-0" />
                  Error logging feed not wired to dashboard.
                </li>
              </ul>
            </GlassCard>
          </div>
        </Section>

        <Section
          title="Business Intelligence"
          subtitle="Revenue, churn, and monetization signals."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="MRR" value={null} note="Connect billing provider" tone="primary" />
            <StatCard label="Churn Rate" value={null} suffix="%" note="Needs subscription history" tone="amber" />
            <StatCard label="ARPU" value={null} note="Segment by sport and division" tone="cyan" />
            <StatCard label="Conversion to Paid" value={null} suffix="%" note="Track trial cohorts" tone="slate" />
          </div>
        </Section>

        <Section
          title="Outcome Metrics"
          subtitle="Proof of value: connections and commitments."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <OutcomeCard
              label="Committed Players"
              value={metrics.baseball.commitments}
              note="Players with commitments recorded"
            />
            <OutcomeCard
              label="Recruiting Interests"
              value={metrics.baseball.watchlistStages.committed ?? 0}
              note="Pipeline commitments logged"
            />
            <OutcomeCard
              label="Golf Seasons Logged"
              value={null}
              note="Define a season completion event"
            />
          </div>
        </Section>

        <Section
          title="Support Intelligence"
          subtitle="Volume, themes, and backlog health."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <GlassCard>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Inbound Signals</h3>
              <div className="grid gap-3 sm:grid-cols-2 mb-4">
                <MiniStat label="Demo Requests (30d)" value={metrics.demos.new30d} />
                <MiniStat label="Total Demos" value={metrics.demos.total} />
                <MiniStat label="Support Tickets" value={null} />
                <MiniStat label="Median Response" value={null} suffix="h" />
              </div>
              <p className="text-sm text-slate-500">
                Wire support inbox to tag messages by bug, feature request, and how-to.
                Surface top issues weekly.
              </p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Support Themes</h3>
              <div className="space-y-3">
                <SupportTag label="Bug: Calendar sync" value={null} />
                <SupportTag label="Feature: Recruiting intel" value={null} />
                <SupportTag label="How-to: Upload stats" value={null} />
              </div>
            </GlassCard>
          </div>
        </Section>

        <Section
          title="Geographic & Demographic Patterns"
          subtitle="Where usage clusters and which segments engage most."
        >
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <GlassCard>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Top States</h3>
              <div className="space-y-3">
                {metrics.geography.topStates.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Connect state aggregation (materialized view or RPC) to populate.
                  </p>
                ) : (
                  metrics.geography.topStates.map((state) => (
                    <GeoRow key={state.state} state={state.state} count={state.count} />
                  ))
                )}
              </div>
            </GlassCard>
            <GlassCard>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Segment Focus</h3>
              <div className="space-y-3 text-sm text-slate-600">
                <p>Track division levels, roster sizes, and position-specific engagement.</p>
                <p>Use this to prioritize sales outreach and feature development.</p>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500">
                  Recommended: add program_division to golf coaches and log user segment on signup.
                </div>
              </div>
            </GlassCard>
          </div>
        </Section>

        <Section
          title="Instrumentation Backlog"
          subtitle="Key data gaps and how to fill them."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {metrics.gaps.map((gap) => (
              <GlassCard key={gap.label}>
                <div className="text-sm font-semibold text-slate-900">{gap.label}</div>
                <div className="text-xs text-slate-400 mt-1">{gap.source}</div>
                <div className="text-sm text-slate-600 mt-2">{gap.note}</div>
              </GlassCard>
            ))}
          </div>
        </Section>
      </motion.div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      'rounded-2xl p-6',
      'bg-white/70 backdrop-blur-xl',
      'border border-white/30',
      'shadow-[0_4px_24px_rgba(0,0,0,0.04)]',
      className
    )}>
      {children}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      className="mt-10 space-y-5"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4 }}
    >
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </motion.section>
  );
}

function StatusChip({ label, tone }: { label: string; tone: 'emerald' | 'cyan' | 'amber' | 'slate' | 'primary' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
    primary: 'bg-primary-50 text-primary-700 border-primary-200',
  };

  return (
    <span className={cn('px-3 py-1 rounded-full border text-xs font-medium', tones[tone])}>
      {label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  note,
  tone,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  suffix?: string;
  note?: string;
  tone: 'primary' | 'cyan' | 'amber' | 'slate';
}) {
  const iconStyles = {
    primary: 'text-primary-600 bg-primary-50',
    cyan: 'text-cyan-600 bg-cyan-50',
    amber: 'text-amber-600 bg-amber-50',
    slate: 'text-slate-600 bg-slate-100',
  };

  return (
    <GlassCard>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{formatValue(value, suffix)}</p>
        </div>
        {Icon ? (
          <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', iconStyles[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      {note ? <p className="mt-3 text-xs text-slate-500">{note}</p> : null}
    </GlassCard>
  );
}

function FunnelStep({
  label,
  value,
  note,
  maxValue,
}: {
  label: string;
  value: number | null;
  note: string;
  maxValue: number;
}) {
  const ratio = value && maxValue ? Math.max(0.08, value / maxValue) : 0.12;
  const barWidth = `${Math.min(1, ratio) * 100}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{formatFull(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600"
          style={{ width: barWidth }}
        />
      </div>
      <p className="text-xs text-slate-400">{note}</p>
    </div>
  );
}

function MiniStat({ label, value, suffix = '' }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="rounded-xl bg-slate-50/80 border border-slate-100 p-3">
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{formatFull(value, suffix)}</p>
    </div>
  );
}

function EngagementCard({
  title,
  value,
  subtitle,
  trend,
}: {
  title: string;
  value: string;
  subtitle: string;
  trend: string;
}) {
  return (
    <GlassCard>
      <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">{title}</p>
      <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      <p className="text-xs text-primary-600 mt-2 font-medium">{trend}</p>
    </GlassCard>
  );
}

function SportCard({
  title,
  accent,
  stats,
  children,
}: {
  title: string;
  accent: 'emerald' | 'cyan';
  stats: Array<{ label: string; value: number | null }>;
  children: ReactNode;
}) {
  const accentStyles = {
    emerald: 'border-l-primary-500',
    cyan: 'border-l-cyan-500',
  };

  return (
    <div className={cn(
      'rounded-2xl p-6',
      'bg-white/70 backdrop-blur-xl',
      'border border-white/30 border-l-4',
      'shadow-[0_4px_24px_rgba(0,0,0,0.04)]',
      accentStyles[accent]
    )}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-400">Last 30 days</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <MiniStat key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
      {children}
    </div>
  );
}

function PipelineBar({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: string;
}) {
  const width = total > 0 ? `${Math.max(0.08, count / total) * 100}%` : '10%';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-700 font-medium">{formatFull(count)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={cn('h-full rounded-full bg-gradient-to-r', tone)} style={{ width }} />
      </div>
    </div>
  );
}

function OutcomeCard({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null;
  note: string;
}) {
  return (
    <GlassCard>
      <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">{label}</p>
      <p className="text-3xl font-bold text-slate-900 mt-2">{formatValue(value)}</p>
      <p className="text-sm text-slate-500 mt-1">{note}</p>
    </GlassCard>
  );
}

function SupportTag({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{formatFull(value)}</span>
    </div>
  );
}

function GeoRow({ state, count }: { state: string; count: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2.5">
      <span className="text-sm text-slate-600">{state}</span>
      <span className="text-sm font-semibold text-slate-900">{formatFull(count)}</span>
    </div>
  );
}
