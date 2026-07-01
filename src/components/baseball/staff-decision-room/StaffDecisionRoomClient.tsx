'use client';

// =============================================================================
// src/components/baseball/staff-decision-room/StaffDecisionRoomClient.tsx
//
// Staff Decision Room — a DECISION WORKSPACE (V10 Packet 10 "Staff Decision
// Room / Decision Ledger / Staff Action Queue", V5 System 5 "Staff Meeting
// Prep"). NOT a read-only insight list.
//
// PRIMARY TASK: drive open, source-backed agenda items to decisions in a
// meeting. Layout is built for that:
//   • Meeting Mode (the default): agenda on the LEFT, the selected item's
//     source-backed detail + ACTION BAR on the RIGHT.
//   • Action bar: mark discussed · resolve · convert to task · convert to note ·
//     record a decision note. (Conversions reuse the signal→action engine so the
//     real subsystem object is materialized — they are not fake buttons.)
//   • Players to discuss + Import-quality issues = the rest of the agenda spec.
//   • Decision Ledger = a real record of decisions MADE, threaded to evidence.
//
// All mutations are server actions (capability-gated on can_manage_settings,
// same as the read). RLS guarantees this surface is staff-only; players never
// reach it.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion, AnimatePresence } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/sonner';
import {
  IconBrain,
  IconUsers,
  IconSparkles,
  IconClock,
  IconCheckCircle2,
  IconUserPlus,
  IconBolt,
  IconAlertCircle,
  IconCheck,
  IconCheckCheck,
  IconClipboardList,
  IconNote,
  IconArrowRight,
  IconChevronRight,
  IconDownload,
  IconX,
  IconGauge,
  IconTrendingUp,
  IconTrendingDown,
  IconTrophy,
  IconShieldAlert,
  IconCalendar,
  IconDumbbell,
  IconActivity,
  IconAirplane,
  IconPlus,
} from '@/components/icons';

import {
  markMeetingItemDiscussed,
  resolveMeetingItem,
  reopenMeetingItem,
  recordDecisionNote,
  createMeetingItem,
  convertSignalToPracticeBlock,
  type DecisionRoomData,
  type DecisionRoomInsight,
  type DecisionRoomLedgerEntry,
  type DecisionRoomAgendaItem,
  type DecisionRoomPlayerFocus,
  type DecisionRoomImportIssue,
  type DecisionRoomEffectivenessReview,
  type DecisionRoomActionOutcome,
  type DecisionRoomGameResult,
  type DecisionRoomAvailabilityConcern,
  type DecisionRoomAttendanceSummary,
  type DecisionRoomLiftSummary,
  type DecisionRoomOpenTask,
  type DecisionRoomConflict,
} from '@/app/baseball/actions/decision-room';
import { convertSignalToAction } from '@/app/baseball/actions/signals';
import { recordActionOutcomes } from '@/app/baseball/actions/coachhelm-actions';
import type { BaseballActionOutcomeVerdict } from '@/lib/types/baseball-coachhelm-v10';

interface StaffDecisionRoomClientProps {
  data: DecisionRoomData;
}

// -----------------------------------------------------------------------------
// utils
// -----------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < 3_600_000) return 'just now';
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function severityTone(
  severity: 'critical' | 'warning' | 'info' | null,
): 'danger' | 'warning' | 'secondary' {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'secondary';
}

function priorityTone(priority: string | null): 'danger' | 'warning' | 'secondary' {
  if (priority === 'high' || priority === 'critical' || priority === 'urgent') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'secondary';
}

// --- Action Outcome Ledger (V10 did-it-move) verdict presentation -----------
// Honest by construction: 'too_early' / 'insufficient_sample' are NEVER coloured
// as a win — they read neutral. Only a measured direction earns green/red.
interface VerdictPresentation {
  label: string;
  tone: 'success' | 'danger' | 'secondary' | 'warning';
  /** 'up' | 'down' | null — direction glyph for measured movement. */
  arrow: 'up' | 'down' | null;
}
function verdictPresentation(
  verdict: BaseballActionOutcomeVerdict | null,
  measured: boolean,
): VerdictPresentation {
  if (!measured || verdict == null) {
    return { label: 'Tracking', tone: 'secondary', arrow: null };
  }
  switch (verdict) {
    case 'improved':
      return { label: 'Improved', tone: 'success', arrow: 'up' };
    case 'regressed':
      return { label: 'Regressed', tone: 'danger', arrow: 'down' };
    case 'no_change':
      return { label: 'No change', tone: 'secondary', arrow: null };
    case 'too_early':
      return { label: 'Too early', tone: 'warning', arrow: null };
    case 'insufficient_sample':
      return { label: 'Not measurable', tone: 'secondary', arrow: null };
    default:
      return { label: 'Tracking', tone: 'secondary', arrow: null };
  }
}

