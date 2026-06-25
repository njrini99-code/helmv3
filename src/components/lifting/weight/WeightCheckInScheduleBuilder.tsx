'use client';

// =============================================================================
// src/components/lifting/weight/WeightCheckInScheduleBuilder.tsx
//
// Helm Lifting Lab — Coach weight check-in schedule builder (spec §9).
//
// Creates or edits a helm_lifting_weight_checkin_schedules row. Supports:
//   • Title
//   • Assign to: Team / Group / Individual athlete
//   • Frequency: Once / Daily / Weekly / Mon+Thu / Custom days
//   • Due window: start + end time
//   • Instructions
//   • Status: Publish immediately or save as Draft
//
// Wires to createWeightCheckInSchedule and updateWeightCheckInSchedule.
// Can be rendered inline on a coach page or inside a modal/drawer.
// =============================================================================

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  IconCalendar,
  IconClock,
  IconCheckCircle2,
  IconAlertCircle,
  IconInfo,
} from '@/components/icons';
import { haptic } from '@/lib/lifting/haptics';
import {
  createWeightCheckInSchedule,
  updateWeightCheckInSchedule,
} from '@/app/lifting/actions/weight-checkins';
import type {
  FrequencyType,
  AssignmentType,
  ScheduleStatus,
  WeightCheckinSchedule,
} from '@/lib/types/helm-lifting-checkins';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal group/athlete option for the dropdowns. */
export interface LiftingGroupOption {
  id: string;
  name: string;
}

