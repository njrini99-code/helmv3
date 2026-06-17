'use client';

// ============================================================================
// TodayQueue — the operator's daily "who do I work right now" worklist
// ============================================================================
// A ranked, client-side-computed shortlist (top ~40) of the freshest, most
// customer-like NEW LEADS that are due a touch today. It mirrors the intent of
// scripts/coach-priority.mjs (customer-like first) without a server round-trip:
//   • include only status === 'new_lead'
//   • require a valid email (we can actually act on it)
//   • exclude anyone contacted in the last 7 days (frequency cap mirror)
//   • rank by a simple, explainable fit score:
//       ODAC / Old Dominion (4 customers) > NCAC / North Coast (Denison)
//       > D3 (all 5 customers) > NAIA > D2 > JUCO/CCCAA > D1
// Each row exposes quick actions: Open in Gmail (when a template is armed),
// open the detail panel, log a touch, and an assignee picker. Everything is
// derived from the already-fetched `coaches` array — no new server action.
// ============================================================================

import { useMemo } from 'react';
import {
  IconMail,
  IconUser,
  IconMaximize,
  IconMessageSquare,
  IconCheckCircle2,
  IconChevronDown,
  IconCalendar,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  type Coach,
  type Division,
  CRM_ASSIGNEES,
  type CrmAssignee,
} from '../crm-config';

const MAX_ROWS = 40;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// A very small, dependency-free email sanity check (matches the bar used
// elsewhere in the CRM: a single @ with a dotted domain).
function hasValidEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Fit score — customer-like first. Mirrors coach-priority.mjs's conference /
// division intent (the only signals reliably populated for never-contacted
// leads). Conference wins over division; ties fall through to division.
function fitScore(coach: Coach): number {
  const conf = (coach.conference || '').toLowerCase();
  const div = (coach.division ?? '').toString().toUpperCase() as Division | '';
  if (conf.includes('old dominion')) return 40; // ODAC — 4 customers here
  if (conf.includes('north coast')) return 25; // NCAC — Denison
  if (div === 'D3') return 15; // matches all 5 customers
  if (div === 'NAIA') return 12;
  if (div === 'D2') return 12;
  if (div === 'JUCO') return 8;
  if (div === 'D1') return 5; // least like current customers — worked last
  return 0;
}

// Short, human reason shown under each row so the ranking is explainable.
function fitReason(coach: Coach): string {
  const conf = (coach.conference || '').toLowerCase();
  const div = (coach.division ?? '').toString().toUpperCase();
  if (conf.includes('old dominion')) return 'ODAC · 4 customers in this conference';
  if (conf.includes('north coast')) return 'NCAC · Denison plays here';
  if (div === 'D3') return 'D3 · matches all 5 customers';
  if (div === 'NAIA') return 'NAIA · small-program fit';
  if (div === 'D2') return 'D2 · adjacent to customer profile';
  if (div === 'JUCO') return 'JUCO · small / hands-on';
  if (div === 'D1') return 'D1 · least like current customers';
  return 'New lead';
}

// Division chip palette (kept local; soft tints, brand-green for the strongest fit).
const DIVISION_CHIP: Record<string, string> = {
  D1: 'bg-warm-100 text-warm-600 ring-warm-200',
  D2: 'bg-blue-50 text-blue-700 ring-blue-200',
  D3: 'bg-primary-50 text-primary-700 ring-primary-200',
  NAIA: 'bg-violet-50 text-violet-700 ring-violet-200',
  JUCO: 'bg-amber-50 text-amber-700 ring-amber-200',
};

interface TodayQueueProps {
  coaches: Coach[];
  onCoachClick: (coach: Coach) => void;
  onOpenInGmail: (coach: Coach) => void;
  onLogTouch: (coach: Coach) => void;
  /** Set/clear the manual work-division label on a coach. Optional. */
  onSetAssignee?: (coachId: string, assignee: CrmAssignee | null) => void;
  /** Whether a Gmail template is armed (enables the "Gmail" quick action). */
  manualTemplateArmed: boolean;
}