/** Format a metric value honoring its unit (pct → %, else 1-dp number). */
function formatMetricValue(value: number | null, unit: string | null): string {
  if (value == null) return '—';
  if (unit === 'pct' || unit === 'ratio') return `${(value * 100).toFixed(1)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const LEDGER_GLYPH: Record<DecisionRoomLedgerEntry['kind'], string> = {
  invite_accepted: 'joined',
  invite_pending: 'pending',
  discussed: 'discussed',
  resolved: 'resolved',
  converted_task: 'task',
  converted_note: 'note',
  converted_practice: 'practice',
  raised: 'raised',
  reopened: 'reopened',
  note: 'note',
};

// =============================================================================
// Root
// =============================================================================

export function StaffDecisionRoomClient({ data }: StaffDecisionRoomClientProps) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Selected agenda item drives the meeting-mode detail pane. Default to the
  // hottest open item (agenda is already severity-sorted server-side).
  const firstAgenda = data.agenda[0] ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(
    firstAgenda ? `${firstAgenda.kind}-${firstAgenda.id}` : null,
  );

  const selected = useMemo(
    () =>
      data.agenda.find((i) => `${i.kind}-${i.id}` === selectedKey) ??
      data.agenda[0] ??
      null,
    [data.agenda, selectedKey],
  );

  const fadeIn = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  // ---- "New agenda item" inline form state ----------------------------------
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDetail, setNewItemDetail] = useState('');
  const [creatingItem, startCreateItem] = useTransition();

  // ---- Export: a plain-text meeting summary built from real decisions -------
  function exportSummary() {
    const lines: string[] = [];
    lines.push('STAFF DECISION ROOM — MEETING SUMMARY');
    lines.push(new Date().toLocaleString());
    lines.push('');
    lines.push(`Open agenda items: ${data.openAgendaCount}`);
    lines.push(`Decisions recorded: ${data.decisionCount}`);
    lines.push('');
    lines.push('AGENDA');
    if (data.agenda.length === 0) lines.push('  (empty)');
    data.agenda.forEach((i, n) => {
      const sev = i.severityHint ? `[${i.severityHint}] ` : '';
      const who = i.playerName ? ` — ${i.playerName}` : '';
      const st = i.status === 'discussed' ? ' (discussed)' : '';
      lines.push(`  ${n + 1}. ${sev}${i.title}${who}${st}`);
      if (i.detail) lines.push(`     ${i.detail}`);
    });
    lines.push('');
    lines.push('PLAYERS TO DISCUSS');
    if (data.playersToDiscuss.length === 0) lines.push('  (none)');
    data.playersToDiscuss.forEach((p) =>
      lines.push(
        `  • ${p.name} — ${p.openCount} open${p.criticalCount ? `, ${p.criticalCount} critical` : ''}`,
      ),
    );
    lines.push('');
    lines.push('WINS / RESULTS (last 14 days)');
    if (data.recentGameResults.length === 0) lines.push('  (no completed games)');
    data.recentGameResults.forEach((g) => {
      const res = g.result ? g.result.toUpperCase() : '?';
      const score = g.ourScore != null && g.opponentScore != null ? `${g.ourScore}–${g.opponentScore}` : '';
      lines.push(`  [${res}] ${g.opponentName ?? 'Opponent'}${score ? ` ${score}` : ''} (${g.gameDate})`);
    });
    lines.push('');
    lines.push('AVAILABILITY CONCERNS');
    if (data.availabilityConcerns.length === 0) lines.push('  (none)');
    data.availabilityConcerns.forEach((a) =>
      lines.push(`  • ${a.playerName ?? 'Unknown'} — ${a.status}${a.reasonCategory ? ` (${a.reasonCategory})` : ''}`)
    );
    lines.push('');
    lines.push(`PRACTICE ATTENDANCE (last 14 days): ${data.attendanceSummary.totalAttended} present / ${data.attendanceSummary.totalMissed} missed`);
    if (data.attendanceSummary.concernedPlayers.length > 0) {
      data.attendanceSummary.concernedPlayers.forEach((p) =>
        lines.push(`  • ${p.playerName ?? 'Unknown'}: ${p.missedCount} missed`)
      );
    }
    lines.push('');
    lines.push(`LIFT COMPLIANCE (last 14 days): ${data.liftSummary.completedCount}/${data.liftSummary.scheduledCount} sessions completed`);
    if (data.liftSummary.nonCompliantPlayers.length > 0) {
      data.liftSummary.nonCompliantPlayers.forEach((p) =>
        lines.push(`  • ${p.playerName ?? 'Unknown'}: ${p.missedCount} missed`)
      );
    }
    lines.push('');
    lines.push('OPEN TASKS');
    if (data.openTasks.length === 0) lines.push('  (none)');
    data.openTasks.forEach((t) =>
      lines.push(`  • [${t.status}] ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ''}`)
    );
    lines.push('');
    lines.push('ACADEMIC / TRAVEL CONFLICTS');
    if (data.conflicts.length === 0) lines.push('  (none)');
    data.conflicts.forEach((c) =>
      lines.push(`  • [${c.severity}] ${c.playerName ?? 'Unknown'} — ${c.obligationLabel ?? c.obligationKind}`)
    );
    lines.push('');
    lines.push('DECISIONS RECORDED');
    if (data.ledger.length === 0) lines.push('  (none yet)');
    data.ledger.forEach((e) =>
      lines.push(`  • [${LEDGER_GLYPH[e.kind]}] ${e.label}${e.detail ? ` — ${e.detail}` : ''}`),
    );
    lines.push('');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decision-room-summary-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Summary exported', 'A meeting summary was downloaded.');
  }

  // Server actions revalidate the route path; router.refresh() in a transition
  // re-fetches the RSC payload without a hard navigation, keeping the UI snappy.
  const refresh = () => startTransition(() => router.refresh());

  // ---- Re-measure: run the outcome sweep now (the manual "did-it-move" pass) -
  // The sweep also runs nightly (Inngest) + on every postgame review; this gives
  // a coach an on-demand re-read in the room. Capability-gated server-side.
  const [sweeping, startSweep] = useTransition();
  const reMeasureOutcomes = () =>
    startSweep(async () => {
      try {
        const res = await recordActionOutcomes();
        if (res.success) {
          toast.success(
            'Outcomes re-measured',
            res.measured > 0
              ? `${res.measured} action${res.measured === 1 ? '' : 's'} updated.`
              : 'No new data to measure yet.',
          );
          router.refresh();
        } else {
          toast.error('Could not re-measure', res.error);
        }
      } catch {
        toast.error('Something went wrong', 'Please try again.');
      }
    });

  return (
    <LazyMotion features={domAnimation}>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header + primary export action */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <IconBrain size={20} />
              </div>
              <h1 className="text-2xl font-semibold text-warm-900 sm:text-3xl">
                Decision Room
              </h1>
            </div>
            <p className="mt-1 text-sm text-warm-500">
              Run your staff meeting from source-backed signals — discuss, decide,
              and turn each into an action. Coaches only.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<IconDownload size={15} />}
            onClick={exportSummary}
            disabled={
              data.agenda.length === 0 &&
              data.ledger.length === 0 &&
              data.recentGameResults.length === 0 &&
              data.availabilityConcerns.length === 0 &&
              data.openTasks.length === 0
            }
          >
            Export summary
          </Button>
        </div>

        {/* Stat strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <StatTile icon={<IconBolt size={18} />} label="Open agenda" value={data.openAgendaCount} emphasis />
          <StatTile icon={<IconCheckCheck size={18} />} label="Decisions made" value={data.decisionCount} />
          <StatTile icon={<IconUsers size={18} />} label="Active staff" value={data.staffCount} />
          <StatTile icon={<IconSparkles size={18} />} label="Open insights" value={data.openInsightCount} />
          <StatTile icon={<IconShieldAlert size={18} />} label="Availability" value={data.availabilityConcerns.length} />
          <StatTile icon={<IconAirplane size={18} />} label="Conflicts" value={data.conflicts.length} />
        </div>

        {/* ============================== MEETING MODE ====================== */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">
              Meeting mode · Staff action queue
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-warm-400">{data.openAgendaCount} open</span>
              {/* eslint-disable-next-line helm/no-raw-button */}
              <button
                type="button"
                onClick={() => {
                  setNewItemOpen((v) => !v);
                  setNewItemTitle('');
                  setNewItemDetail('');
                }}
                aria-label={newItemOpen ? 'Cancel new item' : 'Add agenda item'}
                className="inline-flex items-center gap-1 rounded-lg border border-warm-200 bg-cream-50 px-2.5 py-1 text-xs font-medium text-warm-700 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {newItemOpen ? (
                  <><IconX size={13} /> Cancel</>
                ) : (
                  <><IconPlus size={13} /> New item</>
                )}
              </button>
            </div>
          </div>

          {/* Inline "add agenda item" form — only shown when newItemOpen */}
          <AnimatePresence initial={false}>
            {newItemOpen && (
              <m.div
                key="new-item-form"
                initial={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                animate={reduceMotion ? undefined : { opacity: 1, height: 'auto' }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                transition={reduceMotion ? undefined : { duration: 0.18 }}
                className="mb-4 overflow-hidden"
              >
                <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary-600">
                    New agenda item
                  </p>
                  <div className="space-y-2">
                    <Input
                      placeholder="Title — e.g. 'Discuss pitching rotation changes'"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      disabled={creatingItem}
                      className="bg-cream-50"
                      maxLength={200}
                    />
                    <Textarea
                      placeholder="Optional detail or context (visible in meeting view)"
                      value={newItemDetail}
                      onChange={(e) => setNewItemDetail(e.target.value)}
                      disabled={creatingItem}
                      className="min-h-[72px] bg-cream-50 text-sm"
                      maxLength={1000}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    {/* eslint-disable-next-line helm/no-raw-button */}
                    <button
                      type="button"
                      onClick={() => {
                        setNewItemOpen(false);
                        setNewItemTitle('');
                        setNewItemDetail('');
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs text-warm-600 hover:text-warm-800"
                    >
                      Cancel
                    </button>
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={creatingItem}
                      disabled={creatingItem || newItemTitle.trim().length === 0}
                      onClick={() => {
                        const title = newItemTitle.trim();
                        if (!title) return;
                        startCreateItem(async () => {
                          try {
                            const res = await createMeetingItem({
                              title,
                              detail: newItemDetail.trim() || null,
                            });
                            if (res.success) {
                              toast.success('Agenda item added', title);
                              setNewItemOpen(false);
                              setNewItemTitle('');
                              setNewItemDetail('');
                              refresh();
                            } else {
                              toast.error('Could not add item', res.error ?? 'Please try again.');
                            }
                          } catch {
                            toast.error('Something went wrong', 'Please try again.');
                          }
                        });
                      }}
                    >
                      Add to agenda
                    </Button>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {data.agenda.length === 0 ? (
            <EmptyState
              type="generic"
              title="Nothing on the agenda"
              description="Open, unresolved signals and items you raise show up here as source-backed agenda items. Resolve them in a meeting and they thread into the Decision Ledger below."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-5">
              {/* Agenda (left) */}
              <div className="lg:col-span-2">
                <div className="space-y-2">
                  {data.agenda.map((item, idx) => {
                    const key = `${item.kind}-${item.id}`;
                    const active = selected ? `${selected.kind}-${selected.id}` === key : false;
                    return (
                      <m.div
                        key={key}
                        {...fadeIn}
                        transition={reduceMotion ? undefined : { delay: Math.min(idx * 0.02, 0.2) }}
                      >
                        <AgendaListRow
                          item={item}
                          active={active}
                          onSelect={() => setSelectedKey(key)}
                        />
                      </m.div>
                    );
                  })}
                </div>
              </div>

              {/* Detail + action bar (right) */}
              <div className="lg:col-span-3">
                <AnimatePresence mode="wait" initial={false}>
                  {selected && (
                    <m.div
                      key={`${selected.kind}-${selected.id}`}
                      initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                      transition={reduceMotion ? undefined : { duration: 0.18 }}
                    >
                      <AgendaDetailPane
                        item={selected}
                        onDone={refresh}
                        toastSuccess={(t, d) => toast.success(t, d)}
                        toastError={(t, d) => toast.error(t, d)}
                      />
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </section>

        {/* ================== PRACTICE EFFECTIVENESS (V10 input) ============ */}
        {data.effectivenessReviews.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">
                Practice effectiveness
              </h2>
              <Button
                variant="ghost"
                type="button"
                onClick={() => router.push('/baseball/dashboard/practice-effectiveness')}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Open effectiveness
                <IconChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.effectivenessReviews.map((rev) => (
                <EffectivenessReviewRow key={rev.id} review={rev} />
              ))}
            </div>
          </section>
        )}

        {/* ============== ACTION OUTCOME LEDGER (V10 did-it-move) =========== */}
        {/* The payoff of the whole loop: source → signal → action → OUTCOME.   */}
        {/* Every converted action that targets a metric, with the honest verdict*/}
        {/* once the sweep re-measures the after-window. 'Too early' stays neutral.*/}
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">
                Did it move? · Action outcomes
              </h2>
              <p className="mt-0.5 text-xs text-warm-400">
                Converted actions re-measured against the metric they targeted —
                honest by sample, never an overclaim.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<IconGauge size={15} />}
              onClick={reMeasureOutcomes}
              isLoading={sweeping}
              disabled={sweeping || data.actionOutcomes.length === 0}
            >
              Re-measure
            </Button>
          </div>

          {data.actionOutcomes.length === 0 ? (
            <EmptyState
              type="generic"
              title="No tracked actions yet"
              description="When you convert a signal into an action that targets a player metric, it lands here. After the next games, the engine re-measures whether the metric actually moved — and tells you honestly when it's too early to say."
            />
          ) : (
            <>
              {data.outcomeMovedCount > 0 && (
                <p className="mb-3 text-xs text-warm-500">
                  {data.outcomeMovedCount} of {data.actionOutcomes.length} tracked
                  action{data.actionOutcomes.length === 1 ? '' : 's'} have a measured
                  direction so far.
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {data.actionOutcomes.map((o, idx) => (
                  <m.div
                    key={o.id}
                    {...fadeIn}
                    transition={reduceMotion ? undefined : { delay: Math.min(idx * 0.02, 0.2) }}
                  >
                    <ActionOutcomeRow outcome={o} />
                  </m.div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* ====================== SECONDARY AGENDA RAILS ==================== */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          {/* Players to discuss */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-warm-400">
              Players to discuss
            </h2>
            {data.playersToDiscuss.length === 0 ? (
              <Card variant="flat" padding="lg" className="text-center">
                <p className="text-sm text-warm-500">
                  No player carries open agenda pressure right now.
                </p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {data.playersToDiscuss.map((p) => (
                  <PlayerFocusRow key={p.playerId} focus={p} />
                ))}
              </ul>
            )}
          </section>

          {/* Import-quality issues */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-warm-400">
              Data to verify
            </h2>
            {data.importIssues.length === 0 ? (
              <Card variant="flat" padding="lg" className="text-center">
                <p className="text-sm text-warm-500">No open import-quality issues.</p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {data.importIssues.map((iss) => (
                  <ImportIssueRow key={iss.signalId} issue={iss} />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ==================== V2 SPEC: WINS SINCE LAST MEETING =========== */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconTrophy size={16} className="text-primary-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">
                Wins since last meeting
              </h2>
            </div>
            {data.recentGameResults.length > 0 && (
              <span className="text-xs text-warm-400">Last 14 days</span>
            )}
          </div>
          {data.recentGameResults.length === 0 ? (
            <Card variant="flat" padding="lg" className="text-center">
              <p className="text-sm text-warm-500">No completed games in the last 14 days.</p>
            </Card>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.recentGameResults.map((g) => (
                <GameResultRow key={g.id} game={g} />
              ))}
            </div>
          )}
        </section>

        {/* ==================== V2 SPEC: AVAILABILITY CONCERNS ============= */}
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <IconShieldAlert size={16} className="text-amber-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">
              Availability concerns
            </h2>
          </div>
          {data.availabilityConcerns.length === 0 ? (
            <Card variant="flat" padding="lg" className="text-center">
              <p className="text-sm text-warm-500">No current availability concerns — all players are ready.</p>
            </Card>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.availabilityConcerns.map((a) => (
                <AvailabilityConcernRow key={a.id} concern={a} />
              ))}
            </div>
          )}
        </section>

        {/* ========= V2 SPEC: PRACTICE ATTENDANCE + LIFT COMPLIANCE ======== */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <IconCalendar size={16} className="text-primary-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">
                Practice attendance
              </h2>
            </div>
            <AttendanceSummaryCard summary={data.attendanceSummary} />
          </section>
          <section>
            <div className="mb-3 flex items-center gap-2">
              <IconDumbbell size={16} className="text-primary-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">
                Lift compliance
              </h2>
            </div>
            <LiftSummaryCard summary={data.liftSummary} />
          </section>
        </div>

        {/* ======== V2 SPEC: OPEN TASKS + ACADEMIC/TRAVEL CONFLICTS ======== */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <IconActivity size={16} className="text-primary-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">
                Open tasks
              </h2>
            </div>
            {data.openTasks.length === 0 ? (
              <Card variant="flat" padding="lg" className="text-center">
                <p className="text-sm text-warm-500">No open staff tasks.</p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {data.openTasks.map((t) => (
                  <OpenTaskRow key={t.id} task={t} />
                ))}
              </ul>
            )}
          </section>
          <section>
            <div className="mb-3 flex items-center gap-2">
              <IconAirplane size={16} className="text-amber-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">
                Academic &amp; travel conflicts
              </h2>
            </div>
            {data.conflicts.length === 0 ? (
              <Card variant="flat" padding="lg" className="text-center">
                <p className="text-sm text-warm-500">No open academic or travel conflicts.</p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {data.conflicts.map((c) => (
                  <ConflictRow key={c.id} conflict={c} />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ============================ LEDGER + INTEL ===================== */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Shared intelligence */}
          <section className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-warm-400">
              Shared intelligence
            </h2>
            {data.insights.length === 0 ? (
              <EmptyState
                type="generic"
                title="No shared intelligence yet"
                description="Coaching insights for your team will appear here as your staff and AI surface them."
              />
            ) : (
              <div className="space-y-3">
                {data.insights.slice(0, 12).map((insight, idx) => (
                  <m.div
                    key={insight.id}
                    {...fadeIn}
                    transition={reduceMotion ? undefined : { delay: Math.min(idx * 0.03, 0.3) }}
                  >
                    <InsightCard insight={insight} />
                  </m.div>
                ))}
              </div>
            )}
          </section>

          {/* Decision Ledger */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-warm-400">
              Decision Ledger
            </h2>
            {data.ledger.length === 0 ? (
              <Card variant="flat" padding="lg" className="text-center">
                <p className="text-sm text-warm-500">
                  Decisions you make in the room are recorded here.
                </p>
              </Card>
            ) : (
              <ol className="space-y-2">
                {data.ledger.map((entry) => (
                  <LedgerItem key={entry.id} entry={entry} />
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </LazyMotion>
  );
}

// =============================================================================
// Meeting-mode pieces
// =============================================================================

function StatTile({
  icon,
  label,
  value,
  emphasis = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <Card variant="raised" padding="md" className={emphasis ? 'ring-1 ring-primary-200' : undefined}>
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            emphasis ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-600'
          }`}
        >
          {icon}
        </div>
        <div>
          <p className="text-xl font-semibold tabular-nums text-warm-900">{value}</p>
          <p className="text-xs text-warm-500">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function AgendaListRow({
  item,
  active,
  onSelect,
}: {
  item: DecisionRoomAgendaItem;
  active: boolean;
  onSelect: () => void;
}) {
  const isMeetingItem = item.kind === 'meeting_item';
  const discussed = item.status === 'discussed';
  return (
    // A selectable agenda card (aria-pressed), not a control Button — matches the
    // established baseball selectable-row pattern (see stat-visuals primitives).
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
        active
          ? 'border-primary-300 bg-primary-50/60 ring-1 ring-primary-200'
          : 'border-warm-100 bg-cream-50 hover:border-warm-200 hover:bg-cream-100'
      }`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          item.severityHint === 'critical'
            ? 'bg-red-50 text-red-600'
            : isMeetingItem
              ? 'bg-primary-50 text-primary-600'
              : 'bg-warm-100 text-warm-500'
        }`}
      >
        {isMeetingItem ? <IconBolt size={15} /> : <IconAlertCircle size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-warm-900">{item.title}</p>
          {discussed && <Badge variant="warning">Discussed</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-warm-400">
          {item.severityHint && (
            <Badge variant={severityTone(item.severityHint)} className="capitalize">
              {item.severityHint}
            </Badge>
          )}
          {item.playerName && <span className="truncate">{item.playerName}</span>}
          <span>· {item.sourceRefCount} src</span>
        </div>
      </div>
      <IconChevronRight size={16} className="mt-1 shrink-0 text-warm-300" />
    </button>
  );
}

