'use client';

// ============================================================================
// TodayQueue — the operator's daily "who do I work right now" worklist
// ============================================================================
// A ranked, client-side-computed shortlist (top ~40) of SCHOOLS due a manual
// touch today, ONE main contact per school. It mirrors the intent of
// scripts/coach-priority.mjs (customer-like first) without a server round-trip:
//   • include only status === 'new_lead' with a valid email
//   • exclude anyone contacted in the last 7 days (frequency cap mirror)
//   • GROUP BY SCHOOL → show only the highest-level "main contact" per school
//       (primary contact, then head_coach > director > associate > assistant >
//        volunteer > unknown), so a school never lines up multiple coaches
//   • HIDE any school already being worked by an ACTIVE Resend sequence
//       enrollment — a coach in the Resend queue must NOT also appear in this
//       manual Gmail queue (the two channels are mutually exclusive)
//   • rank the per-school mains by an explainable fit score:
//       ODAC / Old Dominion (4 customers) > NCAC / North Coast (Denison)
//       > D3 (all 5 customers) > NAIA > D2 > JUCO/CCCAA > D1
// Each row exposes quick actions: Open in Gmail (when a template is armed),
// open the detail panel, log a touch, and an assignee picker.
// ============================================================================

import { useCallback, useMemo } from 'react';
import {
  IconMail,
  IconSend,
  IconUser,
  IconMaximize,
  IconMessageSquare,
  IconCheckCircle2,
  IconCalendar,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import {
  type Coach,
  type Division,
  CRM_ASSIGNEES,
  type CrmAssignee,
} from '../crm-config';
import { SignalsPanel } from './today/SignalsPanel';

const MAX_ROWS = 40;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// A very small, dependency-free email sanity check (matches the bar used
// elsewhere in the CRM: a single @ with a dotted domain).
function hasValidEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// +30 per priority level — the one operator-controlled ranking input.
// Hot (priority 2) = +60, which outranks even the strongest conference bonus
// (ODAC's 40), so an operator manually flagging a coach Hot always surfaces
// them above the conference/division heuristics below.
const PRIORITY_WEIGHT = 30;

// Conference/division component of the fit score — customer-like first.
// Mirrors coach-priority.mjs's conference/division intent (the only signals
// reliably populated for never-contacted leads). Conference wins over
// division; ties fall through to division.
function baseFitScore(coach: Coach): number {
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

// Full fit score — conference/division heuristic plus the operator's manual
// priority flag (see PRIORITY_WEIGHT above).
function fitScore(coach: Coach): number {
  return baseFitScore(coach) + coach.priority * PRIORITY_WEIGHT;
}

// Conference/division component of the human-readable reason.
function baseFitReason(coach: Coach): string {
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

// Short, human reason shown under each row so the ranking is explainable.
// When the priority weighting dominates the conference/division component,
// "High priority" leads the reason so the operator sees WHY the row jumped.
function fitReason(coach: Coach): string {
  const base = baseFitReason(coach);
  const priorityWeight = coach.priority * PRIORITY_WEIGHT;
  if (priorityWeight > 0 && priorityWeight >= baseFitScore(coach)) {
    return `High priority · ${base}`;
  }
  return base;
}

// Normalize a school name for grouping (trim + lowercase).
function normSchool(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

// Role seniority ranking — higher = more senior = preferred as the school's
// "main contact". Mirrors the crm_coaches.role_level values.
const ROLE_RANK: Record<string, number> = {
  head_coach: 5,
  director: 4,
  associate_head_coach: 3,
  assistant_coach: 2,
  volunteer: 1,
  unknown: 0,
};
function roleRank(c: Coach): number {
  return ROLE_RANK[(c.role_level ?? '').toLowerCase()] ?? 0;
}

// Whether a coach is a valid "main contact" target for the manual worklist.
// Assistant coaches and volunteers are NEVER queued — the queue is for a
// program's decision-maker (head / director / associate head). `unknown` is
// allowed only when the row is explicitly flagged the primary contact (many
// real head coaches have an unparsed title but carry is_primary_contact).
function isTargetableRole(c: Coach): boolean {
  const r = (c.role_level ?? '').toLowerCase();
  if (r === 'assistant_coach' || r === 'volunteer') return false;
  if (r === 'head_coach' || r === 'director' || r === 'associate_head_coach') return true;
  return c.is_primary_contact === true;
}

// Is `cand` a better "main contact" for a school than the current pick?
// primary-contact flag wins, then role seniority, then fit, then name (stable).
function isBetterContact(cand: Coach, cur: Coach): boolean {
  if (cand.is_primary_contact !== cur.is_primary_contact) return cand.is_primary_contact;
  const rr = roleRank(cand) - roleRank(cur);
  if (rr !== 0) return rr > 0;
  const fs = fitScore(cand) - fitScore(cur);
  if (fs !== 0) return fs > 0;
  return (cand.name || '').localeCompare(cur.name || '') < 0;
}

// Division chip palette (kept local; soft tints, brand-green for the strongest fit).
const DIVISION_CHIP: Record<string, string> = {
  D1: 'bg-surface-tint text-text-secondary ring-border-subtle',
  D2: 'bg-surface-tint text-text-secondary ring-border-subtle',
  D3: 'bg-accent-50 text-accent-800 ring-accent-200',
  NAIA: 'bg-surface-tint text-text-secondary ring-border-subtle',
  JUCO: 'bg-surface-tint text-text-secondary ring-border-subtle',
};

interface TodayQueueProps {
  coaches: Coach[];
  onCoachClick: (coach: Coach) => void;
  /** Called when the Gmail link is clicked — logs the touch (the <a href> opens the tab). */
  onOpenInGmail: (coach: Coach) => void;
  /** Builds the Gmail compose URL for a coach (subject + body merged), or null if not armed. */
  getGmailHref?: (coach: Coach) => string | null;
  onLogTouch: (coach: Coach) => void;
  /** Set/clear the manual work-division label on a coach. Optional. */
  onSetAssignee?: (coachId: string, assignee: CrmAssignee | null) => void;
  /**
   * Forwarded to SignalsPanel — called after a Signals quick-set follow-up
   * write succeeds, with the coach id and the new `next_follow_up_at` ISO
   * timestamp. Optional; wire it to keep a parent's own coach list (e.g.
   * `coaches` here) in sync instead of going stale after a quick-set.
   */
  onFollowUpSet?: (coachId: string, followUpAt: string) => void;
  /** Whether a Gmail template is armed (enables the "Gmail" quick action). */
  manualTemplateArmed: boolean;
  /**
   * When true, the Gmail button SENDS directly via the Gmail API (a real
   * <button> that calls onOpenInGmail) instead of opening a compose tab.
   */
  gmailDirectSend?: boolean;
  /**
   * coach_id -> sequence enrollment summary. Any school with an ACTIVE enrollment
   * is being worked by the automated Resend sequence, so it's HIDDEN from this
   * manual Gmail worklist (the two channels are mutually exclusive).
   */
  enrollmentMap?: Record<string, { status: string }>;
  /**
   * True while the parent's coach list is still loading. When set, the
   * "All caught up" empty state is suppressed so an empty `coaches` prop
   * (the initial pre-fetch state) doesn't read as "no work today" before
   * the real data has arrived.
   */
  loading?: boolean;
}

export function TodayQueue({
  coaches,
  onCoachClick,
  onOpenInGmail,
  getGmailHref,
  onLogTouch,
  onSetAssignee,
  manualTemplateArmed,
  gmailDirectSend = false,
  enrollmentMap,
  loading = false,
  onFollowUpSet,
}: TodayQueueProps) {
  const queue = useMemo(() => {
    const cutoff = Date.now() - SEVEN_DAYS_MS;

    // Schools already being worked by an ACTIVE Resend sequence enrollment — the
    // whole school is hidden from the manual queue so it isn't double-touched.
    const enrolledSchools = new Set<string>();
    if (enrollmentMap) {
      for (const c of coaches) {
        if (enrollmentMap[c.id]?.status === 'active') {
          const s = normSchool(c.school);
          if (s) enrolledSchools.add(s);
        }
      }
    }

    // Collapse to ONE main contact per school (highest level).
    const bySchool = new Map<string, Coach>();
    for (const c of coaches) {
      if (c.status !== 'new_lead') continue;
      if (!hasValidEmail(c.email)) continue;
      // Never queue a coach whose email is known-bad — mirrors the send gate in
      // crm-gmail-send.ts (sendCoachViaGmail/sendNextBatchViaGmail), which skips
      // any non-'valid' email_status. Legacy rows with no email_status set yet
      // are treated as eligible (null/unknown-unset, not a known bounce).
      if (c.email_status && c.email_status !== 'valid') continue;
      // The manual worklist targets a program's DECISION-MAKER only — never line
      // up assistant/volunteer coaches. So if a school's head is already worked
      // (contacted / sequence-enrolled) or has no email, we DON'T fall back to an
      // assistant — the school simply drops off the list rather than queue an
      // assistant. (This is why assistants were piling up before.)
      if (!isTargetableRole(c)) continue;
      // Excluded if contacted within the last 7 days; null = never contacted = eligible.
      if (c.last_contacted_at) {
        const t = Date.parse(c.last_contacted_at);
        if (!Number.isNaN(t) && t >= cutoff) continue;
      }
      const school = normSchool(c.school);
      if (!school) continue;
      if (enrolledSchools.has(school)) continue; // worked by Resend → not manual
      const cur = bySchool.get(school);
      if (!cur || isBetterContact(c, cur)) bySchool.set(school, c);
    }

    // Warmest fit first; cluster league-mates by conference; then name for stability.
    const mains = Array.from(bySchool.values());
    mains.sort(
      (a, b) =>
        fitScore(b) - fitScore(a) ||
        (a.conference || '').localeCompare(b.conference || '') ||
        (a.name || '').localeCompare(b.name || ''),
    );
    return mains.slice(0, MAX_ROWS);
  }, [coaches, enrollmentMap]);

  // SignalsPanel's rows only carry a coach_id — adapt it back to the full
  // Coach object the rest of this component (and its onCoachClick prop)
  // works with, using the already-loaded `coaches` list.
  const handleSignalCoachClick = useCallback(
    (coachId: string) => {
      const coach = coaches.find((c) => c.id === coachId);
      if (coach) onCoachClick(coach);
    },
    [coaches, onCoachClick],
  );

  if (loading && queue.length === 0) {
    return (
      <div className="space-y-4">
        <SignalsPanel onCoachClick={handleSignalCoachClick} onFollowUpSet={onFollowUpSet} />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl glass-standard p-3">
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 flex-shrink-0 rounded-full bg-warm-200/60 skeleton-shimmer" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-40 rounded bg-warm-200/60 skeleton-shimmer" />
                  <div className="h-2.5 w-28 rounded bg-warm-100/60 skeleton-shimmer" />
                </div>
                <div className="h-8 w-20 rounded-xl bg-warm-100/60 skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="space-y-4">
        <SignalsPanel onCoachClick={handleSignalCoachClick} onFollowUpSet={onFollowUpSet} />
        <div className="rounded-2xl glass-standard p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
            <IconCheckCircle2 size={26} className="text-primary-600" />
          </div>
          <h3 className="text-lg font-bold text-warm-900">All caught up</h3>
          <p className="mt-1 text-sm text-warm-500">No fresh leads due today.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SignalsPanel onCoachClick={handleSignalCoachClick} onFollowUpSet={onFollowUpSet} />

      {/* Header / count */}
      <div className="flex items-center justify-between rounded-2xl glass-standard px-4 py-3">
        <div className="flex items-center gap-2">
          <IconCalendar size={16} className="text-primary-500" />
          <h3 className="text-sm font-bold text-warm-900">Today&rsquo;s worklist</h3>
          <span className="text-xs text-warm-500">
            {queue.length} school{queue.length === 1 ? '' : 's'} · one main contact each · Resend-enrolled hidden
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
              className="rounded-2xl glass-standard p-3 transition-colors hover:bg-cream-100"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                {/* Rank + identity */}
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => onCoachClick(coach)}
                  className="group flex flex-1 items-start justify-start gap-3 rounded-none px-0 py-0 text-left min-h-0"
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
                          'inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-caption font-semibold uppercase tracking-wide ring-1',
                          chip,
                        )}
                      >
                        {div || '—'}
                      </span>
                      {coach.assigned_to && (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-caption font-medium text-primary-700 ring-1 ring-primary-200">
                          <IconUser size={11} />
                          {coach.assigned_to}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-warm-500">
                      {coach.school}
                      {coach.title ? ` · ${coach.title}` : ''}
                    </span>
                    <span className="mt-0.5 block truncate text-caption text-warm-400">
                      {fitReason(coach)}
                    </span>
                  </span>
                </Button>

                {/* Quick actions */}
                <div className="flex flex-wrap items-center gap-1.5 sm:flex-shrink-0">
                  {(() => {
                    const armed = manualTemplateArmed && !!coach.email;
                    // Direct mode: a real <button> that SENDS via the Gmail API
                    // (no compose tab). onOpenInGmail is wired to the direct send.
                    if (gmailDirectSend) {
                      return (
                        <Button
                          variant="ghost"
                          type="button"
                          disabled={!armed}
                          onClick={() => onOpenInGmail(coach)}
                          aria-label={`Send via Gmail to ${coach.name}`}
                          title={armed ? 'Send via Gmail' : 'Arm a Gmail template first'}
                          className={cn(
                            'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
                            armed ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-cream-50 text-warm-400',
                          )}
                        >
                          <IconSend size={14} /> Send
                        </Button>
                      );
                    }
                    const href = armed ? getGmailHref?.(coach) ?? null : null;
                    // Real <a href> (not a programmatic window.open) so the merged
                    // compose URL opens reliably under browser automation too. The
                    // click still logs the touch via onOpenInGmail.
                    return href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onOpenInGmail(coach)}
                        aria-label={`Open Gmail for ${coach.name}`}
                        title="Open in Gmail"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors bg-primary-50 text-primary-700 hover:bg-primary-100"
                      >
                        <IconMail size={14} /> Gmail
                      </a>
                    ) : (
                      <Button
                        variant="ghost"
                        type="button"
                        disabled
                        aria-label={`Open Gmail for ${coach.name}`}
                        title="Arm a Gmail template first"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium glass-subtle text-warm-400"
                      >
                        <IconMail size={14} /> Gmail
                      </Button>
                    );
                  })()}
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => onLogTouch(coach)}
                    aria-label={`Log a touch for ${coach.name}`}
                    title="Log touch"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl glass-subtle px-3 py-1.5 text-xs font-medium text-warm-600 transition-colors hover:bg-warm-100/60 hover:text-warm-900"
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
                      <NativeSelect
                        aria-label={`Assign ${coach.name}`}
                        value={coach.assigned_to ?? ''}
                        onChange={(e) =>
                          onSetAssignee(
                            coach.id,
                            e.target.value ? (e.target.value as CrmAssignee) : null,
                          )
                        }
                        className="min-h-[44px] cursor-pointer rounded-xl border-warm-200/60 glass-subtle pl-7 py-1.5 text-xs font-medium text-warm-600 transition-colors hover:bg-cream-100 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                      >
                        <option value="">Unassigned</option>
                        {CRM_ASSIGNEES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => onCoachClick(coach)}
                    aria-label={`Open ${coach.name} details`}
                    title="Open details"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl glass-subtle px-2.5 py-1.5 text-warm-500 transition-colors hover:bg-warm-100/60 hover:text-warm-900"
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
