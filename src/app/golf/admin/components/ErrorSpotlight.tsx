'use client';

import { cn } from '@/lib/utils';
import { IconWarning, IconCheckCircle2, IconClock3, IconRoute, IconShieldAlert } from '@/components/icons';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { timeAgo } from './admin-utils';

interface Props {
  errorDetection: AdminDashboardData['errorDetection'];
  errorLogs: AdminDashboardData['errorLogs'];
}

function formatRoute(route: string): string {
  if (route === '(no route)') return route;
  return route.replace(/\/:id/g, '/…');
}

export function ErrorSpotlight({ errorDetection, errorLogs }: Props) {
  const { errors24h, userExperienceIssues, errorsByRoute } = errorDetection;
  const { incidentCounts, recentErrors, totalErrors7d } = errorLogs;

  const liveIncidentCount = incidentCounts.open + incidentCounts.active;
  const allClear = liveIncidentCount === 0;
  const leadIncident = recentErrors.find((incident) => incident.status === 'open')
    ?? recentErrors.find((incident) => incident.status === 'active')
    ?? recentErrors[0]
    ?? null;

  const uxSignals = [
    { label: 'Chunk load', count: userExperienceIssues.chunkLoadErrors, tone: 'critical' as const },
    { label: 'Framework', count: userExperienceIssues.frameworkWarnings, tone: 'warning' as const },
    { label: 'Server', count: userExperienceIssues.serverErrors, tone: 'critical' as const },
    { label: 'Auth', count: userExperienceIssues.authErrors, tone: 'warning' as const },
  ].filter((signal) => signal.count > 0);

  const routeHotspots = errorsByRoute.slice(0, 3);

  return (
    <div className={cn(
      'glass-standard rounded-2xl',
      'p-4 sm:p-5 md:p-6',
      'h-full'
    )}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
            allClear ? 'bg-primary-50' : incidentCounts.open > 0 ? 'bg-red-50' : 'bg-amber-50'
          )}>
            {allClear ? (
              <IconCheckCircle2 size={16} className="text-primary-600" />
            ) : incidentCounts.open > 0 ? (
              <IconWarning size={16} className="text-red-600" />
            ) : (
              <IconShieldAlert size={16} className="text-amber-600" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-warm-900">Error Spotlight</h3>
            <p className="text-xs text-warm-400 leading-snug">
              Incident status and 7-day error trends
            </p>
          </div>
        </div>

        <span className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] flex-shrink-0',
          allClear
            ? 'border-primary-200 bg-primary-50 text-primary-700'
            : incidentCounts.open > 0
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
        )}>
          {allClear ? 'Clear' : incidentCounts.open > 0 ? 'Action needed' : 'Watch'}
        </span>
      </div>

      {/* Stats grid — 2-col on mobile, 4-col on xl */}
      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/30 bg-white/55 p-3">
          <p className="text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">
            Open
          </p>
          <p className={cn(
            'mt-1 text-xl font-bold tabular-nums',
            incidentCounts.open > 0 ? 'text-red-600' : 'text-warm-900'
          )}>
            {incidentCounts.open}
          </p>
          <p className="mt-0.5 text-[10px] sm:text-micro uppercase tracking-wider text-warm-400">
            unresolved
          </p>
        </div>
        <div className="rounded-xl border border-white/30 bg-white/55 p-3">
          <p className="text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">
            Active
          </p>
          <p className={cn(
            'mt-1 text-xl font-bold tabular-nums',
            incidentCounts.active > 0 ? 'text-amber-600' : 'text-warm-900'
          )}>
            {incidentCounts.active}
          </p>
          <p className="mt-0.5 text-[10px] sm:text-micro uppercase tracking-wider text-warm-400">
            recurring
          </p>
        </div>
        <div className="rounded-xl border border-white/30 bg-white/55 p-3">
          <p className="text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">
            Resolved
          </p>
          <p className={cn(
            'mt-1 text-xl font-bold tabular-nums',
            incidentCounts.resolvedRecently > 0 ? 'text-primary-600' : 'text-warm-900'
          )}>
            {incidentCounts.resolvedRecently}
          </p>
          <p className="mt-0.5 text-[10px] sm:text-micro uppercase tracking-wider text-warm-400">
            in 24h
          </p>
        </div>
        <div className="rounded-xl border border-white/30 bg-white/55 p-3">
          <p className="text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">
            24h Volume
          </p>
          <p className={cn(
            'mt-1 text-xl font-bold tabular-nums',
            errors24h > 0 ? 'text-amber-600' : 'text-warm-900'
          )}>
            {errors24h.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[10px] sm:text-micro uppercase tracking-wider text-warm-400">
            {totalErrors7d.toLocaleString()} in 7 days
          </p>
        </div>
      </div>

      {/* Lead incident card */}
      {leadIncident ? (
        <div className={cn(
          'mt-4 rounded-2xl border p-4',
          leadIncident.status === 'open'
            ? 'border-red-100 bg-red-50/45'
            : leadIncident.status === 'active'
              ? 'border-amber-100 bg-amber-50/45'
              : 'border-white/35 bg-white/55'
        )}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-500">
                {leadIncident.status === 'open'
                  ? 'Top Priority Incident'
                  : leadIncident.status === 'active'
                    ? 'Active Incident'
                    : 'Latest Incident'}
              </p>
              <p className="mt-1 text-sm font-semibold text-warm-900 break-words line-clamp-2">{leadIncident.title}</p>
              <p className="mt-1 text-xs sm:text-sm leading-5 sm:leading-6 text-warm-700 line-clamp-3">{leadIncident.summary}</p>
            </div>
            <span className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] flex-shrink-0',
              leadIncident.status === 'open'
                ? 'border-red-200 bg-red-100 text-red-700'
                : leadIncident.status === 'active'
                  ? 'border-amber-200 bg-amber-100 text-amber-700'
                  : 'border-slate-200 bg-slate-100 text-slate-600'
            )}>
              {leadIncident.status}
            </span>
          </div>

          <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-2">
            <div className="rounded-xl border border-white/40 bg-white/70 px-3 py-2">
              <p className="text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">
                Root Cause
              </p>
              <p className="mt-1 text-xs leading-5 text-warm-700 break-words line-clamp-3">{leadIncident.diagnosisBasis}</p>
            </div>
            <div className="rounded-xl border border-white/40 bg-white/70 px-3 py-2">
              <p className="text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">
                Last seen
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-warm-700">
                <IconClock3 size={12} className="text-warm-400 flex-shrink-0" />
                <span className="min-w-0 break-words">
                  {timeAgo(leadIncident.lastSeen)} · {leadIncident.occurrences} occurrences
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50/60 via-primary-50/30 to-white/50 px-6 py-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 shadow-[0_2px_8px_rgba(22,163,74,0.12)]">
            <IconCheckCircle2 size={26} className="text-primary-600" />
          </div>
          <p className="mt-3 text-sm font-bold text-primary-700">
            All Clear
          </p>
          <p className="mt-1 text-xs text-warm-500 leading-relaxed max-w-[240px]">
            Zero unresolved incidents. Platform is healthy and running smoothly.
          </p>
          {totalErrors7d > 0 && (
            <p className="mt-2 text-[10px] font-medium text-warm-400 tabular-nums">
              {totalErrors7d.toLocaleString()} error{totalErrors7d !== 1 ? 's' : ''} this week — all resolved
            </p>
          )}
        </div>
      )}

      {/* UX signals + route hotspots — stack on mobile, 2-col on lg+ */}
      {(uxSignals.length > 0 || routeHotspots.length > 0) && (
        <div className="mt-4 grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] sm:text-micro font-medium uppercase tracking-wider text-warm-400">
              User Impact
            </p>
            <div className="mt-2 space-y-1.5">
              {uxSignals.length > 0 ? uxSignals.map((signal) => (
                <div
                  key={signal.label}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-2.5 py-2.5',
                    signal.tone === 'critical' ? 'bg-red-50/50' : 'bg-amber-50/50'
                  )}
                >
                  <span className="text-xs text-warm-600">{signal.label}</span>
                  <span className={cn(
                    'text-xs font-semibold tabular-nums',
                    signal.tone === 'critical' ? 'text-red-600' : 'text-amber-600'
                  )}>
                    {signal.count}
                  </span>
                </div>
              )) : (
                <div className="rounded-lg bg-white/55 px-2.5 py-2.5 text-xs text-warm-500">
                  No user-facing impact detected
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] sm:text-micro font-medium uppercase tracking-wider text-warm-400">
              Route Hotspots
            </p>
            <div className="mt-2 space-y-1.5">
              {routeHotspots.length > 0 ? routeHotspots.map((route) => (
                <div
                  key={route.route}
                  className="flex items-center gap-2 rounded-lg bg-white/55 px-2.5 py-2.5"
                >
                  <IconRoute size={12} className="text-warm-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-warm-700">
                      {formatRoute(route.route)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-warm-500 flex-shrink-0">
                    {route.count}
                  </span>
                </div>
              )) : (
                <div className="rounded-lg bg-white/55 px-2.5 py-2.5 text-xs text-warm-500">
                  No route hotspots detected
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