function AgendaDetailPane({
  item,
  onDone,
  toastSuccess,
  toastError,
}: {
  item: DecisionRoomAgendaItem;
  onDone: () => void;
  toastSuccess: (t: string, d?: string) => void;
  toastError: (t: string, d?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'idle' | 'resolve' | 'note' | 'task' | 'practice'>('idle');
  const [text, setText] = useState('');
  const isMeetingItem = item.kind === 'meeting_item';
  const discussed = item.status === 'discussed';

  function run(fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.success) {
          toastSuccess(okMsg);
          setMode('idle');
          setText('');
          onDone();
        } else {
          toastError('Could not complete that', res.error);
        }
      } catch {
        toastError('Something went wrong', 'Please try again.');
      }
    });
  }

  // Raise an open signal onto the agenda (materialize a meeting item) so the
  // staff can decide on it — reuses the signal→action engine.
  function raiseToAgenda() {
    if (!item.sourceSignalId) return;
    run(
      () =>
        convertSignalToAction({
          signalId: item.sourceSignalId as string,
          actions: [
            { actionType: 'meeting_item', title: item.title, detail: item.detail, visibility: 'staff_only' },
          ],
        }),
      'Raised to the agenda',
    );
  }

  function markDiscussed() {
    if (!isMeetingItem) return;
    run(() => markMeetingItemDiscussed(item.id), 'Marked discussed');
  }

  function reopen() {
    if (!isMeetingItem) return;
    run(() => reopenMeetingItem(item.id), 'Reopened');
  }

  function submitResolve() {
    if (!isMeetingItem) return;
    run(() => resolveMeetingItem({ itemId: item.id, resolution: text }), 'Resolved');
  }

  function submitNote() {
    run(
      () =>
        recordDecisionNote({
          title: `Decision: ${item.title}`,
          note: text,
          subjectTable: isMeetingItem ? 'baseball_meeting_items' : 'baseball_signals',
          subjectId: item.id,
          sourceSignalId: item.sourceSignalId,
          playerId: item.playerId,
        }),
      'Decision recorded',
    );
  }

  function submitTask() {
    if (!item.sourceSignalId) return;
    run(
      () =>
        convertSignalToAction({
          signalId: item.sourceSignalId as string,
          actions: [
            {
              actionType: 'player_task',
              title: item.title,
              detail: text || item.detail,
              assigneePlayerId: item.playerId ?? undefined,
              visibility: item.playerId ? 'player_only' : 'staff_only',
            },
          ],
        }),
      'Task created',
    );
  }

  function convertNote() {
    if (!item.sourceSignalId || !item.playerId) return;
    run(
      () =>
        convertSignalToAction({
          signalId: item.sourceSignalId as string,
          actions: [
            {
              actionType: 'player_note',
              title: item.title,
              detail: item.detail,
              assigneePlayerId: item.playerId ?? undefined,
              visibility: 'staff_only',
            },
          ],
        }),
      'Player note created',
    );
  }

  // [W6f] Convert the signal linked to this agenda item into a practice block.
  // Requires the caller to hold `can_manage_practice` (checked server-side in
  // `convertSignalToPracticeBlock`). A descriptive title seeds from the agenda
  // item; the coach may optionally add a coaching note in the textarea.
  function submitPracticeBlock() {
    if (!item.sourceSignalId) return;
    run(
      () =>
        convertSignalToPracticeBlock({
          signalId: item.sourceSignalId as string,
          title: item.title,
          detail: text.trim() || item.detail,
        }),
      'Practice block created',
    );
  }

  return (
    <Card variant="raised" padding="lg" className="lg:sticky lg:top-4">
      <CardContent className="p-0">
        {/* Header */}
        <div className="mb-3 flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              item.severityHint === 'critical'
                ? 'bg-red-50 text-red-600'
                : 'bg-primary-50 text-primary-600'
            }`}
          >
            {isMeetingItem ? <IconBolt size={18} /> : <IconAlertCircle size={18} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-warm-900">{item.title}</h3>
              {item.severityHint && (
                <Badge variant={severityTone(item.severityHint)} className="capitalize">
                  {item.severityHint}
                </Badge>
              )}
              {isMeetingItem ? (
                <Badge variant="secondary">On agenda</Badge>
              ) : (
                <Badge variant="outline">Open signal</Badge>
              )}
              {discussed && <Badge variant="warning">Discussed</Badge>}
            </div>
            {item.playerName && (
              <p className="mt-1 text-xs text-warm-500">Subject: {item.playerName}</p>
            )}
          </div>
        </div>

        {item.detail && (
          <p className="mb-4 text-sm leading-relaxed text-warm-700">{item.detail}</p>
        )}

        {/* Source-backed evidence. `sourceRefs` may arrive null/undefined if a
            row's jsonb column is absent — guard so a missing evidence array
            renders the "no structured sources" empty state instead of
            throwing on `.length`/`.map`. */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-warm-400">
            Evidence · {item.sourceRefCount} source{item.sourceRefCount === 1 ? '' : 's'}
          </p>
          {(item.sourceRefs ?? []).length === 0 ? (
            <p className="rounded-lg border border-warm-100 bg-cream-50 p-2.5 text-xs text-warm-500">
              No structured sources attached. Decide with caution — this item is
              not backed by cited data.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {(item.sourceRefs ?? []).map((ref, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-warm-100 bg-cream-50 px-3 py-2"
                >
                  <span className="truncate text-sm capitalize text-warm-700">{ref.label}</span>
                  {ref.detail && (
                    <span className="shrink-0 text-xs tabular-nums text-warm-400">{ref.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Inline text capture for resolve / note / task / practice */}
        {mode !== 'idle' && (
          <div className="mb-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={
                mode === 'resolve'
                  ? 'What did the staff decide? (resolution note)'
                  : mode === 'task'
                    ? 'Task detail for the player (optional)'
                    : mode === 'practice'
                      ? 'Coaching focus or context for the practice block (optional)'
                      : 'Record the decision…'
              }
              className="w-full"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" leftIcon={<IconX size={14} />} onClick={() => { setMode('idle'); setText(''); }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={pending}
                leftIcon={<IconCheck size={14} />}
                onClick={
                  mode === 'resolve'
                    ? submitResolve
                    : mode === 'task'
                      ? submitTask
                      : mode === 'practice'
                        ? submitPracticeBlock
                        : submitNote
                }
              >
                {mode === 'resolve'
                  ? 'Resolve item'
                  : mode === 'task'
                    ? 'Create task'
                    : mode === 'practice'
                      ? 'Create practice block'
                      : 'Record decision'}
              </Button>
            </div>
          </div>
        )}

        {/* ---- ACTION BAR ---- */}
        {mode === 'idle' && (
          <div className="flex flex-wrap gap-2 border-t border-warm-100 pt-4">
            {isMeetingItem && !discussed && (
              <Button variant="secondary" size="sm" isLoading={pending} leftIcon={<IconCheckCheck size={14} />} onClick={markDiscussed}>
                Mark discussed
              </Button>
            )}
            {isMeetingItem && (
              <Button variant="success" size="sm" leftIcon={<IconCheck size={14} />} onClick={() => setMode('resolve')}>
                Resolve
              </Button>
            )}
            {isMeetingItem && discussed && (
              <Button variant="ghost" size="sm" onClick={reopen} isLoading={pending}>
                Reopen
              </Button>
            )}
            {!isMeetingItem && (
              <Button variant="secondary" size="sm" isLoading={pending} leftIcon={<IconArrowRight size={14} />} onClick={raiseToAgenda}>
                Raise to agenda
              </Button>
            )}
            <Button variant="outline" size="sm" leftIcon={<IconClipboardList size={14} />} onClick={() => setMode('task')}>
              Create task
            </Button>
            {/* [W6f] Convert to practice block — only available when the item
                links to a source signal (required to materialise a block). The
                coach can add a coaching note in the textarea before confirming.
                Capability gate (can_manage_practice) is enforced server-side. */}
            {item.sourceSignalId && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<IconCalendar size={14} />}
                onClick={() => setMode('practice')}
              >
                Practice block
              </Button>
            )}
            {item.playerId && (
              <Button variant="outline" size="sm" isLoading={pending} leftIcon={<IconNote size={14} />} onClick={convertNote}>
                Player note
              </Button>
            )}
            <Button variant="ghost" size="sm" leftIcon={<IconNote size={14} />} onClick={() => setMode('note')}>
              Decision note
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlayerFocusRow({ focus }: { focus: DecisionRoomPlayerFocus }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-warm-100 bg-cream-50 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-600">
          {focus.name.slice(0, 1).toUpperCase()}
        </div>
        <p className="truncate text-sm font-medium text-warm-800">{focus.name}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {focus.criticalCount > 0 && (
          <Badge variant="danger">{focus.criticalCount} critical</Badge>
        )}
        <Badge variant="secondary">{focus.openCount} open</Badge>
      </div>
    </li>
  );
}

function ImportIssueRow({ issue }: { issue: DecisionRoomImportIssue }) {
  return (
    <li className="rounded-xl border border-warm-100 bg-cream-50 p-3">
      <div className="flex items-center gap-2">
        <Badge variant={severityTone(issue.severity)} className="capitalize">
          {issue.severity}
        </Badge>
        <p className="truncate text-sm font-medium text-warm-800">{issue.title}</p>
      </div>
      {issue.detail && (
        <p className="mt-1 line-clamp-2 text-xs text-warm-500">{issue.detail}</p>
      )}
    </li>
  );
}

function EffectivenessReviewRow({
  review,
}: {
  review: DecisionRoomEffectivenessReview;
}) {
  const improved = review.direction === 'improved';
  return (
    <Card variant="raised" padding="md">
      <CardContent className="p-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant={improved ? 'success' : 'danger'}>
            <span className="mr-1 inline-flex">
              {improved ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
            </span>
            {improved ? 'Associated improvement' : 'Moved the wrong way'}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-warm-400">
            <IconGauge size={12} />
            Correlated — not proven
          </span>
        </div>
        <h3 className="text-sm font-semibold text-warm-900">{review.focusArea}</h3>
        <p className="mt-0.5 text-xs text-warm-400">
          {review.metricLabel}
          {review.practiceTitle ? ` · ${review.practiceTitle}` : ''}
        </p>
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-warm-600">
          {review.conclusion}
        </p>
        {review.recommendedLabel && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warm-600">
            <IconSparkles size={13} className="mt-0.5 shrink-0 text-primary-500" />
            <span className="font-medium">{review.recommendedLabel}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ActionOutcomeRow({ outcome }: { outcome: DecisionRoomActionOutcome }) {
  const pres = verdictPresentation(outcome.verdict, outcome.measured);
  const baseline = formatMetricValue(outcome.baselineValue, outcome.unit);
  const observed = formatMetricValue(outcome.observedValue, outcome.unit);
  const sampleN = outcome.sampleN ?? 0;
  // 'too_early' is the honest read for a thin after-window — show WHY (sample).
  const isTooEarly = outcome.measured && outcome.verdict === 'too_early';
  return (
    <Card variant="raised" padding="md">
      <CardContent className="p-0">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <Badge variant={pres.tone}>
            {pres.arrow && (
              <span className="mr-1 inline-flex">
                {pres.arrow === 'up' ? (
                  <IconTrendingUp size={12} />
                ) : (
                  <IconTrendingDown size={12} />
                )}
              </span>
            )}
            {pres.label}
          </Badge>
          {outcome.measured && sampleN > 0 && (
            <span className="text-xs text-warm-400">
              {sampleN} game{sampleN === 1 ? '' : 's'} since
            </span>
          )}
        </div>
        <h3 className="truncate text-sm font-semibold text-warm-900">{outcome.title}</h3>
        <p className="mt-0.5 truncate text-xs text-warm-400">
          {outcome.metricLabel ?? 'No tracked metric'}
          {outcome.playerName ? ` · ${outcome.playerName}` : ''}
        </p>

        {/* The did-it-move read: baseline → observed (only when measured). */}
        {outcome.measured && outcome.metricLabel ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-warm-600">
            <span className="tabular-nums text-warm-400">{baseline}</span>
            <IconArrowRight size={13} className="shrink-0 text-warm-300" />
            <span className="tabular-nums font-semibold text-warm-900">{observed}</span>
            {isTooEarly && (
              <span className="text-warm-400">· need 2+ games to call it</span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-warm-400">
            {outcome.metricLabel
              ? 'Awaiting the next games to re-measure.'
              : 'Tracked without a measurable metric.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function InsightCard({ insight }: { insight: DecisionRoomInsight }) {
  const isResolved = insight.status === 'resolved' || insight.status === 'dismissed';
  return (
    <Card variant="raised" padding="md" className={isResolved ? 'opacity-70' : undefined}>
      <CardContent className="p-0">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-warm-900">{insight.title}</h3>
            {insight.priority && (
              <Badge variant={priorityTone(insight.priority)}>{insight.priority}</Badge>
            )}
            {isResolved && <Badge variant="success">Resolved</Badge>}
          </div>
          {insight.body && (
            <p className="text-sm leading-relaxed text-warm-600">{insight.body}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-warm-400">
            <span className="capitalize">{insight.insightType.replace(/_/g, ' ')}</span>
            {insight.authorName && <span>· {insight.authorName}</span>}
            {insight.createdAt && (
              <span className="flex items-center gap-1">
                <IconClock size={12} />
                {relativeTime(insight.createdAt)}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LedgerItem({ entry }: { entry: DecisionRoomLedgerEntry }) {
  const isInvite = entry.kind === 'invite_accepted' || entry.kind === 'invite_pending';
  const isResolved = entry.kind === 'resolved';
  const accepted = entry.kind === 'invite_accepted';
  return (
    <li className="flex items-start gap-3 rounded-xl border border-warm-100 bg-cream-50 p-3">
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isResolved
            ? 'bg-primary-600 text-white'
            : isInvite
              ? accepted
                ? 'bg-primary-50 text-primary-600'
                : 'bg-warm-100 text-warm-500'
              : 'bg-primary-50 text-primary-600'
        }`}
      >
        {isInvite ? (
          accepted ? <IconCheckCircle2 size={15} /> : <IconUserPlus size={15} />
        ) : isResolved ? (
          <IconCheckCheck size={15} />
        ) : (
          <IconNote size={15} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-warm-800">{entry.label}</p>
          {!isInvite && (
            <Badge variant="secondary" className="capitalize">
              {LEDGER_GLYPH[entry.kind]}
            </Badge>
          )}
        </div>
        {entry.detail && <p className="truncate text-xs text-warm-500">{entry.detail}</p>}
        <p className="mt-0.5 text-xs text-warm-400">{relativeTime(entry.at)}</p>
      </div>
    </li>
  );
}