export interface LiftingAthleteOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface WeightCheckInScheduleBuilderProps {
  orgId: string;
  sport: 'baseball' | 'golf';
  /** Groups visible to this coach's org. */
  groups?: LiftingGroupOption[];
  /** Athletes visible to this coach's org. */
  athletes?: LiftingAthleteOption[];
  /** If provided — editing mode; form pre-populated from this schedule. */
  existing?: WeightCheckinSchedule;
  /** Called after a successful create or update. */
  onSuccess?: (scheduleId: string) => void;
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Day-of-week helpers
// ---------------------------------------------------------------------------

const DAY_LABELS: Record<number, string> = {
  0: 'Su', 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa',
};
const ALL_DOW = [0, 1, 2, 3, 4, 5, 6] as const;

/** Named preset day-of-week sets. */
const FREQ_PRESETS: Array<{ label: string; frequencyType: FrequencyType; days: number[] | null }> = [
  { label: 'Daily',        frequencyType: 'daily',  days: null },
  { label: 'Mon & Thu',    frequencyType: 'custom', days: [1, 4] },
  { label: 'Mon & Wed & Fri', frequencyType: 'custom', days: [1, 3, 5] },
  { label: 'Weekly (Mon)', frequencyType: 'weekly', days: [1] },
  { label: 'Once',         frequencyType: 'once',   days: null },
];

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-warm-500">
          {label}
        </label>
        {note && <span className="text-xs text-warm-400">{note}</span>}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-warm-400">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeightCheckInScheduleBuilder({
  orgId,
  sport,
  groups = [],
  athletes = [],
  existing,
  onSuccess,
  onCancel,
}: WeightCheckInScheduleBuilderProps) {
  const isEditing = existing != null;

  // ── Form state ─────────────────────────────────────────────────────────

  const [title, setTitle] = useState(existing?.title ?? '');
  const [assignmentType, setAssignmentType] = useState<AssignmentType>(
    existing?.assignment_type ?? 'team',
  );
  const [groupId, setGroupId] = useState(existing?.group_id ?? '');
  const [athleteId, setAthleteId] = useState(existing?.athlete_id ?? '');

  const [frequencyType, setFrequencyType] = useState<FrequencyType>(
    existing?.frequency_type ?? 'daily',
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(existing?.days_of_week ?? []);

  // Start date — today by default when creating.
  const todayIso = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(existing?.start_date ?? todayIso);
  const [endDate, setEndDate] = useState(existing?.end_date ?? '');

  const [dueWindowStart, setDueWindowStart] = useState(existing?.due_window_start?.slice(0, 5) ?? '');
  const [dueWindowEnd, setDueWindowEnd] = useState(existing?.due_window_end?.slice(0, 5) ?? '');

  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [publishNow, setPublishNow] = useState<boolean>(
    existing ? existing.status === 'published' : true,
  );

  // ── Async state ─────────────────────────────────────────────────────────

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Day-of-week toggle ──────────────────────────────────────────────────

  function toggleDow(day: number) {
    haptic('tap');
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  // ── Preset click ────────────────────────────────────────────────────────

  function applyPreset(preset: typeof FREQ_PRESETS[number]) {
    haptic('tap');
    setFrequencyType(preset.frequencyType);
    setDaysOfWeek(preset.days ?? []);
  }

  // ── Validation ──────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!title.trim()) return 'Title is required.';
    if (!startDate) return 'Start date is required.';
    if (assignmentType === 'group' && !groupId) return 'Select a group.';
    if (assignmentType === 'athlete' && !athleteId) return 'Select an athlete.';
    if ((frequencyType === 'weekly' || frequencyType === 'custom') && daysOfWeek.length === 0) {
      return 'Select at least one day for this frequency.';
    }
    if (dueWindowStart && dueWindowEnd && dueWindowStart >= dueWindowEnd) {
      return 'Due window end must be after start.';
    }
    return null;
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const validationErr = validate();
      if (validationErr) {
        setError(validationErr);
        return;
      }

      setSaving(true);
      haptic('select');

      const payload = {
        orgId,
        sport,
        title: title.trim(),
        assignmentType,
        groupId: assignmentType === 'group' ? groupId : null,
        athleteId: assignmentType === 'athlete' ? athleteId : null,
        teamId: null,
        frequencyType,
        daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : null,
        startDate,
        endDate: endDate || null,
        dueWindowStart: dueWindowStart ? `${dueWindowStart}:00` : null,
        dueWindowEnd: dueWindowEnd ? `${dueWindowEnd}:00` : null,
        instructions: instructions.trim() || null,
        status: (publishNow ? 'published' : 'draft') as ScheduleStatus,
      };

      try {
        if (isEditing && existing) {
          const res = await updateWeightCheckInSchedule({
            scheduleId: existing.id,
            ...payload,
          });
          if (!res.success) {
            setError(res.error ?? 'Could not update schedule.');
            return;
          }
          haptic('success');
          setSuccess(true);
          onSuccess?.(existing.id);
        } else {
          const res = await createWeightCheckInSchedule(payload);
          if (!res.success) {
            setError(res.error ?? 'Could not create schedule.');
            return;
          }
          haptic('success');
          setSuccess(true);
          onSuccess?.(res.scheduleId!);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      orgId, sport, title, assignmentType, groupId, athleteId,
      frequencyType, daysOfWeek, startDate, endDate,
      dueWindowStart, dueWindowEnd, instructions, publishNow, isEditing, existing,
    ],
  );

  // ── Success state ────────────────────────────────────────────────────────

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.22 }}
      >
        <Card variant="glass">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100">
              <IconCheckCircle2 size={28} className="text-primary-600" />
            </div>
            <p className="text-lg font-semibold text-warm-900">
              Schedule {isEditing ? 'updated' : 'published'}
            </p>
            <p className="max-w-xs text-sm text-warm-500">
              {publishNow
                ? 'Athletes will see this check-in on their upcoming dates.'
                : 'Saved as draft. Publish when ready.'}
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconCalendar size={18} className="text-primary-600" />
          <h2 className="font-semibold text-warm-900">
            {isEditing ? 'Edit Weight Check-In Schedule' : 'Schedule Weight Check-In'}
          </h2>
        </div>
        <p className="text-sm text-warm-500">
          Scheduled check-ins appear on each athlete&apos;s daily view.
        </p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* ── DETAILS ──────────────────────────────────────────── */}
          <SectionHeading>Details</SectionHeading>

          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Monday / Thursday Morning Weight"
              maxLength={140}
              required
            />
          </Field>

          {/* ── ASSIGNMENT ────────────────────────────────────────── */}
          <SectionHeading>Assign to</SectionHeading>

          <div className="flex flex-wrap gap-2">
            {(['team', 'group', 'athlete'] as AssignmentType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { haptic('tap'); setAssignmentType(t); }}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  assignmentType === t
                    ? 'border-primary-400 bg-primary-50 text-primary-700'
                    : 'border-warm-200 bg-white text-warm-600 hover:border-warm-300'
                }`}
              >
                {t === 'team' ? 'Entire Team' : t === 'group' ? 'Group' : 'Individual'}
              </button>
            ))}
          </div>

          {assignmentType === 'group' && (
            <Field label="Group">
              {groups.length === 0 ? (
                <p className="text-sm text-warm-400 italic">No groups configured yet.</p>
              ) : (
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-warm-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                  required
                >
                  <option value="">Select a group…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
            </Field>
          )}

          {assignmentType === 'athlete' && (
            <Field label="Athlete">
              {athletes.length === 0 ? (
                <p className="text-sm text-warm-400 italic">No athletes found.</p>
              ) : (
                <select
                  value={athleteId}
                  onChange={(e) => setAthleteId(e.target.value)}
                  className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-warm-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                  required
                >
                  <option value="">Select an athlete…</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {[a.firstName, a.lastName].filter(Boolean).join(' ') || a.id}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          {/* ── FREQUENCY ─────────────────────────────────────────── */}
          <SectionHeading>Frequency</SectionHeading>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {FREQ_PRESETS.map((p) => {
              const isActive =
                p.frequencyType === frequencyType &&
                (p.days == null
                  ? daysOfWeek.length === 0
                  : JSON.stringify(p.days) === JSON.stringify(daysOfWeek));
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-warm-200 bg-white text-warm-600 hover:border-warm-300'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom day picker — visible when custom or weekly */}
          {(frequencyType === 'custom' || frequencyType === 'weekly') && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-warm-500">
                Days
              </label>
              <div className="flex gap-2">
                {ALL_DOW.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDow(d)}
                    aria-pressed={daysOfWeek.includes(d)}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-medium transition-colors ${
                      daysOfWeek.includes(d)
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'border border-warm-200 bg-white text-warm-600 hover:border-warm-300'
                    }`}
                  >
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Start / end date */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-warm-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
            </Field>
            <Field label="End Date" note="(optional)">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-warm-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
            </Field>
          </div>

          {/* ── DUE WINDOW ────────────────────────────────────────── */}
          <SectionHeading>Due Window</SectionHeading>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <div className="relative">
                <IconClock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                <input
                  type="time"
                  value={dueWindowStart}
                  onChange={(e) => setDueWindowStart(e.target.value)}
                  className="w-full rounded-xl border border-warm-200 bg-white py-2 pl-8 pr-3 text-sm text-warm-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                />
              </div>
            </Field>
            <Field label="To">
              <div className="relative">
                <IconClock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                <input
                  type="time"
                  value={dueWindowEnd}
                  onChange={(e) => setDueWindowEnd(e.target.value)}
                  className="w-full rounded-xl border border-warm-200 bg-white py-2 pl-8 pr-3 text-sm text-warm-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
                />
              </div>
            </Field>
          </div>

          {/* ── INSTRUCTIONS ──────────────────────────────────────── */}
          <SectionHeading>Instructions</SectionHeading>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <IconInfo size={13} className="text-warm-400" />
              <label
                htmlFor="weight-instructions"
                className="text-xs font-medium uppercase tracking-wide text-warm-500"
              >
                For athletes <span className="normal-case text-warm-400">(optional)</span>
              </label>
            </div>
            <textarea
              id="weight-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Submit morning bodyweight before breakfast."
              rows={2}
              maxLength={1000}
              className="w-full resize-none rounded-xl border border-warm-200 bg-white px-3 py-2 text-sm text-warm-900 placeholder:text-warm-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>

          {/* ── STATUS ────────────────────────────────────────────── */}
          <SectionHeading>Publish</SectionHeading>

          <div className="flex gap-3">
            {([true, false] as const).map((pub) => (
              <button
                key={pub ? 'publish' : 'draft'}
                type="button"
                onClick={() => { haptic('tap'); setPublishNow(pub); }}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                  publishNow === pub
                    ? 'border-primary-400 bg-primary-50 text-primary-700'
                    : 'border-warm-200 bg-white text-warm-600 hover:border-warm-300'
                }`}
              >
                {pub ? 'Publish now' : 'Save as draft'}
              </button>
            ))}
          </div>

          {/* ── ERROR ─────────────────────────────────────────────── */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              <IconAlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── ACTIONS ───────────────────────────────────────────── */}
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" isLoading={saving} className="flex-1 sm:flex-none">
              {isEditing ? 'Update Schedule' : publishNow ? 'Publish Schedule' : 'Save Draft'}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={saving}
                className="text-warm-600"
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