export function TodayQueue({
  coaches,
  onCoachClick,
  onOpenInGmail,
  onLogTouch,
  onSetAssignee,
  manualTemplateArmed,
}: TodayQueueProps) {
  const queue = useMemo(() => {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    const eligible: Array<{ coach: Coach; score: number }> = [];
    for (const c of coaches) {
      if (c.status !== 'new_lead') continue;
      if (!hasValidEmail(c.email)) continue;
      // Excluded if contacted within the last 7 days; null = never contacted = eligible.
      if (c.last_contacted_at) {
        const t = Date.parse(c.last_contacted_at);
        if (!Number.isNaN(t) && t >= cutoff) continue;
      }
      eligible.push({ coach: c, score: fitScore(c) });
    }
    // Warmest fit first; cluster league-mates by conference; then name for stability.
    eligible.sort(
      (a, b) =>
        b.score - a.score ||
        (a.coach.conference || '').localeCompare(b.coach.conference || '') ||
        (a.coach.name || '').localeCompare(b.coach.name || ''),
    );
    return eligible.slice(0, MAX_ROWS).map((e) => e.coach);
  }, [coaches]);

  if (queue.length === 0) {
    return (
      <div className="rounded-2xl glass-standard p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
          <IconCheckCircle2 size={26} className="text-primary-600" />
        </div>
        <h3 className="text-lg font-bold text-warm-900">All caught up</h3>
        <p className="mt-1 text-sm text-warm-500">No fresh leads due today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / count */}
      <div className="flex items-center justify-between rounded-2xl glass-standard px-4 py-3">
        <div className="flex items-center gap-2">
          <IconCalendar size={16} className="text-primary-500" />
          <h3 className="text-sm font-bold text-warm-900">Today&rsquo;s worklist</h3>
          <span className="text-xs text-warm-500">
            top {queue.length} fresh lead{queue.length === 1 ? '' : 's'}, ranked by fit
          </span>
        </div>
      </div>

      {/* Ranked list — cards on mobile, denser rows at sm+ */}
      <ol className="space-y-2">
        {queue.map((coach, idx) => {
          const div = (coach.division ?? '').toString().toUpperCase();
          const chip = DIVISION_CHIP[div] ?? 'bg-warm-100 text-warm-600 ring-warm-200';
          return (
            <li
              key={coach.id}
              className="rounded-2xl glass-standard p-3 transition-colors hover:bg-white/80"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                {/* Rank + identity */}
                <button
                  type="button"
                  onClick={() => onCoachClick(coach)}
                  className="group flex flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-warm-100 text-xs font-bold tabular-nums text-warm-600">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-warm-900 group-hover:text-primary-700">
                        {coach.name}
                      </span>
                      <span
                        className={cn(
                          'inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1',
                          chip,
                        )}
                      >
                        {div || '—'}
                      </span>
                      {coach.assigned_to && (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 ring-1 ring-primary-200">
                          <IconUser size={11} />
                          {coach.assigned_to}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-warm-500">
                      {coach.school}
                      {coach.title ? ` · ${coach.title}` : ''}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-warm-400">
                      {fitReason(coach)}
                    </span>
                  </span>
                </button>

                {/* Quick actions */}
                <div className="flex flex-wrap items-center gap-1.5 sm:flex-shrink-0">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => onOpenInGmail(coach)}
                    disabled={!manualTemplateArmed}
                    aria-label={`Open Gmail for ${coach.name}`}
                    title={manualTemplateArmed ? 'Open in Gmail' : 'Arm a Gmail template first'}
                    className={cn(
                      'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                      manualTemplateArmed
                        ? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                        : 'bg-white/60 text-warm-400',
                    )}
                  >
                    <IconMail size={14} /> Gmail
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => onLogTouch(coach)}
                    aria-label={`Log a touch for ${coach.name}`}
                    title="Log touch"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white/60 px-3 py-1.5 text-xs font-medium text-warm-600 transition-colors hover:bg-warm-100/60 hover:text-warm-900"
                  >
                    <IconMessageSquare size={14} /> Log touch
                  </Button>
                  {onSetAssignee && (
                    <div className="relative inline-flex items-center">
                      <IconUser
                        size={13}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-2.5 text-warm-400"
                      />
                      <select
                        aria-label={`Assign ${coach.name}`}
                        value={coach.assigned_to ?? ''}
                        onChange={(e) =>
                          onSetAssignee(
                            coach.id,
                            e.target.value ? (e.target.value as CrmAssignee) : null,
                          )
                        }
                        className="min-h-[44px] cursor-pointer appearance-none rounded-xl border border-warm-200/60 bg-white/60 pl-7 pr-7 py-1.5 text-xs font-medium text-warm-600 transition-colors hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                      >
                        <option value="">Unassigned</option>
                        {CRM_ASSIGNEES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                      <IconChevronDown
                        size={13}
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2 text-warm-400"
                      />
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => onCoachClick(coach)}
                    aria-label={`Open ${coach.name} details`}
                    title="Open details"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/60 px-2.5 py-1.5 text-warm-500 transition-colors hover:bg-warm-100/60 hover:text-warm-900"
                  >
                    <IconMaximize size={14} />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
