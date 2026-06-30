'use client';

/**
 * ============================================================================
 * FairwayAspectDrillDown — the TEAM aspect command panel (coach · flag-gated)
 * ----------------------------------------------------------------------------
 * Opened from the Team Brief's Strengths/Weaknesses split when a coach taps one
 * of the five skill areas. One modal turns "the team is weak/strong at X" into
 * four wired actions, all keyed off that single area:
 *
 *   1. WHO  — the contributing players (this area's roster breakdown), each a
 *             link into the player's own CoachHelm, plus a jump to Signals.
 *   2. GOAL — assign a TEAM goal for the area (fan-out of per-player goals via
 *             createTeamGoal): pick players, optional SG target, due date, mode.
 *   3. PLAN — generate a 7-day practice plan for the area (generateTeamPracticeRx
 *             → composePracticeRx). Rendered inline; serialized to markdown.
 *   4. SHIP — save the plan to Documents (saveTextDocument) AND/OR schedule it as
 *             a practice on the Calendar (createGolfEvent), optionally attaching
 *             the saved plan document (attachDocumentToEvent).
 *
 * All four are real server actions — no fabrication, no placeholder wiring. The
 * panel degrades honestly: no roster stats → goal assignment is disabled with a
 * note; no drills tagged to the area → the plan action reports it; the document
 * action is gated until a plan exists.
 *
 * ADDITIVE + GATED — mounted only by FairwayBrief (behind isRedesignEnabled()).
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button } from '@/components/fairway/controls/button';
import { Badge } from '@/components/fairway/controls/badge';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Inset } from '@/components/fairway/surfaces';
import {
  FormSection,
  FormField,
  Input,
  NumberField,
  Checkbox,
} from '@/components/fairway/forms';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconActivity,
  IconChevronRight,
  IconArrowRight,
  IconWarning,
  IconTarget,
  IconClipboard,
  IconCalendar,
  IconFile,
} from '@/components/icons';
import type { PlayerCategoryStat } from '@/app/golf/actions/team-category-insights';
import {
  metricForArea,
  areaLowerIsBetter,
  AREA_VALUE_FORMAT,
  AREA_METRIC_LABEL,
} from '@/lib/coachhelm/v3/practice-rx/area-metric-map';
import {
  generateTeamPracticeRx,
  type TeamPracticeRxResult,
} from '@/app/golf/actions/v3/team-practice-rx';
import { createTeamGoal } from '@/app/golf/actions/v3/goals';
import { saveTextDocument } from '@/app/golf/actions/documents';
import { createGolfEvent } from '@/app/golf/actions/golf';
import { attachDocumentToEvent } from '@/app/golf/actions/event-documents';
import { planToMarkdown } from './plan-markdown';
import { logError } from '@/lib/error-logging';

/* ──────────────────────────────────────────────────────────────────────────
 * The aspect handed in by the Brief — a flattened, presentation-ready view of
 * one ranked category. Kept minimal so the Brief↔panel coupling is just data.
 * ────────────────────────────────────────────────────────────────────────── */
export interface AspectDrillDownTarget {
  /** Category id ('driving' | 'approach' | 'short_game' | 'putting' | 'scoring'). */
  categoryId: string;
  /** Compact label ("Driving"). */
  label: string;
  /** Fuller phrase ("Driving", "Approach play"). */
  long: string;
  /** 0–100 team rating. */
  rating: number;
  /** Strength (≥ mid-line) or weakness (< mid-line). */
  kind: 'strength' | 'weakness';
  /** This area's roster breakdown (may be empty when no category stats exist). */
  players: PlayerCategoryStat[];
  /** The category's primary metric display label — a human label, e.g. 'GIR %'. */
  primaryMetric?: string;
}

export interface FairwayAspectDrillDownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aspect: AspectDrillDownTarget | null;
  teamId: string;
}

const MODE_OPTIONS = [
  { value: 'suggested', label: 'Suggest' },
  { value: 'mandatory', label: 'Assign' },
] as const;

/** yyyy-mm-dd for an offset from today (client-side — Date is fine here). */
function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function signalsHref(categoryId: string): string {
  const token = categoryId === 'driving' ? 'tee' : categoryId;
  return `/golf/dashboard/insights?category=${encodeURIComponent(token)}`;
}

