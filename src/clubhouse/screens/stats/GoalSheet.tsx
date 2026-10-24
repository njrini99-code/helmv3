'use client';

import { Target } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createGoal, suggestGoalTarget, type GoalTargetSuggestion } from '@/app/golf/actions/v3/goals';
import { isWindowedMetric } from '@/lib/coachhelm/v3/goals/window-metric-ids';
import { METRIC_IDS, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Modal } from '../../ui/Modal';
import { Select } from '../../ui/Select';
import { useAction } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { devValue } from './dev-format';
import { goalMetricLabel } from './goal-words';
import '../../styles/goals.css';

/**
 * Set a goal (par-18): the player picks a stat the goal is measured by and how long it runs, and the target fills in from
 * where they are now (`suggestGoalTarget`, the engine's own rule: halfway to the college average, or to the Tour once past
 * it). Only stats that can be measured round by round are offered (`isWindowedMetric`); `createGoal` refuses the rest and
 * measures the starting point itself from the player's last 90 days, so nothing here is trusted as the baseline.
 */

/** The stats a goal can be set on: those whose progress is read over the goal's own window. */
const GOAL_METRICS = METRIC_IDS.filter(isWindowedMetric);
const METRIC_OPTIONS = GOAL_METRICS.map((id) => ({ value: id, label: goalMetricLabel(id) }));

const WINDOWS = [
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
] as const;
type Days = (typeof WINDOWS)[number]['value'];

/** A target as it is typed: two places for strokes, one for everything else. */
function inputValue(value: number, unit: GoalTargetSuggestion['unit']): string {
  return String(Number(value.toFixed(unit === 'strokes' ? 2 : 1)));
}

/** What the target field is based on, in words (CH-5325 when there is nothing to base it on). */
function targetNote(metric: MetricId, s: GoalTargetSuggestion | null, loading: boolean, failed: boolean, edited: boolean): { text: string; code?: string } | null {
  if (loading) return { text: 'Finding your starting point…', code: 'CH-5406' };
  if (failed || !s) return { text: 'Couldn’t look up your starting point. You can still set a target.', code: 'CH-5325' };
  if (!s.hasStanding || s.baseline == null) return { text: 'No starting point yet. Set a target to aim for.', code: 'CH-5325' };
  const from = devValue(s.baseline, metric);
  if (s.suggested_target != null) {
    const toward = s.anchor === 'tour' ? `halfway to the Tour (${devValue(s.pga_value, metric)})` : `halfway to the college average${s.cohort_value != null ? ` (${devValue(s.cohort_value, metric)})` : ''}`;
    return { text: `${edited ? 'Suggested' : 'Filled in'}: ${devValue(s.suggested_target, metric)}, ${toward}, from your ${from}.` };
  }
  switch (s.no_target_reason) {
    case 'basis_mismatch':
      return { text: `Your ${from} counts only approaches that found the green, and the Tour figure counts every approach, so there is no Tour target to aim at. Set your own.` };
    case 'already_ahead':
      return { text: `You are at ${from}, ahead of the Tour. Set a target to hold or extend it.` };
    case 'no_womens_anchor':
      return { text: `You are at ${from}. There is no women’s Tour benchmark for this stat yet, so set a target to aim for.` };
    default:
      return { text: `You are at ${from}. Set a target to aim for.` };
  }
}

