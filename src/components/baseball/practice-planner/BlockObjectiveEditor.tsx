'use client';

// =============================================================================
// src/components/baseball/practice-planner/BlockObjectiveEditor.tsx
//
// Packet: practice-effectiveness (BaseballHelm CoachHelm Engine)
//
// THE SOURCE-LAYER CAPTURE UI the Practice Effectiveness engine was missing.
// The engine (practice-effectiveness.ts + effectiveness/engine.ts) only measures
// objectives WHERE completion_status IN ('completed','partial') — but until this
// component there was NO surface that wrote an objective at all, so the engine's
// input set was always empty (dead engine). This closes the SOURCE node of the
// source -> signal -> action -> review mechanic the v10 delta mandates.
//
// Two cooperating pieces (both call practice-effectiveness.ts server actions,
// capability-enforced server-side on can_manage_practice):
//
//   1. BlockObjectiveEditor — attach one measurable objective to a practice
//      block: focus area + an OPTIONAL target metric (picked from the baseball
//      metric registry, grouped by domain) + assigned players + reps planned.
//      saveObjective() persists it; deleteObjective() removes it.
//
//   2. (Recap completion lives in PracticeRecapPanel.tsx — the v10 "human-entered
//      completion notes and effectiveness measurement" flow that flips
//      completion_status so the engine can read it.)
//
// PALETTE: cream + helm-green GolfHelm primitives. No golf labels. No navy/amber
// surfaces. Real empty/loading/error states; honest copy about what a metric
// does (an attached metric is what makes the focus MEASURABLE later).
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { Target, Plus, Trash2, Check, X, Ruler, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  saveObjective,
  deleteObjective,
  type PracticeObjectiveView,
} from '@/app/baseball/actions/practice-effectiveness';
import {
  BASEBALL_METRIC_IDS,
  getBaseballMetricLabel,
  getBaseballMetricDomain,
  type BaseballMetricDomain,
} from '@/lib/coachhelm/baseball/metrics/registry';

interface RosterPlayerLite {
  id: string;
  name: string;
}

interface Props {
  practiceId: string | null;
  blockId: string | null;
  /** A stable client key for this block (so an objective can attach pre-save). */
  blockKey: string;
  roster: RosterPlayerLite[];
  /** Objectives already persisted for this block. */
  objectives: PracticeObjectiveView[];
  /** Called after a successful save/delete so the parent can refresh + persist. */
  onChanged: () => void | Promise<void>;
  /**
   * Ensures the parent practice + block are persisted (returns the real block id)
   * BEFORE an objective is written, since an objective FKs to a real practice.
   */
  ensurePersisted: (blockKey: string) => Promise<{ practiceId: string; blockId: string | null } | null>;
}

// Domain display order + labels for the grouped metric picker.
const DOMAIN_ORDER: BaseballMetricDomain[] = [
  'hitting',
  'pitching',
  'catching',
  'defense',
  'baserunning',
  'workload',
  'readiness',
  'performance',
  'practice',
  'academics',
  'operations',
];
const DOMAIN_LABEL: Record<BaseballMetricDomain, string> = {
  hitting: 'Hitting',
  pitching: 'Pitching',
  catching: 'Catching',
  defense: 'Defense',
  baserunning: 'Baserunning',
  workload: 'Workload',
  readiness: 'Readiness',
  performance: 'Strength',
  practice: 'Practice',
  academics: 'Academics',
  operations: 'Operations',
};

/** Registry metric ids grouped by domain, label-sorted — for the <select>. */
function useGroupedMetrics() {
  return useMemo(() => {
    const byDomain = new Map<BaseballMetricDomain, { id: string; label: string }[]>();
    for (const id of BASEBALL_METRIC_IDS) {
      const domain = getBaseballMetricDomain(id);
      const arr = byDomain.get(domain) ?? [];
      arr.push({ id, label: getBaseballMetricLabel(id) });
      byDomain.set(domain, arr);
    }
    for (const arr of byDomain.values()) arr.sort((a, b) => a.label.localeCompare(b.label));
    return DOMAIN_ORDER.filter((d) => byDomain.has(d)).map((d) => ({
      domain: d,
      label: DOMAIN_LABEL[d],
      metrics: byDomain.get(d)!,
    }));
  }, []);
}

