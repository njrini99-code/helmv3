'use client';

// =============================================================================
// src/components/baseball/staff-decision-room/StaffDecisionRoomFairway.tsx
//
// StaffDecisionRoomFairway — the Staff Decision Room migrated to "The Living
// Annual" kit (P4.23; spec: docs/baseball/design-system-living-annual.md §5
// "THE WAR ROOM · clay ink · coach recruiting" — Decision Room lives in this
// lane — and §6 P3 #10 "Decision Room"). Built sequentially as three panes:
//
//   1. AGENDA PANE   — masthead + stat strip + meeting mode (agenda list +
//                       source-backed detail/action pane).
//   2. LEDGER PANE    — practice effectiveness, action-outcome ledger,
//                       players/import rails, wins, availability, attendance/
//                       lift, tasks/conflicts, shared intelligence, and the
//                       Decision Ledger itself.
//   3. CEREMONY       — the decision-made payoff: resolving an item or
//                       recording a decision note briefly presses a
//                       `<CommitSeal>` ("DECIDED") over the detail pane before
//                       the item leaves the agenda — the emotional beat of
//                       "the coach edits the magazine" made physical (spec §9
//                       north-star #2, adapted from a recruiting commit to a
//                       staff decision).
//
// PRESENTATION ONLY. Receives the SAME `data` read model and the SAME
// root-level state/handlers `StaffDecisionRoomClient` already owns (agenda
// selection, the "new agenda item" form, export, refresh, the outcome
// re-measure sweep). Every mutation this file calls directly (mark
// discussed/resolve/reopen/record a decision note/convert a signal to a
// task, note, or practice block) is the EXACT SAME server action the
// pre-migration client called — `actions/signals.ts` is imported read-only
// for `convertSignalToAction`, never edited.
//
// Ink: this whole surface renders in `ink="pursuit"` (clay) per the IA spec —
// Decision Room is a War Room surface, not a Pressbox one, even though most
// of its content (attendance, lift compliance, wins) is team-ops data. The
// "did-it-move" / practice-effectiveness / game-result directional badges
// intentionally borrow the 20-80 GRADE RAMP (`--grade-plus/-avg/-low`) rather
// than the two-ink lane system — that ramp is the kit's existing
// quality-direction vocabulary (GradeStamp/ToolRail already use it inside the
// War Room), so "improved" reading green here is reusing a sanctioned atom,
// not introducing a second lane ink into this page's chrome.
// =============================================================================

import { useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import {
  IconBolt,
  IconAlertCircle,
  IconCheck,
  IconCheckCircle2,
  IconUserPlus,
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
  IconMinus,
  IconTrophy,
  IconShieldAlert,
  IconCalendar,
  IconDumbbell,
  IconActivity,
  IconAirplane,
  IconPlus,
  IconClock,
  IconSparkles,
} from '@/components/icons';
import { cn } from '@/lib/utils';

import {
  markMeetingItemDiscussed,
  resolveMeetingItem,
  reopenMeetingItem,
  recordDecisionNote,
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

import {
  SectionMasthead,
  RuledStatLine,
  StatReadout,
  Eyebrow,
  InkBadge,
  PaperCard,
  EditorsLetter,
  CommitSeal,
  Reveal,
  HoverReveal,
  pressableClass,
  GRADE_TEXT_CLASS,
  GRADE_VAR,
  PACE,
} from '@/components/baseball/living-annual';
import type { GradeBand } from '@/components/baseball/living-annual';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

export interface StaffDecisionRoomFairwayProps {
  data: DecisionRoomData;
  selected: DecisionRoomAgendaItem | null;
  selectedKey: string | null;
  onSelectAgendaItem: (key: string) => void;

  newItemOpen: boolean;
  newItemTitle: string;
  newItemDetail: string;
  creatingItem: boolean;
  onToggleNewItem: () => void;
  onNewItemTitleChange: (v: string) => void;
  onNewItemDetailChange: (v: string) => void;
  onSubmitNewItem: () => void;

  onExportSummary: () => void;
  onRefresh: () => void;

  sweeping: boolean;
  onReMeasureOutcomes: () => void;
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

// --- GradeTag — a compact grade-ramp status tag (win/loss, verdict direction,
// availability) built from the SAME exported GRADE_TEXT_CLASS/GRADE_VAR
// tokens `<InkBadge>` composes from, just banded plus/avg/low instead of the
// two-ink lane. Reuses the sanctioned quality-direction vocabulary rather
// than inventing a new color family for "good/neutral/bad". ---------------
function GradeTag({ band, label }: { band: GradeBand; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-fw-sm px-1.5 py-0.5 font-annual text-microbadge font-semibold uppercase leading-none tracking-[0.12em]',
        GRADE_TEXT_CLASS[band],
      )}
      style={{ backgroundColor: `color-mix(in oklch, ${GRADE_VAR[band]} 12%, transparent)` }}
    >
      {label}
    </span>
  );
}

type Glyph = 'up' | 'down' | 'flat' | 'none';

function DirectionGlyph({ glyph }: { glyph: Glyph }) {
  if (glyph === 'up') return <IconTrendingUp size={12} className="shrink-0" aria-hidden />;
  if (glyph === 'down') return <IconTrendingDown size={12} className="shrink-0" aria-hidden />;
  if (glyph === 'flat') return <IconMinus size={12} className="shrink-0" aria-hidden />;
  return null;
}

interface DirectionPresentation {
  band: GradeBand;
  label: string;
  glyph: Glyph;
}

// Action Outcome Ledger (V10 did-it-move) verdict. Honest by construction:
// 'too_early' / 'insufficient_sample' are NEVER coloured as a win — they read
// as the neutral 'avg' band. Only a measured direction earns plus/low.
function verdictPresentation(
  verdict: DecisionRoomActionOutcome['verdict'],
  measured: boolean,
): DirectionPresentation {
  if (!measured || verdict == null) return { band: 'avg', label: 'Tracking', glyph: 'none' };
  switch (verdict) {
    case 'improved':
      return { band: 'plus', label: 'Improved', glyph: 'up' };
    case 'regressed':
      return { band: 'low', label: 'Regressed', glyph: 'down' };
    case 'no_change':
      return { band: 'avg', label: 'No change', glyph: 'flat' };
    case 'too_early':
      return { band: 'avg', label: 'Too early', glyph: 'none' };
    case 'insufficient_sample':
      return { band: 'avg', label: 'Not measurable', glyph: 'none' };
    default:
      return { band: 'avg', label: 'Tracking', glyph: 'none' };
  }
}

// Practice Effectiveness direction. Honest by construction: only 'regressed'
// earns the low (clay-red) band. 'no_change' and null read neutral — never
// mislabeled as a loss (Issue #498).
function effectivenessPresentation(
  direction: DecisionRoomEffectivenessReview['direction'],
): DirectionPresentation {
  switch (direction) {
    case 'improved':
      return { band: 'plus', label: 'Associated improvement', glyph: 'up' };
    case 'regressed':
      return { band: 'low', label: 'Moved the wrong way', glyph: 'down' };
    case 'no_change':
      return { band: 'avg', label: 'Held steady', glyph: 'flat' };
    default:
      return { band: 'avg', label: 'Not enough data', glyph: 'none' };
  }
}

function severityBadge(severity: DecisionRoomAgendaItem['severityHint']) {
  if (!severity) return null;
  if (severity === 'critical') return <InkBadge label={severity} tone="pursuit" variant="solid" />;
  if (severity === 'warning') return <InkBadge label={severity} tone="pursuit" variant="soft" />;
  return <InkBadge label={severity} tone="neutral" variant="soft" />;
}

function priorityBadge(priority: string | null) {
  if (!priority) return null;
  const p = priority.toLowerCase();
  if (p === 'high' || p === 'critical' || p === 'urgent') {
    return <InkBadge label={priority} tone="pursuit" variant="solid" />;
  }
  if (p === 'medium') return <InkBadge label={priority} tone="pursuit" variant="soft" />;
  return <InkBadge label={priority} tone="neutral" variant="soft" />;
}

// =============================================================================
// Root
// =============================================================================

export function StaffDecisionRoomFairway({
  data,
  selected,
  selectedKey,
  onSelectAgendaItem,
  newItemOpen,
  newItemTitle,
  newItemDetail,
  creatingItem,
  onToggleNewItem,
  onNewItemTitleChange,
  onNewItemDetailChange,
  onSubmitNewItem,
  onExportSummary,
  onRefresh,
  sweeping,
  onReMeasureOutcomes,
}: StaffDecisionRoomFairwayProps) {
  const router = useRouter();

  const exportDisabled =
    data.agenda.length === 0 &&
    data.ledger.length === 0 &&
    data.recentGameResults.length === 0 &&
    data.availabilityConcerns.length === 0 &&
    data.openTasks.length === 0;

  const mastheadActions = (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={<IconDownload size={15} />}
      onClick={onExportSummary}
      disabled={exportDisabled}
    >
      Export summary
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <SectionMasthead
        eyebrow="THE WAR ROOM · STAFF MEETING"
        title="Decision Room"
        ink="pursuit"
        actions={mastheadActions}
      >
        <p className="max-w-prose font-annual text-body-lg text-text-secondary">
          Run your staff meeting from source-backed signals — discuss, decide, and
          turn each into an action. Coaches only.
        </p>
      </SectionMasthead>

      {/* ── Stat strip — the room's table of contents, clay-ruled ─────────── */}
      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
        <RuledStatLine label="Open agenda" value={data.openAgendaCount} ink="pursuit" size="row" emphasis />
        <RuledStatLine label="Decisions made" value={data.decisionCount} ink="pursuit" size="row" />
        <RuledStatLine label="Active staff" value={data.staffCount} ink="pursuit" size="row" />
        <RuledStatLine label="Open insights" value={data.openInsightCount} ink="pursuit" size="row" />
        <RuledStatLine label="Availability" value={data.availabilityConcerns.length} ink="pursuit" size="row" />
        <RuledStatLine label="Conflicts" value={data.conflicts.length} ink="pursuit" size="row" />
      </div>

      {/* ============================== AGENDA PANE ======================= */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Eyebrow ink="pursuit" as="h2">
            Meeting mode · Staff action queue
          </Eyebrow>
          <div className="flex items-center gap-3">
            <span className="text-eyebrow uppercase tracking-[0.14em] tabular-nums text-text-tertiary">
              {data.openAgendaCount} open
            </span>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={newItemOpen ? <IconX size={13} /> : <IconPlus size={13} />}
              onClick={onToggleNewItem}
              aria-label={newItemOpen ? 'Cancel new item' : 'Add agenda item'}
            >
              {newItemOpen ? 'Cancel' : 'New item'}
            </Button>
          </div>
        </div>

        {newItemOpen ? (
          <Reveal className="mb-5">
            <PaperCard className="p-5">
              <Eyebrow ink="pursuit" className="mb-3">
                New agenda item
              </Eyebrow>
              <div className="space-y-2">
                <Input
                  placeholder="Title — e.g. 'Discuss pitching rotation changes'"
                  value={newItemTitle}
                  onChange={(e) => onNewItemTitleChange(e.target.value)}
                  disabled={creatingItem}
                  className="bg-[var(--paper)]"
                  maxLength={200}
                />
                <Textarea
                  placeholder="Optional detail or context (visible in meeting view)"
                  value={newItemDetail}
                  onChange={(e) => onNewItemDetailChange(e.target.value)}
                  disabled={creatingItem}
                  className="min-h-[72px] bg-[var(--paper)] text-sm"
                  maxLength={1000}
                />
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onToggleNewItem} disabled={creatingItem}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={creatingItem}
                  disabled={creatingItem || newItemTitle.trim().length === 0}
                  onClick={onSubmitNewItem}
                >
                  Add to agenda
                </Button>
              </div>
            </PaperCard>
          </Reveal>
        ) : null}

        {data.agenda.length === 0 ? (
          <EditorsLetter
            ink="pursuit"
            title="Nothing on the agenda."
            body="Open, unresolved signals and items you raise show up here as source-backed agenda items. Resolve them in a meeting and they thread into the Decision Ledger below."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Agenda list (left) */}
            <div className="lg:col-span-2">
              <div className="flex flex-col gap-2">
                {data.agenda.map((item, idx) => {
                  const key = `${item.kind}-${item.id}`;
                  const active = selectedKey ? key === selectedKey : idx === 0;
                  return (
                    <Reveal key={key} staggerIndex={Math.min(idx, 10)}>
                      <AgendaListRow item={item} active={active} onSelect={() => onSelectAgendaItem(key)} />
                    </Reveal>
                  );
                })}
              </div>
            </div>

            {/* Detail + action bar (right) */}
            <div className="lg:col-span-3">
              {selected ? (
                <Reveal key={`${selected.kind}-${selected.id}`}>
                  <AgendaDetailPane item={selected} onDone={onRefresh} />
                </Reveal>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {/* ================== PRACTICE EFFECTIVENESS (V10 input) ============ */}
      {data.effectivenessReviews.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <Eyebrow ink="pursuit" as="h2">
              Practice effectiveness
            </Eyebrow>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<IconChevronRight size={14} />}
              onClick={() => router.push('/baseball/dashboard/practice-effectiveness')}
            >
              Open effectiveness
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.effectivenessReviews.map((rev, idx) => (
              <Reveal key={rev.id} staggerIndex={Math.min(idx, 10)}>
                <EffectivenessReviewRow review={rev} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ============== ACTION OUTCOME LEDGER (V10 did-it-move) =========== */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow ink="pursuit" as="h2">
              Did it move? · Action outcomes
            </Eyebrow>
            <p className="mt-1 max-w-prose font-annual text-body-sm text-text-tertiary">
              Converted actions re-measured against the metric they targeted — honest
              by sample, never an overclaim.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<IconGauge size={15} />}
            onClick={onReMeasureOutcomes}
            isLoading={sweeping}
            disabled={sweeping || data.actionOutcomes.length === 0}
          >
            Re-measure
          </Button>
        </div>

        {data.actionOutcomes.length === 0 ? (
          <EditorsLetter
            ink="pursuit"
            title="No tracked actions yet."
            body="When you convert a signal into an action that targets a player metric, it lands here. After the next games, the engine re-measures whether the metric actually moved — and tells you honestly when it's too early to say."
          />
        ) : (
          <>
            {data.outcomeMovedCount > 0 && (
              <p className="mb-3 font-annual text-body-sm text-text-tertiary">
                {data.outcomeMovedCount} of {data.actionOutcomes.length} tracked action
                {data.actionOutcomes.length === 1 ? '' : 's'} have a measured direction so
                far.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {data.actionOutcomes.map((o, idx) => (
                <Reveal key={o.id} staggerIndex={Math.min(idx, 10)}>
                  <ActionOutcomeRow outcome={o} />
                </Reveal>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ====================== SECONDARY AGENDA RAILS ==================== */}
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <Eyebrow ink="pursuit" as="h2" className="mb-4">
            Players to discuss
          </Eyebrow>
          {data.playersToDiscuss.length === 0 ? (
            <EditorsLetter
              ink="pursuit"
              title="No player carries open agenda pressure."
              body="Players surface here the moment an open, unresolved item names them."
            />
          ) : (
            <PaperCard className="divide-y divide-[color:var(--hairline)] p-0">
              {data.playersToDiscuss.map((p) => (
                <PlayerFocusRow key={p.playerId} focus={p} />
              ))}
            </PaperCard>
          )}
        </section>

        <section>
          <Eyebrow ink="pursuit" as="h2" className="mb-4">
            Data to verify
          </Eyebrow>
          {data.importIssues.length === 0 ? (
            <EditorsLetter
              ink="pursuit"
              title="No open import-quality issues."
              body="Ambiguous or low-confidence imports surface here so staff can verify before they enter the record."
            />
          ) : (
            <PaperCard className="divide-y divide-[color:var(--hairline)] p-0">
              {data.importIssues.map((iss) => (
                <ImportIssueRow key={iss.signalId} issue={iss} />
              ))}
            </PaperCard>
          )}
        </section>
      </div>

      {/* ==================== V2 SPEC: WINS SINCE LAST MEETING =========== */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconTrophy size={16} className="text-pursuit" aria-hidden />
            <Eyebrow ink="pursuit" as="h2">
              Wins since last meeting
            </Eyebrow>
          </div>
          {data.recentGameResults.length > 0 && (
            <span className="text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">Last 14 days</span>
          )}
        </div>
        {data.recentGameResults.length === 0 ? (
          <EditorsLetter ink="pursuit" title="No completed games in the last 14 days." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.recentGameResults.map((g, idx) => (
              <Reveal key={g.id} staggerIndex={Math.min(idx, 10)}>
                <GameResultRow game={g} />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* ==================== V2 SPEC: AVAILABILITY CONCERNS ============= */}
      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <IconShieldAlert size={16} className="text-pursuit" aria-hidden />
          <Eyebrow ink="pursuit" as="h2">
            Availability concerns
          </Eyebrow>
        </div>
        {data.availabilityConcerns.length === 0 ? (
          <EditorsLetter ink="pursuit" title="No current availability concerns — all players are ready." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.availabilityConcerns.map((a) => (
              <AvailabilityConcernRow key={a.id} concern={a} />
            ))}
          </div>
        )}
      </section>

      {/* ========= V2 SPEC: PRACTICE ATTENDANCE + LIFT COMPLIANCE ======== */}
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <IconCalendar size={16} className="text-pursuit" aria-hidden />
            <Eyebrow ink="pursuit" as="h2">
              Practice attendance
            </Eyebrow>
          </div>
          <AttendanceSummaryCard summary={data.attendanceSummary} />
        </section>
        <section>
          <div className="mb-4 flex items-center gap-2">
            <IconDumbbell size={16} className="text-pursuit" aria-hidden />
            <Eyebrow ink="pursuit" as="h2">
              Lift compliance
            </Eyebrow>
          </div>
          <LiftSummaryCard summary={data.liftSummary} />
        </section>
      </div>

      {/* ======== V2 SPEC: OPEN TASKS + ACADEMIC/TRAVEL CONFLICTS ======== */}
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <IconActivity size={16} className="text-pursuit" aria-hidden />
            <Eyebrow ink="pursuit" as="h2">
              Open tasks
            </Eyebrow>
          </div>
          {data.openTasks.length === 0 ? (
            <EditorsLetter ink="pursuit" title="No open staff tasks." />
          ) : (
            <PaperCard className="divide-y divide-[color:var(--hairline)] p-0">
              {data.openTasks.map((t) => (
                <OpenTaskRow key={t.id} task={t} />
              ))}
            </PaperCard>
          )}
        </section>
        <section>
          <div className="mb-4 flex items-center gap-2">
            <IconAirplane size={16} className="text-pursuit" aria-hidden />
            <Eyebrow ink="pursuit" as="h2">
              Academic &amp; travel conflicts
            </Eyebrow>
          </div>
          {data.conflicts.length === 0 ? (
            <EditorsLetter ink="pursuit" title="No open academic or travel conflicts." />
          ) : (
            <PaperCard className="divide-y divide-[color:var(--hairline)] p-0">
              {data.conflicts.map((c) => (
                <ConflictRow key={c.id} conflict={c} />
              ))}
            </PaperCard>
          )}
        </section>
      </div>

      {/* ============================ LEDGER PANE ========================= */}
      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        {/* Shared intelligence */}
        <section className="lg:col-span-2">
          <Eyebrow ink="pursuit" as="h2" className="mb-4">
            Shared intelligence
          </Eyebrow>
          {data.insights.length === 0 ? (
            <EditorsLetter
              ink="pursuit"
              title="No shared intelligence yet."
              body="Coaching insights for your team will appear here as your staff and AI surface them."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {data.insights.slice(0, 12).map((insight, idx) => (
                <Reveal key={insight.id} staggerIndex={Math.min(idx, 10)}>
                  <InsightCard insight={insight} />
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/* Decision Ledger */}
        <section>
          <Eyebrow ink="pursuit" as="h2" className="mb-4">
            Decision Ledger
          </Eyebrow>
          {data.ledger.length === 0 ? (
            <EditorsLetter ink="pursuit" title="Decisions you make in the room are recorded here." />
          ) : (
            <PaperCard className="divide-y divide-[color:var(--hairline)] p-0">
              {data.ledger.map((entry) => (
                <LedgerItem key={entry.id} entry={entry} />
              ))}
            </PaperCard>
          )}
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// Agenda pane pieces
// =============================================================================

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

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={handleKey}
      className={cn(
        'rounded-fw-md border text-left',
        pressableClass({ ink: 'pursuit' }),
        active
          ? 'border-pursuit bg-pursuit/[0.06]'
          : 'border-[color:var(--hairline)] bg-[var(--paper)]',
      )}
    >
      <HoverReveal
        className="flex w-full items-start gap-3 px-3 py-3"
        revealClassName="mt-1 flex w-4 shrink-0 justify-center"
        reveal={<IconChevronRight size={16} className="text-pursuit" aria-hidden />}
      >
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-fw-sm',
            item.severityHint === 'critical'
              ? 'bg-pursuit-deep/10 text-pursuit-deep'
              : isMeetingItem
                ? 'bg-pursuit/10 text-pursuit'
                : 'bg-[color:var(--hairline)]/60 text-text-tertiary',
          )}
        >
          {isMeetingItem ? <IconBolt size={15} /> : <IconAlertCircle size={15} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-annual text-body-lg text-text-primary">{item.title}</p>
            {discussed && <InkBadge label="Discussed" tone="neutral" variant="soft" />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {severityBadge(item.severityHint)}
            {item.playerName && (
              <span className="truncate text-eyebrow text-text-tertiary">{item.playerName}</span>
            )}
            <span className="text-eyebrow tabular-nums text-text-tertiary">
              · {item.sourceRefCount} src
            </span>
          </div>
        </div>
      </HoverReveal>
    </div>
  );
}

// --- Ceremony: the decision-made stamp. `<CommitSeal label="DECIDED">`
// presses over the pane for one PACE.cinematic beat (spec §4.4 #5 "STAMP
// PRESS", §9 north-star #2) right after a resolve / decision-note mutation
// succeeds, before the item leaves the agenda and the pane re-keys. ---------
function DecisionSeal({ label }: { label: string }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--paper)]/92 backdrop-blur-[1px]"
    >
      <CommitSeal label={label} size="md" />
    </div>
  );
}

function AgendaDetailPane({ item, onDone }: { item: DecisionRoomAgendaItem; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'idle' | 'resolve' | 'note' | 'task' | 'practice'>('idle');
  const [text, setText] = useState('');
  const [sealed, setSealed] = useState<string | null>(null);
  const isMeetingItem = item.kind === 'meeting_item';
  const discussed = item.status === 'discussed';

  function run(
    fn: () => Promise<{ success: boolean; error?: string }>,
    okMsg: string,
    sealLabel?: string,
  ) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.success) {
          toast.error('Could not complete that', res.error);
          return;
        }
        if (sealLabel) {
          // Ceremony: press the seal, THEN settle the mode/refresh — the
          // pane holds the "decided" moment for one cinematic beat before
          // the item leaves the agenda.
          setSealed(sealLabel);
          window.setTimeout(() => {
            toast.success(okMsg);
            setMode('idle');
            setText('');
            setSealed(null);
            onDone();
          }, PACE.cinematic * 1000);
        } else {
          toast.success(okMsg);
          setMode('idle');
          setText('');
          onDone();
        }
      } catch {
        toast.error('Something went wrong', 'Please try again.');
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
    run(() => resolveMeetingItem({ itemId: item.id, resolution: text }), 'Resolved', 'DECIDED');
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
      'DECIDED',
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
    <PaperCard registrationTick className="relative p-6 lg:sticky lg:top-4">
      {sealed ? <DecisionSeal label={sealed} /> : null}

      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-sm',
            item.severityHint === 'critical'
              ? 'bg-pursuit-deep/10 text-pursuit-deep'
              : 'bg-pursuit/10 text-pursuit',
          )}
        >
          {isMeetingItem ? <IconBolt size={18} /> : <IconAlertCircle size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-annual text-h2 font-semibold leading-tight text-text-primary">{item.title}</h3>
            {severityBadge(item.severityHint)}
            {isMeetingItem ? (
              <InkBadge label="On agenda" tone="pursuit" variant="soft" />
            ) : (
              <InkBadge label="Open signal" tone="neutral" variant="soft" />
            )}
            {discussed && <InkBadge label="Discussed" tone="neutral" variant="soft" />}
          </div>
          {item.playerName && (
            <p className="mt-1 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
              Subject: {item.playerName}
            </p>
          )}
        </div>
      </div>

      {item.detail && (
        <p className="mb-5 max-w-prose font-annual text-body-lg leading-relaxed text-text-secondary">
          {item.detail}
        </p>
      )}

      {/* Source-backed evidence. `sourceRefs` may arrive null/undefined if a
          row's jsonb column is absent — guard so a missing evidence array
          renders the "no structured sources" note instead of throwing. */}
      <div className="mb-5">
        <Eyebrow ink="pursuit" className="mb-2">
          Evidence · {item.sourceRefCount} source{item.sourceRefCount === 1 ? '' : 's'}
        </Eyebrow>
        {(item.sourceRefs ?? []).length === 0 ? (
          <p className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3 font-annual text-body-sm text-text-tertiary">
            No structured sources attached. Decide with caution — this item is not
            backed by cited data.
          </p>
        ) : (
          <PaperCard grain={false} className="divide-y divide-[color:var(--hairline)] p-0">
            {(item.sourceRefs ?? []).map((ref, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="truncate font-annual text-body-sm capitalize text-text-secondary">
                  {ref.label}
                </span>
                {ref.detail && (
                  <span className="shrink-0 font-annual text-microbadge tabular-nums text-text-tertiary">
                    {ref.detail}
                  </span>
                )}
              </div>
            ))}
          </PaperCard>
        )}
      </div>

      {/* Inline text capture for resolve / note / task / practice */}
      {mode !== 'idle' && (
        <div className="mb-4">
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
            className="w-full bg-[var(--paper)]"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<IconX size={14} />}
              onClick={() => {
                setMode('idle');
                setText('');
              }}
            >
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
        <div className="flex flex-wrap gap-2 border-t border-[color:var(--hairline)] pt-4">
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
            <Button variant="outline" size="sm" leftIcon={<IconCalendar size={14} />} onClick={() => setMode('practice')}>
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
    </PaperCard>
  );
}

// =============================================================================
// Ledger pane pieces
// =============================================================================

function PlayerFocusRow({ focus }: { focus: DecisionRoomPlayerFocus }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pursuit/10 font-annual text-body-sm font-semibold text-pursuit">
          {focus.name.slice(0, 1).toUpperCase()}
        </div>
        <p className="truncate font-annual text-body-lg text-text-primary">{focus.name}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {focus.criticalCount > 0 && (
          <InkBadge label={`${focus.criticalCount} critical`} tone="pursuit" variant="solid" />
        )}
        <InkBadge label={`${focus.openCount} open`} tone="neutral" variant="soft" />
      </div>
    </div>
  );
}

function ImportIssueRow({ issue }: { issue: DecisionRoomImportIssue }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        {severityBadge(issue.severity)}
        <p className="truncate font-annual text-body-lg text-text-primary">{issue.title}</p>
      </div>
      {issue.detail && (
        <p className="mt-1 line-clamp-2 font-annual text-body-sm text-text-tertiary">{issue.detail}</p>
      )}
    </div>
  );
}

function EffectivenessReviewRow({ review }: { review: DecisionRoomEffectivenessReview }) {
  const pres = effectivenessPresentation(review.direction);
  return (
    <PaperCard className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <GradeTag band={pres.band} label={pres.label} />
        <DirectionGlyph glyph={pres.glyph} />
        <span className="inline-flex items-center gap-1 text-eyebrow text-text-tertiary">
          <IconGauge size={12} aria-hidden />
          Correlated — not proven
        </span>
      </div>
      <h3 className="font-annual text-body-lg font-semibold text-text-primary">{review.focusArea}</h3>
      <p className="mt-0.5 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
        {review.metricLabel}
        {review.practiceTitle ? ` · ${review.practiceTitle}` : ''}
      </p>
      <p className="mt-2 line-clamp-3 font-annual text-body-sm leading-relaxed text-text-secondary">
        {review.conclusion}
      </p>
      {review.recommendedLabel && (
        <p className="mt-2 flex items-start gap-1.5 font-annual text-body-sm text-text-secondary">
          <IconSparkles size={13} className="mt-0.5 shrink-0 text-pursuit" aria-hidden />
          <span className="font-medium">{review.recommendedLabel}</span>
        </p>
      )}
    </PaperCard>
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
    <PaperCard className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1">
          <GradeTag band={pres.band} label={pres.label} />
          <DirectionGlyph glyph={pres.glyph} />
        </span>
        {outcome.measured && sampleN > 0 && (
          <span className="text-eyebrow tabular-nums text-text-tertiary">
            {sampleN} game{sampleN === 1 ? '' : 's'} since
          </span>
        )}
      </div>
      <h3 className="truncate font-annual text-body-lg font-semibold text-text-primary">{outcome.title}</h3>
      <p className="mt-0.5 truncate text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
        {outcome.metricLabel ?? 'No tracked metric'}
        {outcome.playerName ? ` · ${outcome.playerName}` : ''}
      </p>

      {/* The did-it-move read: baseline → observed (only when measured). */}
      {outcome.measured && outcome.metricLabel ? (
        <div className="mt-3 flex items-center gap-2">
          <StatReadout value={baseline} className="text-body-sm text-text-tertiary" />
          <IconArrowRight size={13} className="shrink-0 text-text-tertiary" aria-hidden />
          <StatReadout value={observed} className="text-body-lg font-semibold text-text-primary" />
          {isTooEarly && (
            <span className="font-annual text-body-sm text-text-tertiary">· need 2+ games to call it</span>
          )}
        </div>
      ) : (
        <p className="mt-3 font-annual text-body-sm text-text-tertiary">
          {outcome.metricLabel ? 'Awaiting the next games to re-measure.' : 'Tracked without a measurable metric.'}
        </p>
      )}
    </PaperCard>
  );
}

function InsightCard({ insight }: { insight: DecisionRoomInsight }) {
  const isResolved = insight.status === 'resolved' || insight.status === 'dismissed';
  return (
    <PaperCard className={cn('p-4', isResolved && 'opacity-70')}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h3 className="font-annual text-body-lg font-semibold text-text-primary">{insight.title}</h3>
        {priorityBadge(insight.priority)}
        {isResolved && <InkBadge label="Resolved" tone="neutral" variant="soft" />}
      </div>
      {insight.body && (
        <p className="font-annual text-body-sm leading-relaxed text-text-secondary">{insight.body}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
        <span>{insight.insightType.replace(/_/g, ' ')}</span>
        {insight.authorName && <span>· {insight.authorName}</span>}
        {insight.createdAt && (
          <span className="inline-flex items-center gap-1 normal-case tracking-normal">
            <IconClock size={12} aria-hidden />
            {relativeTime(insight.createdAt)}
          </span>
        )}
      </div>
    </PaperCard>
  );
}

function LedgerItem({ entry }: { entry: DecisionRoomLedgerEntry }) {
  const isInvite = entry.kind === 'invite_accepted' || entry.kind === 'invite_pending';
  const isResolved = entry.kind === 'resolved';
  const accepted = entry.kind === 'invite_accepted';

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {isResolved ? (
        <CommitSeal label="DECIDED" size="sm" className="shrink-0" />
      ) : (
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            isInvite
              ? accepted
                ? 'bg-pursuit/10 text-pursuit'
                : 'bg-[color:var(--hairline)]/60 text-text-tertiary'
              : 'bg-pursuit/10 text-pursuit',
          )}
        >
          {isInvite ? (
            accepted ? <IconCheckCircle2 size={15} /> : <IconUserPlus size={15} />
          ) : (
            <IconNote size={15} />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-annual text-body-sm font-medium text-text-primary">{entry.label}</p>
          {!isInvite && <InkBadge label={LEDGER_GLYPH[entry.kind]} tone="pursuit" variant="soft" />}
        </div>
        {entry.detail && (
          <p className="truncate font-annual text-body-sm text-text-tertiary">{entry.detail}</p>
        )}
        <p className="mt-0.5 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
          {relativeTime(entry.at)}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// V2 SPEC sub-components: wins, availability, attendance, lift, tasks, conflicts
// =============================================================================

function GameResultRow({ game }: { game: DecisionRoomGameResult }) {
  const hasScore = game.ourScore != null && game.opponentScore != null;
  const band: GradeBand = game.result === 'win' ? 'plus' : game.result === 'loss' ? 'low' : 'avg';
  const resultLabel = game.result === 'win' ? 'W' : game.result === 'loss' ? 'L' : hasScore ? 'T' : 'Final';
  const homeAway = game.homeAway === 'home' ? 'vs' : game.homeAway === 'away' ? '@' : '';
  return (
    <PaperCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <GradeTag band={band} label={resultLabel} />
        <p className="flex items-center gap-1 text-eyebrow tabular-nums text-text-tertiary">
          <IconCalendar size={12} aria-hidden />
          {new Date(game.gameDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </p>
      </div>
      <p className="mt-2 truncate font-annual text-body-lg font-semibold text-text-primary">
        {homeAway && <span className="mr-1 text-text-tertiary">{homeAway}</span>}
        {game.opponentName ?? 'Opponent'}
      </p>
      {hasScore && (
        <StatReadout
          value={`${game.ourScore} – ${game.opponentScore}`}
          className="mt-1 text-body-lg text-text-secondary"
        />
      )}
    </PaperCard>
  );
}

function AvailabilityConcernRow({ concern }: { concern: DecisionRoomAvailabilityConcern }) {
  const band: GradeBand = concern.status === 'out' ? 'low' : concern.status === 'limited' ? 'avg' : 'plus';
  return (
    <div className="flex items-start gap-3 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pursuit/10 text-pursuit">
        <IconShieldAlert size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-annual text-body-lg text-text-primary">
            {concern.playerName ?? 'Unknown player'}
          </p>
          <GradeTag band={band} label={concern.status} />
        </div>
        {concern.reasonCategory && (
          <p className="mt-0.5 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            {concern.reasonCategory.replace(/_/g, ' ')}
          </p>
        )}
        {concern.note && (
          <p className="mt-1 line-clamp-2 font-annual text-body-sm text-text-tertiary">{concern.note}</p>
        )}
        <p className="mt-1.5 flex items-center gap-1 font-annual text-body-sm text-text-tertiary">
          <IconClock size={12} aria-hidden />
          Since {new Date(concern.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {concern.endsAt && (
            <>
              {' '}
              · Until {new Date(concern.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** A static (non-animated) proportion bar banded plus/avg/low by the grade ramp. */
function ProportionBar({ pct, band }: { pct: number; band: GradeBand }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--hairline)]">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: GRADE_VAR[band] }}
      />
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
    <PaperCard className="p-5">
      {!hasData ? (
        <p className="font-annual text-body-sm text-text-tertiary">No attendance data in the last 14 days.</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <RuledStatLine label="Practices" value={summary.totalPractices} ink="pursuit" size="row" />
            <RuledStatLine label="Present" value={summary.totalAttended} ink="pursuit" size="row" />
            <RuledStatLine
              label="Missed"
              value={summary.totalMissed}
              ink="pursuit"
              size="row"
              emphasis={summary.totalMissed > 0}
            />
          </div>
          {pct != null && <ProportionBar pct={pct} band="plus" />}
          {summary.concernedPlayers.length > 0 && (
            <div className="mt-4">
              <Eyebrow ink="pursuit" className="mb-2">
                Attendance concerns
              </Eyebrow>
              <ul className="flex flex-col gap-1.5">
                {summary.concernedPlayers.map((p) => (
                  <li key={p.playerId} className="flex items-center justify-between gap-2">
                    <span className="truncate font-annual text-body-sm text-text-secondary">
                      {p.playerName ?? 'Unknown'}
                    </span>
                    <InkBadge label={`${p.missedCount} missed`} tone="pursuit" variant="soft" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </PaperCard>
  );
}

function LiftSummaryCard({ summary }: { summary: DecisionRoomLiftSummary }) {
  const hasData = summary.scheduledCount > 0;
  const pct = hasData ? Math.round((summary.completedCount / summary.scheduledCount) * 100) : null;
  const band: GradeBand = pct != null ? (pct >= 80 ? 'plus' : pct >= 60 ? 'avg' : 'low') : 'avg';
  return (
    <PaperCard className="p-5">
      {!hasData ? (
        <p className="font-annual text-body-sm text-text-tertiary">
          No lift sessions scheduled in the last 14 days.
        </p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <RuledStatLine label="Completed" value={summary.completedCount} ink="pursuit" size="row" />
            <RuledStatLine label="Scheduled" value={summary.scheduledCount} ink="pursuit" size="row" />
          </div>
          {pct != null && (
            <>
              <ProportionBar pct={pct} band={band} />
              <p className="mb-3 mt-1.5 text-eyebrow tabular-nums text-text-tertiary">
                {pct}% completion rate
              </p>
            </>
          )}
          {summary.nonCompliantPlayers.length > 0 && (
            <div>
              <Eyebrow ink="pursuit" className="mb-2">
                Missed sessions
              </Eyebrow>
              <ul className="flex flex-col gap-1.5">
                {summary.nonCompliantPlayers.map((p) => (
                  <li key={p.playerId} className="flex items-center justify-between gap-2">
                    <span className="truncate font-annual text-body-sm text-text-secondary">
                      {p.playerName ?? 'Unknown'}
                    </span>
                    <InkBadge label={`${p.missedCount} missed`} tone="pursuit" variant="soft" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </PaperCard>
  );
}

function OpenTaskRow({ task }: { task: DecisionRoomOpenTask }) {
  const isOverdue = task.dueDate ? new Date(task.dueDate) < new Date() : false;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-annual text-body-lg text-text-primary">{task.title}</p>
        {task.dueDate && (
          <p
            className={cn(
              'mt-0.5 flex items-center gap-1 font-annual text-body-sm',
              isOverdue ? 'text-pursuit-deep' : 'text-text-tertiary',
            )}
          >
            <IconClock size={12} aria-hidden />
            {isOverdue ? 'Overdue · ' : ''}
            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {task.priority && priorityBadge(task.priority)}
        <InkBadge label={task.status.replace(/_/g, ' ')} tone="neutral" variant="soft" />
      </div>
    </div>
  );
}

function ConflictRow({ conflict }: { conflict: DecisionRoomConflict }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">{severityBadge(conflict.severity)}</div>
        <div className="min-w-0">
          <p className="truncate font-annual text-body-lg text-text-primary">
            {conflict.playerName ?? 'Unknown'} —{' '}
            {conflict.obligationLabel ?? conflict.obligationKind.replace(/_/g, ' ')}
          </p>
          {conflict.whyItMatters && (
            <p className="mt-0.5 line-clamp-2 font-annual text-body-sm text-text-tertiary">
              {conflict.whyItMatters}
            </p>
          )}
          {conflict.recommendedActionLabel && (
            <p className="mt-1 flex items-center gap-1 font-annual text-body-sm font-medium text-pursuit">
              <IconAirplane size={11} className="shrink-0" aria-hidden />
              {conflict.recommendedActionLabel}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default StaffDecisionRoomFairway;