export function FairwayAspectDrillDown({
  open,
  onOpenChange,
  aspect: aspectProp,
  teamId,
}: FairwayAspectDrillDownProps) {
  const router = useRouter();

  // Retain the last non-null aspect so the ModalShell stays mounted through its
  // exit tween after the parent clears `aspect` on close — AnimatePresence can
  // only animate out while still mounted (mirrors FocusAreaModal). `aspectProp`
  // drives it (flicker-free open); `lastAspect` only covers the closing frame.
  const [lastAspect, setLastAspect] = React.useState<AspectDrillDownTarget | null>(aspectProp);
  React.useEffect(() => {
    if (aspectProp) setLastAspect(aspectProp);
  }, [aspectProp]);
  const aspect = aspectProp ?? lastAspect;

  // ── Goal state ───────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [target, setTarget] = React.useState<number | null>(null);
  const [dueDate, setDueDate] = React.useState<string>(isoDateOffset(30));
  const [mode, setMode] = React.useState<'suggested' | 'mandatory'>('suggested');
  const [goalBusy, setGoalBusy] = React.useState(false);

  // ── Plan state ───────────────────────────────────────────────────────────
  const [planBusy, setPlanBusy] = React.useState(false);
  const [plan, setPlan] = React.useState<TeamPracticeRxResult | null>(null);

  // ── Document state ─────────────────────────────────────────────────────────
  const [docBusy, setDocBusy] = React.useState(false);
  const [savedDocId, setSavedDocId] = React.useState<string | null>(null);
  // Coach-controlled: is the saved plan visible to players, or coach-only?
  const [playerVisible, setPlayerVisible] = React.useState(true);

  // ── Schedule state ─────────────────────────────────────────────────────────
  const [schedDate, setSchedDate] = React.useState<string>(isoDateOffset(1));
  const [schedStart, setSchedStart] = React.useState<string>('15:00');
  const [schedEnd, setSchedEnd] = React.useState<string>('16:30');
  const [attachDoc, setAttachDoc] = React.useState(true);
  const [schedBusy, setSchedBusy] = React.useState(false);

  // ── Success sentinels — the modal stays open so a coach can chain actions,
  //    but a completed assign/schedule is made idempotent (createGolfEvent /
  //    the goal fan-out are NOT idempotent → re-click would duplicate).
  const [goalDone, setGoalDone] = React.useState(false);
  const [scheduleDone, setScheduleDone] = React.useState(false);

  // Reset the whole flow whenever the panel re-opens on a (possibly new) aspect.
  const aspectKey = aspect ? `${aspect.categoryId}:${open}` : '';
  React.useEffect(() => {
    if (!open || !aspect) return;
    // Default goal recipients: who's dragging it (weakness) or the whole roster
    // (strength). Falls back to everyone with stats when no one is flagged.
    const flagged = aspect.players.filter((p) => p.needsAttention).map((p) => p.playerId);
    const everyone = aspect.players.map((p) => p.playerId);
    const initial =
      aspect.kind === 'weakness' && flagged.length > 0 ? flagged : everyone;
    setSelectedIds(new Set(initial));
    setTarget(null);
    setDueDate(isoDateOffset(30));
    setMode('suggested');
    setPlan(null);
    setSavedDocId(null);
    setPlayerVisible(true);
    setSchedDate(isoDateOffset(1));
    setSchedStart('15:00');
    setSchedEnd('16:30');
    setAttachDoc(true);
    setGoalDone(false);
    setScheduleDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectKey]);

  if (!aspect) return null;

  const metricId = metricForArea(aspect.categoryId);
  const metricLabel = AREA_METRIC_LABEL[aspect.categoryId] ?? 'Strokes gained';
  const lowerBetter = areaLowerIsBetter(aspect.categoryId);
  const fmtValue = AREA_VALUE_FORMAT[aspect.categoryId] ?? ((v: number) => v.toFixed(1));
  const hasPlayers = aspect.players.length > 0;
  const planTitle = `Team practice — ${aspect.long}`;
  // short_game has no per-round series (scrambling can't be derived per round),
  // so every player returns trend 'stable' / delta 0 — suppress the trend column
  // there rather than implying a real "steady · 0" read.
  const trendAvailable = aspect.categoryId !== 'short_game';

  // Sorted breakdown: best first (direction-aware), so "who's leading / dragging"
  // reads top-to-bottom the way a coach scans a leaderboard.
  const sortedPlayers = [...aspect.players].sort((a, b) =>
    lowerBetter ? a.value - b.value : b.value - a.value,
  );

  const togglePlayer = (playerId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(playerId);
      else next.delete(playerId);
      return next;
    });
    setGoalDone(false); // a deliberate roster change re-arms the assign button
  };

  const planMarkdown = (): string | null => {
    if (!plan?.ok || !plan.plan) return null;
    return planToMarkdown({
      areaLabel: aspect.long,
      kind: aspect.kind,
      plan: plan.plan,
      drills: plan.drills ?? [],
    });
  };

  // ── Action: assign team goal ───────────────────────────────────────────────
  const handleAssignGoal = async () => {
    if (!metricId) {
      fairwayToast.danger('This area has no trackable metric.');
      return;
    }
    const ids = [...selectedIds];
    if (ids.length === 0) {
      fairwayToast.danger('Pick at least one player to assign.');
      return;
    }
    setGoalBusy(true);
    try {
      const res = await createTeamGoal({
        metric_id: metricId,
        title: `Team: improve ${aspect.long.toLowerCase()}`,
        category: 'team',
        ends_at: new Date(`${dueDate}T23:59:59`).toISOString(),
        target_value: target,
        target_source: target != null ? 'manual' : null,
        coach_assignment_mode: mode,
        team_id: teamId,
        player_ids: ids,
        origin: 'manual',
      });
      if (res.ok) {
        const warn = res.warning === 'soft_cap_exceeded' ? ' (some players are over the goal soft-cap)' : '';
        const failNote = res.failed.length > 0 ? ` · ${res.failed.length} skipped` : '';
        // Honest wording: 'suggested' goals must be ACCEPTED by the player;
        // only 'mandatory' goals are auto-assigned. Don't say "assigned" for a
        // suggestion the player hasn't seen yet.
        const verb = mode === 'mandatory' ? 'assigned to' : 'suggested to';
        const tail = mode === 'mandatory' ? '' : ' — they’ll accept or decline';
        const n = res.created;
        fairwayToast.success(`Team goal ${verb} ${n} player${n === 1 ? '' : 's'}${failNote}${warn}${tail}`);
        setGoalDone(true);
        router.refresh();
      } else {
        fairwayToast.danger(res.error ?? 'Could not assign the team goal.');
      }
    } catch {
      fairwayToast.danger('Could not assign the team goal.');
    } finally {
      setGoalBusy(false);
    }
  };

  // ── Action: generate practice plan ─────────────────────────────────────────
  const handleGeneratePlan = async () => {
    setPlanBusy(true);
    setSavedDocId(null);
    try {
      const res = await generateTeamPracticeRx({
        team_id: teamId,
        area_id: aspect.categoryId,
        area_label: aspect.long,
      });
      setPlan(res);
      if (!res.ok) {
        fairwayToast.danger(res.error ?? 'Could not generate a plan.');
      } else {
        fairwayToast.success('Practice plan ready.');
      }
    } catch {
      setPlan({ ok: false, error: 'Could not generate a plan.' });
      fairwayToast.danger('Could not generate a plan.');
    } finally {
      setPlanBusy(false);
    }
  };

  // ── Action: save plan to documents ─────────────────────────────────────────
  const handleSaveDocument = async (): Promise<string | null> => {
    const md = planMarkdown();
    if (!md) {
      fairwayToast.danger('Generate a plan first.');
      return null;
    }
    if (savedDocId) return savedDocId; // already saved this plan
    setDocBusy(true);
    try {
      const res = await saveTextDocument(teamId, planTitle, md, {
        description: `CoachHelm practice plan for ${aspect.long.toLowerCase()}`,
        category: 'practice_plan',
        playerVisible,
      });
      if (res.data) {
        setSavedDocId(res.data.id);
        fairwayToast.success('Saved to Documents.');
        return res.data.id;
      }
      fairwayToast.danger(res.error ?? 'Could not save the document.');
      return null;
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), {
        component: 'FairwayAspectDrillDown',
        action: 'savePracticeDoc',
      }, 'medium');
      fairwayToast.danger('Could not save the document.');
      return null;
    } finally {
      setDocBusy(false);
    }
  };

  // ── Action: schedule practice (+ optional doc attach) ──────────────────────
  const handleSchedule = async () => {
    if (!schedDate) {
      fairwayToast.danger('Pick a date for the practice.');
      return;
    }
    setSchedBusy(true);
    try {
      const allDay = !schedStart;
      const ev = await createGolfEvent({
        title: planTitle,
        eventType: 'practice',
        startDate: schedDate,
        endDate: schedDate,
        startTime: allDay ? undefined : schedStart,
        endTime: allDay ? undefined : schedEnd || undefined,
        allDay,
        description: `CoachHelm practice — ${aspect.long}.`,
        timezoneOffset: new Date().getTimezoneOffset(),
      });
      if (!ev.success) {
        fairwayToast.danger(ev.error ?? 'Could not create the practice.');
        return;
      }
      const eventId = ev.data.eventId;
      // The event now exists → mark done so a re-click can't create a duplicate,
      // regardless of how the optional document attach resolves.
      setScheduleDone(true);
      // Optionally attach the plan document (saving it first if needed). Any
      // failure downgrades the success message rather than silently claiming
      // a clean attach.
      let attachNote = '';
      if (attachDoc && plan?.ok) {
        const docId = savedDocId ?? (await handleSaveDocument());
        if (!docId) {
          attachNote = ' — but the plan document could not be saved/attached';
        } else {
          const at = await attachDocumentToEvent(eventId, docId);
          if (!at.success) attachNote = ' — but the plan document could not be attached';
        }
      }
      if (attachNote) {
        fairwayToast.info(`Practice scheduled${attachNote}.`);
      } else {
        fairwayToast.success('Practice added to the calendar.');
      }
      router.refresh();
    } catch {
      fairwayToast.danger('Could not create the practice.');
    } finally {
      setSchedBusy(false);
    }
  };

  const planReady = plan?.ok === true && Boolean(plan.plan);
  const planDays = planReady ? [...(plan!.plan!.days)].sort((a, b) => a.day - b.day) : [];
  const drillById = new Map((plan?.drills ?? []).map((d) => [d.id, d]));

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size="full"
      title={aspect.long}
      description={`${aspect.kind === 'strength' ? 'Team strength' : 'Team weakness'} · ${aspect.rating}/100`}
    >
      <ModalShell.Body>
        <div className="flex flex-col gap-7">
          {/* ── Header chips ─────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={aspect.kind === 'strength' ? 'success' : 'warning'}>
              {aspect.kind === 'strength' ? 'Strength' : 'Needs work'}
            </Badge>
            <Badge tone="neutral">{aspect.rating} / 100</Badge>
            {aspect.primaryMetric ? (
              <span className="font-fw-sans text-caption text-text-tertiary">
                {aspect.primaryMetric}
              </span>
            ) : null}
          </div>

          {/* ── 1 · WHO — contributing players ───────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionLabel
              title="Who's contributing"
              hint={lowerBetter ? 'Lower is better' : 'Higher is better'}
            />
            {hasPlayers ? (
              <Inset padding="none" className="overflow-hidden">
                <ul className="divide-y divide-border-subtle">
                  {sortedPlayers.map((p, i) => {
                    const TrendIcon =
                      p.trend === 'improving'
                        ? IconTrendingUp
                        : p.trend === 'declining'
                          ? IconTrendingDown
                          : IconActivity;
                    const trendColor =
                      p.trend === 'improving'
                        ? 'text-fw-success'
                        : p.trend === 'declining'
                          ? 'text-fw-warning'
                          : 'text-text-tertiary';
                    return (
                      <li key={p.playerId}>
                        <Link
                          href={`/golf/dashboard/players/${p.playerId}`}
                          className={cn(
                            'group flex items-center gap-3 px-4 py-3',
                            'transition-colors duration-fast ease-soft hover:bg-surface-sunken/60',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                          )}
                        >
                          <span className="w-5 shrink-0 text-right font-fw-mono text-caption tabular-nums text-text-tertiary">
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                            {p.playerName}
                          </span>
                          <span className="shrink-0 font-fw-mono text-body-sm tabular-nums text-text-secondary">
                            {fmtValue(p.value)}
                          </span>
                          {trendAvailable ? (
                            <span className={cn('flex w-12 shrink-0 items-center justify-end gap-0.5 font-fw-mono text-caption tabular-nums', trendColor)}>
                              <TrendIcon size={13} aria-hidden />
                              <span>{p.trendDelta > 0 ? '+' : ''}{p.trendDelta}</span>
                              <span className="sr-only"> trend {p.trend}</span>
                            </span>
                          ) : (
                            <span className="w-12 shrink-0" aria-hidden />
                          )}
                          <span className="w-4 shrink-0">
                            {p.needsAttention ? (
                              <>
                                <IconWarning size={15} className="text-fw-warning" aria-hidden />
                                <span className="sr-only">{p.playerName} needs attention</span>
                              </>
                            ) : null}
                          </span>
                          <IconChevronRight size={15} className="shrink-0 text-text-tertiary group-hover:text-text-secondary" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Inset>
            ) : (
              <Inset padding="md">
                <p className="font-fw-sans text-body-sm text-text-secondary">
                  No per-player stats for this area yet — they appear as the team logs scored rounds.
                </p>
              </Inset>
            )}
            {hasPlayers && !trendAvailable ? (
              <p className="font-fw-sans text-caption text-text-tertiary">
                Per-round trend isn’t available for short game (scrambling can’t be derived per round).
              </p>
            ) : null}
            <div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={signalsHref(aspect.categoryId)}>
                  <span>Open in Signals</span>
                  <IconArrowRight size={15} />
                </Link>
              </Button>
            </div>
          </section>

          {/* ── 2 · GOAL — assign a team goal ────────────────────────────── */}
          <FormSection
            title="Assign a team goal"
            description={
              metricId
                ? `Creates a ${metricLabel} goal for each selected player. Tracked automatically as rounds come in.`
                : 'This area has no trackable metric, so a team goal can’t be assigned.'
            }
          >
            {metricId && hasPlayers ? (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={`Target ${metricLabel}`} help="Strokes gained vs the field — e.g. +0.5. Leave blank to set later." showOptional>
                    <NumberField
                      value={target}
                      onValueChange={(v) => { setTarget(v); setGoalDone(false); }}
                      step={0.1}
                      unit="SG"
                    />
                  </FormField>
                  <FormField label="Due date">
                    <Input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setGoalDone(false); }} />
                  </FormField>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                    Assign to ({selectedIds.size})
                  </span>
                  <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    {sortedPlayers.map((p) => (
                      <Checkbox
                        key={p.playerId}
                        label={p.playerName}
                        checked={selectedIds.has(p.playerId)}
                        onCheckedChange={(checked) => togglePlayer(p.playerId, Boolean(checked))}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-fw-sans text-caption text-text-tertiary">Mode</span>
                    <Segmented
                      aria-label="Assignment mode"
                      options={MODE_OPTIONS}
                      value={mode}
                      onValueChange={(v) => { setMode(v as 'suggested' | 'mandatory'); setGoalDone(false); }}
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    busy={goalBusy}
                    disabled={selectedIds.size === 0 || goalDone}
                    onClick={handleAssignGoal}
                  >
                    <IconTarget size={16} />
                    <span>
                      {goalDone
                        ? mode === 'mandatory' ? 'Assigned' : 'Suggested'
                        : `${mode === 'mandatory' ? 'Assign' : 'Suggest'} to ${selectedIds.size} player${selectedIds.size === 1 ? '' : 's'}`}
                    </span>
                  </Button>
                </div>
              </div>
            ) : (
              <Inset padding="md">
                <p className="font-fw-sans text-body-sm text-text-secondary">
                  {metricId
                    ? 'No players with stats in this area yet — add round data, then assign a goal.'
                    : 'No trackable metric for this area.'}
                </p>
              </Inset>
            )}
          </FormSection>

          {/* ── 3 · PLAN — generate a practice plan ──────────────────────── */}
          <FormSection
            title="Practice plan"
            description="A 7-day block of drills tagged to this area, drafted by CoachHelm."
          >
            <div className="flex flex-col gap-4">
              <div>
                <Button variant="secondary" size="sm" busy={planBusy} onClick={handleGeneratePlan}>
                  <IconClipboard size={16} />
                  <span>{planReady ? 'Regenerate plan' : 'Create plan'}</span>
                </Button>
              </div>

              {planReady ? (
                <Inset padding="md" className="flex flex-col gap-3">
                  {planDays.map((day) => {
                    const dayDrills = day.drill_ids
                      .map((id) => drillById.get(id))
                      .filter(Boolean) as Array<{ id: string; title: string; duration_min: number }>;
                    return (
                      <div key={day.day} className="flex flex-col gap-1">
                        <span className="font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                          Day {day.day}
                        </span>
                        {day.prose ? (
                          <p className="font-fw-sans text-body-sm text-text-secondary">{day.prose}</p>
                        ) : null}
                        {dayDrills.length > 0 ? (
                          <ul className="flex flex-wrap gap-1.5 pt-0.5">
                            {dayDrills.map((d) => (
                              <li
                                key={d.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-2.5 py-0.5 font-fw-sans text-caption text-text-secondary"
                              >
                                {d.title}
                                <span className="text-text-tertiary">{d.duration_min}m</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                  {!plan?.plan?.used_llm ? (
                    <p className="font-fw-sans text-caption text-text-tertiary">
                      Template draft (AI generation unavailable). Edit after saving if you like.
                    </p>
                  ) : null}
                </Inset>
              ) : null}
            </div>
          </FormSection>

          {/* ── 4 · SHIP — documents + calendar ──────────────────────────── */}
          <FormSection
            title="Save & schedule"
            description="Keep the plan in Documents and put practice on the calendar."
          >
            <div className="flex flex-col gap-5">
              {/* Save to documents */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-fw-sans text-body-sm text-text-secondary">
                    {savedDocId ? 'Plan saved to Documents.' : 'Save this plan to the team Documents library.'}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    busy={docBusy}
                    disabled={!planReady || Boolean(savedDocId)}
                    onClick={() => void handleSaveDocument()}
                  >
                    <IconFile size={16} />
                    <span>{savedDocId ? 'Saved' : 'Save to Documents'}</span>
                  </Button>
                </div>
                <Checkbox
                  label="Visible to players"
                  description="Off keeps the plan coach-only in Documents"
                  checked={playerVisible}
                  disabled={Boolean(savedDocId)}
                  onCheckedChange={(checked) => setPlayerVisible(Boolean(checked))}
                />
              </div>

              {/* Schedule on calendar */}
              <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField label="Date">
                    <Input type="date" value={schedDate} onChange={(e) => { setSchedDate(e.target.value); setScheduleDone(false); }} />
                  </FormField>
                  <FormField label="Start">
                    <Input type="time" value={schedStart} onChange={(e) => { setSchedStart(e.target.value); setScheduleDone(false); }} />
                  </FormField>
                  <FormField label="End">
                    <Input type="time" value={schedEnd} onChange={(e) => { setSchedEnd(e.target.value); setScheduleDone(false); }} />
                  </FormField>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Checkbox
                    label="Attach the plan document"
                    description={planReady ? undefined : 'Generate a plan to attach it'}
                    checked={attachDoc && planReady}
                    disabled={!planReady}
                    onCheckedChange={(checked) => setAttachDoc(Boolean(checked))}
                  />
                  <Button variant="primary" size="sm" busy={schedBusy} disabled={scheduleDone} onClick={handleSchedule}>
                    <IconCalendar size={16} />
                    <span>{scheduleDone ? 'Scheduled' : 'Add to calendar'}</span>
                  </Button>
                </div>
                <p className="font-fw-sans text-caption text-text-tertiary">
                  Adds to your active team’s practice calendar.
                </p>
              </div>
            </div>
          </FormSection>
        </div>
      </ModalShell.Body>

      <ModalShell.Footer>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </ModalShell.Footer>
    </ModalShell>
  );
}

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  // Matches FormSection's legend voice (font-fw-display text-h2) so all four
  // peer action sections share one editorial heading scale.
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-fw-display text-h2 text-text-primary">{title}</h3>
      {hint ? <span className="font-fw-sans text-caption text-text-tertiary">{hint}</span> : null}
    </div>
  );
}

export default FairwayAspectDrillDown;