// =============================================================================
// V2 SPEC sub-components: wins, availability, attendance, lift, tasks, conflicts
// =============================================================================

function GameResultRow({ game }: { game: DecisionRoomGameResult }) {
  const isWin = game.result === 'win';
  const isLoss = game.result === 'loss';
  const hasScore = game.ourScore != null && game.opponentScore != null;
  const homeAway = game.homeAway === 'home' ? 'vs' : game.homeAway === 'away' ? '@' : '';
  return (
    <Card variant="raised" padding="md">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2">
          {hasScore ? (
            <Badge variant={isWin ? 'success' : isLoss ? 'danger' : 'secondary'}>
              {isWin ? 'W' : isLoss ? 'L' : 'T'}
            </Badge>
          ) : (
            <Badge variant="secondary">Final</Badge>
          )}
          <p className="flex items-center gap-1 text-xs text-warm-400">
            <IconCalendar size={12} />
            {new Date(game.gameDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <p className="mt-1.5 truncate text-sm font-semibold text-warm-900">
          {homeAway && <span className="mr-1 text-warm-400">{homeAway}</span>}
          {game.opponentName ?? 'Opponent'}
        </p>
        {hasScore && (
          <p className="mt-0.5 text-sm tabular-nums text-warm-600">
            {game.ourScore} – {game.opponentScore}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AvailabilityConcernRow({ concern }: { concern: DecisionRoomAvailabilityConcern }) {
  const tone =
    concern.status === 'out' ? 'danger' : concern.status === 'limited' ? 'warning' : 'secondary';
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warm-100 bg-cream-50 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <IconShieldAlert size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-medium text-warm-800">
            {concern.playerName ?? 'Unknown player'}
          </p>
          <Badge variant={tone} className="capitalize">
            {concern.status}
          </Badge>
        </div>
        {concern.reasonCategory && (
          <p className="mt-0.5 text-xs capitalize text-warm-500">
            {concern.reasonCategory.replace(/_/g, ' ')}
          </p>
        )}
        {concern.note && (
          <p className="mt-0.5 line-clamp-2 text-xs text-warm-500">{concern.note}</p>
        )}
        <p className="mt-1 flex items-center gap-1 text-xs text-warm-400">
          <IconClock size={12} />
          Since {new Date(concern.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {concern.endsAt && (
            <>
              {' '}· Until {new Date(concern.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function AttendanceSummaryCard({ summary }: { summary: DecisionRoomAttendanceSummary }) {
  const hasData = summary.totalPractices > 0;
  const pct =
    hasData && summary.totalAttended + summary.totalMissed > 0
      ? Math.round((summary.totalAttended / (summary.totalAttended + summary.totalMissed)) * 100)
      : null;
  return (
    <Card variant="raised" padding="md">
      <CardContent className="p-0">
        {!hasData ? (
          <p className="text-sm text-warm-500">No attendance data in the last 14 days.</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-semibold tabular-nums text-warm-900">{summary.totalPractices}</p>
                <p className="text-xs text-warm-500">Practices</p>
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums text-warm-900">{summary.totalAttended}</p>
                <p className="text-xs text-warm-500">Present</p>
              </div>
              <div>
                <p className={`text-xl font-semibold tabular-nums ${summary.totalMissed > 0 ? 'text-amber-600' : 'text-warm-900'}`}>
                  {summary.totalMissed}
                </p>
                <p className="text-xs text-warm-500">Missed</p>
              </div>
            </div>
            {pct != null && (
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-warm-100">
                <div
                  className="h-full rounded-full bg-primary-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {summary.concernedPlayers.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-warm-400">
                  Attendance concerns
                </p>
                <ul className="space-y-1.5">
                  {summary.concernedPlayers.map((p) => (
                    <li key={p.playerId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-warm-700">{p.playerName ?? 'Unknown'}</span>
                      <Badge variant="warning">{p.missedCount} missed</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LiftSummaryCard({ summary }: { summary: DecisionRoomLiftSummary }) {
  const hasData = summary.scheduledCount > 0;
  const pct =
    hasData ? Math.round((summary.completedCount / summary.scheduledCount) * 100) : null;
  return (
    <Card variant="raised" padding="md">
      <CardContent className="p-0">
        {!hasData ? (
          <p className="text-sm text-warm-500">No lift sessions scheduled in the last 14 days.</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="text-xl font-semibold tabular-nums text-warm-900">{summary.completedCount}</p>
                <p className="text-xs text-warm-500">Completed</p>
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums text-warm-900">{summary.scheduledCount}</p>
                <p className="text-xs text-warm-500">Scheduled</p>
              </div>
            </div>
            {pct != null && (
              <>
                <div className="mb-1 h-2 overflow-hidden rounded-full bg-warm-100">
                  <div
                    className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-primary-600' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mb-3 text-xs text-warm-400">{pct}% completion rate</p>
              </>
            )}
            {summary.nonCompliantPlayers.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-warm-400">
                  Missed sessions
                </p>
                <ul className="space-y-1.5">
                  {summary.nonCompliantPlayers.map((p) => (
                    <li key={p.playerId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-warm-700">{p.playerName ?? 'Unknown'}</span>
                      <Badge variant="warning">{p.missedCount} missed</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OpenTaskRow({ task }: { task: DecisionRoomOpenTask }) {
  const isOverdue = task.dueDate ? new Date(task.dueDate) < new Date() : false;
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-warm-100 bg-cream-50 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-warm-800">{task.title}</p>
        {task.dueDate && (
          <p className={`mt-0.5 flex items-center gap-1 text-xs ${isOverdue ? 'text-red-500' : 'text-warm-400'}`}>
            <IconClock size={12} />
            {isOverdue ? 'Overdue · ' : ''}
            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {task.priority && (
          <Badge variant={priorityTone(task.priority)} className="capitalize">
            {task.priority}
          </Badge>
        )}
        <Badge variant="secondary" className="capitalize">
          {task.status.replace(/_/g, ' ')}
        </Badge>
      </div>
    </li>
  );
}

function ConflictRow({ conflict }: { conflict: DecisionRoomConflict }) {
  const tone =
    conflict.severity === 'critical' ? 'danger' : conflict.severity === 'warning' ? 'warning' : 'secondary';
  return (
    <li className="rounded-xl border border-warm-100 bg-cream-50 p-3">
      <div className="flex items-start gap-2">
        <Badge variant={tone} className="mt-0.5 capitalize shrink-0">
          {conflict.severity}
        </Badge>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-warm-800">
            {conflict.playerName ?? 'Unknown'} — {conflict.obligationLabel ?? conflict.obligationKind.replace(/_/g, ' ')}
          </p>
          {conflict.whyItMatters && (
            <p className="mt-0.5 line-clamp-2 text-xs text-warm-500">{conflict.whyItMatters}</p>
          )}
          {conflict.recommendedActionLabel && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary-600">
              <IconAirplane size={11} className="shrink-0" />
              {conflict.recommendedActionLabel}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