export function BlockObjectiveEditor({
  practiceId,
  blockId,
  blockKey,
  roster,
  objectives,
  onChanged,
  ensurePersisted,
}: Props) {
  const grouped = useGroupedMetrics();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Draft form state for a new objective.
  const [focusArea, setFocusArea] = useState('');
  const [targetMetric, setTargetMetric] = useState<string>('');
  const [repsPlanned, setRepsPlanned] = useState<string>('');
  const [assigned, setAssigned] = useState<Set<string>>(new Set());

  const blockObjectives = objectives.filter((o) => o.blockId === blockId || o.blockId === null);
  const canAdd = focusArea.trim().length > 0;

  const resetDraft = () => {
    setFocusArea('');
    setTargetMetric('');
    setRepsPlanned('');
    setAssigned(new Set());
    setAdding(false);
    setError(null);
  };

  const togglePlayer = (id: string) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    if (!canAdd) return;
    setError(null);
    startTransition(async () => {
      // The objective FKs to a real practice/block — make sure they exist first.
      const persisted = await ensurePersisted(blockKey);
      const realPracticeId = persisted?.practiceId ?? practiceId;
      const realBlockId = persisted?.blockId ?? blockId;
      if (!realPracticeId) {
        setError('Save the practice first, then add objectives.');
        return;
      }
      const reps = repsPlanned.trim() === '' ? null : Math.max(0, Math.round(Number(repsPlanned)));
      const res = await saveObjective({
        practiceId: realPracticeId,
        blockId: realBlockId,
        focusArea: focusArea.trim(),
        targetMetric: targetMetric || null,
        playerIds: [...assigned],
        repsPlanned: Number.isFinite(reps as number) ? reps : null,
        completionStatus: 'planned',
      });
      if (!res.success) {
        setError(res.error ?? 'Could not save objective.');
        return;
      }
      resetDraft();
      await onChanged();
    });
  };

  const handleDelete = (objectiveId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteObjective({ objectiveId });
      if (!res.success) {
        setError(res.error ?? 'Could not remove objective.');
        return;
      }
      await onChanged();
    });
  };

  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700">
          <Target className="h-3.5 w-3.5" />
          Measurable objectives
        </span>
        {!adding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Add objective
          </Button>
        )}
      </div>

      <p className="mb-2 text-[11px] leading-relaxed text-warm-500">
        Attach a target metric to make this focus <span className="font-medium text-warm-700">measurable</span> —
        CoachHelm will read whether it transferred to later games, scrimmages and
        practice. Leave the metric blank to track completion only.
      </p>

      {/* Existing objectives */}
      {blockObjectives.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {blockObjectives.map((o) => (
            <li
              key={o.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-warm-100 bg-white/70 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-warm-800">{o.focusArea}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-warm-500">
                  {o.targetMetric ? (
                    <span className="inline-flex items-center gap-1 text-primary-600">
                      <Ruler className="h-3 w-3" />
                      {getBaseballMetricLabel(o.targetMetric)}
                    </span>
                  ) : (
                    <span className="text-warm-400">Completion only</span>
                  )}
                  {o.playerIds.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {o.playerIds.length}
                    </span>
                  )}
                  {o.repsPlanned != null && <span>{o.repsPlanned} reps planned</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(o.id)}
                disabled={isPending}
                aria-label={`Remove objective ${o.focusArea}`}
                className="shrink-0 rounded-md p-1 text-warm-400 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {blockObjectives.length === 0 && !adding && (
        <p className="text-[11px] italic text-warm-400">No objectives on this block yet.</p>
      )}

      {/* Add form */}
      {adding && (
        <div className="space-y-2 rounded-lg border border-warm-200 bg-white/80 p-2.5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-warm-600">Focus area</span>
            <input
              type="text"
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
              placeholder="Two-strike approach"
              className="w-full rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-warm-600">
                Target metric (optional)
              </span>
              <select
                value={targetMetric}
                onChange={(e) => setTargetMetric(e.target.value)}
                className="w-full rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
                aria-label="Target metric"
              >
                <option value="">No metric (track completion)</option>
                {grouped.map((g) => (
                  <optgroup key={g.domain} label={g.label}>
                    {g.metrics.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-warm-600">Reps planned</span>
              <input
                type="number"
                min={0}
                value={repsPlanned}
                onChange={(e) => setRepsPlanned(e.target.value)}
                placeholder="e.g. 30"
                className="w-full rounded-lg border border-warm-200 px-2 py-1.5 text-sm focus:border-primary-400 focus:outline-none"
              />
            </label>
          </div>

          {/* Assigned players */}
          {roster.length > 0 && (
            <div>
              <span className="mb-1 block text-[11px] font-medium text-warm-600">
                Assigned players {assigned.size > 0 && `(${assigned.size})`}
              </span>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {roster.map((p) => {
                  const on = assigned.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlayer(p.id)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        on
                          ? 'border-primary-500 bg-primary-600 text-white'
                          : 'border-warm-200 bg-white text-warm-600 hover:border-primary-300'
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-[11px] text-error">{error}</p>}

          <div className="flex items-center gap-2 pt-0.5">
            <Button
              size="sm"
              onClick={handleSave}
              isLoading={isPending}
              disabled={!canAdd}
              leftIcon={<Check className="h-3.5 w-3.5" />}
            >
              Save objective
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetDraft}
              disabled={isPending}
              leftIcon={<X className="h-3.5 w-3.5" />}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
