'use client';

/**
 * ============================================================================
 * HubPlanBoard — "Your plan" on the CoachHelm overview, editable in place
 * ----------------------------------------------------------------------------
 * Audit HUB-19: the overview used to show the plan read-only with a link to
 * Development. Each row now opens inline to log a new value or mark the focus
 * area complete, without leaving the overview.
 *
 * The writes are the existing focus-area server actions, imported unchanged
 * (`updateFocusAreaProgress`, `completeFocusArea`, and `reactivateFocusArea`
 * for Undo), the same ones DevelopmentDrill calls. Both are applied
 * optimistically with `useOptimistic`: the bar moves, or the row leaves, the
 * moment the player saves, and React drops the overlay when the transition
 * ends. On failure the row comes back as it was and a danger toast says why;
 * on success the action's own revalidatePath (plus a refresh) brings the
 * server's row.
 *
 * Every control here is secondary or ghost: the overview's one primary action
 * stays "Log a round" in the masthead.
 * ========================================================================== */

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Button, FormField, Input, PressTarget, type FocusAreaCardData } from '@/components/fairway';
import { fairwayToast } from '@/components/fairway/feedback';
import { useStage } from '@/components/fairway/modules';
import { formatTargetMetricLabel } from '@/components/fairway/pages/coachhelm/areaTypes';
import { completeFocusArea, reactivateFocusArea, updateFocusAreaProgress } from '@/app/golf/actions/development';
import { cn } from '@/lib/utils';

import { buildPlanRows } from './buildPlayerHubViewModel';

/** Same ceiling as DevelopmentDrill's Log progress drawer. */
const MAX_REASONABLE = 100_000;

/** Mirrors development.ts's ACTIONABLE_FOCUS_AREA_STATUSES (and FocusAreaCard). */
const ACTIONABLE_STATUSES = new Set(['active', 'in_progress', 'paused']);

type PlanPatch = { kind: 'progress'; id: string; value: number } | { kind: 'complete'; id: string };

function applyPatch(areas: FocusAreaCardData[], patch: PlanPatch): FocusAreaCardData[] {
  if (patch.kind === 'complete') return areas.filter((a) => a.id !== patch.id);
  return areas.map((a) => (a.id === patch.id ? { ...a, current_value: patch.value } : a));
}

/** The drawer's checks, in the drawer's words. Returns the number or an error. */
export function parseProgressValue(raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { error: 'Enter a new value to log.' };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { error: 'Enter a number (e.g. 31.5).' };
  if (parsed < 0) return { error: 'Value can’t be negative — enter 0 or higher.' };
  if (parsed > MAX_REASONABLE) {
    return { error: `That looks too large — enter a value up to ${MAX_REASONABLE.toLocaleString('en-US')}.` };
  }
  return { value: parsed };
}

export interface HubPlanBoardProps {
  areas: FocusAreaCardData[];
}