export function GoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [metric, setMetric] = useState<MetricId>(GOAL_METRICS.includes('sg_putting') ? 'sg_putting' : GOAL_METRICS[0]!);
  const [days, setDays] = useState<Days>('30');
  const [target, setTarget] = useState('');
  const [share, setShare] = useState(false);
  const [touched, setTouched] = useState(false);
  // The look-up for the stat on screen; null while it runs.
  const [look, setLook] = useState<{ s: GoalTargetSuggestion | null; failed: boolean } | null>(null);
  // Typing in the target field stops the look-up from filling it in; a new stat starts again. The ref is for the look-up
  // that lands later, the state is for what the note says.
  const [edited, setEdited] = useState(false);
  const editedRef = useRef(false);
  const capWarned = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLook(null);
    setTarget('');
    editedRef.current = false;
    setEdited(false);
    suggestGoalTarget(metric).then(
      (s) => {
        if (cancelled) return;
        setLook({ s, failed: !s.ok });
        if (!editedRef.current && s.hasStanding && s.suggested_target != null) setTarget(inputValue(s.suggested_target, s.unit));
      },
      () => {
        if (!cancelled) setLook({ s: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [metric, open]);

  const parsed = target.trim() === '' ? null : Number(target);
  const invalid = parsed == null || !Number.isFinite(parsed);
  const suggested = look?.s?.hasStanding ? look.s.suggested_target : null;

  const save = useAction(
    'stats.setGoal',
    async (input: Parameters<typeof createGoal>[0]) => {
      const res = await createGoal(input);
      capWarned.current = res.warning === 'soft_cap_exceeded';
      return res;
    },
    () => ({
      done: 'Goal started',
      failed: 'Couldn’t start the goal',
      hint: 'What you entered is still here. Try again in a moment.',
      code: 'CH-5006',
    }),
    (result, copy) => (result.success && capWarned.current ? { ...copy, done: 'Goal started. That is more than five active goals, so consider finishing one.' } : copy),
  );

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (invalid || parsed == null) {
      haptic('warning');
      document.getElementById('gs-target')?.focus();
      return;
    }
    const n = Number(days);
    const res = await save.run({
      metric_id: metric,
      title: `${goalMetricLabel(metric)}, ${n}-day goal`,
      category: 'manual',
      ends_at: new Date(Date.now() + n * 86_400_000).toISOString(),
      target_value: parsed,
      // An untouched fill-in is the engine's midpoint; anything typed is the player's own number.
      target_source: !editedRef.current && suggested != null && parsed === Number(inputValue(suggested, look?.s?.unit ?? 'count')) ? 'midpoint' : 'manual',
      baseline_value: look?.s?.baseline ?? null,
      shared_with_coach: share,
    });
    if (res.success) {
      setTouched(false);
      onClose();
      router.refresh();
    }
  };

  const loading = look === null;
  const note = targetNote(metric, look?.s ?? null, loading, look?.failed ?? false, edited);

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Target}
      title="Set a goal"
      description="A result to chase over the next few weeks. Progress is measured round by round."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button variant="primary" busy={save.pending} feel={null} onClick={() => void submit()}>
            {save.pending ? <span data-ch-code="CH-5405">Starting…</span> : 'Start goal'}
          </Button>
        </>
      }
    >
      <form className="ch-gs-form" onSubmit={submit} noValidate>
        <div className="ch-field">
          <label className="ch-field__label" htmlFor="gs-metric">
            Stat
          </label>
          <Select<MetricId> id="gs-metric" value={metric} options={METRIC_OPTIONS} onChange={setMetric} />
        </div>
        <div className="ch-field">
          <label className="ch-field__label" htmlFor="gs-days">
            How long
          </label>
          <Select<Days> id="gs-days" value={days} options={WINDOWS} onChange={setDays} />
        </div>
        <div className="ch-field">
          <label className="ch-field__label" htmlFor="gs-target">
            Target
          </label>
          <input
            id="gs-target"
            className="ch-input ch-num"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={target}
            placeholder={loading ? 'Finding your starting point…' : 'Enter a target'}
            aria-invalid={touched && invalid}
            aria-describedby="gs-target-help"
            onChange={(e) => {
              editedRef.current = true;
              setEdited(true);
              setTarget(e.target.value);
            }}
            onBlur={() => setTouched(true)}
          />
          <span id="gs-target-help" className={'ch-field__help' + (touched && invalid ? ' is-error' : '')} data-ch-code={touched && invalid ? 'CH-5103' : note?.code} aria-live="polite">
            {touched && invalid ? 'Enter a target number to aim for.' : (note?.text ?? '')}
          </span>
        </div>
        <Checkbox checked={share} onChange={setShare}>
          <span>Share with my coach</span>
        </Checkbox>
      </form>
    </Modal>
  );
}