export function HubPlanBoard({ areas }: HubPlanBoardProps) {
  const router = useRouter();
  const stage = useStage();
  const [optimisticAreas, addPatch] = useOptimistic(areas, applyPatch);
  const [, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; kind: PlanPatch['kind'] } | null>(null);

  const rows = buildPlanRows(optimisticAreas);
  const byId = new Map(optimisticAreas.map((a) => [a.id, a]));

  const undoComplete = (area: FocusAreaCardData) => {
    void reactivateFocusArea(area.id).then(
      (res) => {
        if (res.success) router.refresh();
        else fairwayToast.danger(res.error || 'Could not undo');
      },
      () => fairwayToast.danger('Could not undo'),
    );
  };

  const saveProgress = (area: FocusAreaCardData, value: number, onSaved: () => void) => {
    if (pending) return;
    setPending({ id: area.id, kind: 'progress' });
    startTransition(async () => {
      addPatch({ kind: 'progress', id: area.id, value });
      try {
        const res = await updateFocusAreaProgress(area.id, value);
        if (!res.success) {
          fairwayToast.danger(res.error || 'Failed to log progress');
          return;
        }
        fairwayToast.success('Progress updated', { description: area.title || undefined });
        onSaved();
        router.refresh();
      } catch {
        fairwayToast.danger('Failed to log progress');
      } finally {
        setPending(null);
      }
    });
  };

  const markComplete = (area: FocusAreaCardData) => {
    if (pending) return;
    setPending({ id: area.id, kind: 'complete' });
    startTransition(async () => {
      addPatch({ kind: 'complete', id: area.id });
      try {
        const res = await completeFocusArea(area.id);
        if (!res.success) {
          fairwayToast.danger(res.error || 'Failed to mark complete');
          return;
        }
        fairwayToast.success('Marked complete', {
          description: area.title || undefined,
          action: { label: 'Undo', onClick: () => undoComplete(area) },
        });
        setOpenId(null);
        router.refresh();
      } catch {
        fairwayToast.danger('Failed to mark complete');
      } finally {
        setPending(null);
      }
    });
  };

  return (
    <div data-slot="plan-board">
      {rows.length > 0 ? (
        <ul data-slot="plan-rows" className="flex flex-col divide-y divide-border-subtle">
          {rows.map((row) => {
            const area = byId.get(row.id);
            if (!area) return null;
            const actionable = ACTIONABLE_STATUSES.has(area.status ?? 'active');
            const open = openId === row.id && actionable;
            return (
              <li key={row.id} data-plan-row={row.id} className="py-1">
                <PlanRowHeader
                  title={row.title}
                  status={row.status}
                  pct={row.pct}
                  open={open}
                  actionable={actionable}
                  busy={pending?.id === row.id}
                  onToggle={() => setOpenId(open ? null : row.id)}
                  panelId={`plan-edit-${row.id}`}
                />
                {open ? (
                  <PlanRowEditor
                    id={`plan-edit-${row.id}`}
                    area={area}
                    pending={pending?.id === row.id ? pending.kind : null}
                    locked={pending !== null}
                    onSave={(value, onSaved) => saveProgress(area, value, onSaved)}
                    onComplete={() => markComplete(area)}
                    onCancel={() => setOpenId(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="font-fw-sans text-body-sm text-text-secondary">Nothing active in your plan right now.</p>
      )}
      <Button variant="ghost" size="md" className="mt-3 w-fit" onClick={() => stage.open('development')}>
        Open your plan
        <ChevronRight size={14} aria-hidden />
      </Button>
    </div>
  );
}

function PlanRowHeader({
  title,
  status,
  pct,
  open,
  actionable,
  busy,
  onToggle,
  panelId,
}: {
  title: string;
  status: string;
  pct: number | null;
  open: boolean;
  actionable: boolean;
  busy: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-fw-sans text-body-sm font-medium text-text-primary">{title}</p>
        <p className="flex shrink-0 items-center gap-1.5 font-fw-sans text-caption font-medium text-text-secondary tabular-nums">
          <span data-slot="plan-status">{status}</span>
          {actionable ? (
            <ChevronDown
              size={14}
              aria-hidden
              className={cn('transition-transform [transition-duration:var(--fw-dur-fast)] motion-reduce:transition-none', open && 'rotate-180')}
            />
          ) : null}
        </p>
      </div>
      {pct !== null ? (
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-sunken" aria-hidden="true">
          <div
            data-slot="plan-bar"
            className="h-full rounded-full bg-accent-500 transition-[width] [transition-duration:var(--fw-dur-base)] motion-reduce:transition-none"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
      ) : null}
    </>
  );

  if (!actionable) return <div className="flex min-h-[44px] flex-col justify-center py-2">{body}</div>;

  return (
    <PressTarget
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-busy={busy || undefined}
      aria-label={`${title}, ${status}. ${open ? 'Close' : 'Update'}`}
      onClick={onToggle}
      className="flex min-h-[44px] w-full flex-col justify-center rounded-fw-sm py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {body}
    </PressTarget>
  );
}

function PlanRowEditor({
  id,
  area,
  pending,
  locked,
  onSave,
  onComplete,
  onCancel,
}: {
  id: string;
  area: FocusAreaCardData;
  pending: PlanPatch['kind'] | null;
  locked: boolean;
  onSave: (value: number, onSaved: () => void) => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const metricLabel = formatTargetMetricLabel(area.target_metric ?? null) || 'Progress';
  const hint = [
    area.current_value != null ? `Now ${area.current_value}` : null,
    area.target_value != null ? `target ${area.target_value}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const parsed = parseProgressValue(draft);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    onSave(parsed.value, () => setDraft(''));
  };

  return (
    <form id={id} onSubmit={submit} noValidate className="flex flex-col gap-3 pb-3 pt-2" aria-label={`Update ${area.title || 'focus area'}`}>
      <FormField label={`New value (${metricLabel})`} error={error ?? undefined} help={hint || undefined}>
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Your latest measurement"
          aria-invalid={error ? true : undefined}
          disabled={locked}
        />
      </FormField>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary" size="md" busy={pending === 'progress'} disabled={locked}>
          Save progress
        </Button>
        <Button type="button" variant="ghost" size="md" busy={pending === 'complete'} disabled={locked} onClick={onComplete}>
          Mark complete
        </Button>
        <Button type="button" variant="ghost" size="md" disabled={locked} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
