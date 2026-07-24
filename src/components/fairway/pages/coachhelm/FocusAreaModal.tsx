'use client';

/**
 * ============================================================================
 * FocusAreaModal — the SHARED create/edit focus-area modal (coach + player)
 * ----------------------------------------------------------------------------
 * One modal, two surfaces:
 *   • mode='coach'  → PlayersGridView. Picks a player, PRESCRIBES a focus area
 *     (the server defaults a coach-created area to 'proposed' → the player
 *     accepts before the window starts). Button: "Prescribe to player".
 *   • mode='player' → FairwayMyDevelopment. The player is fixed (no picker) and
 *     the area is created 'active' immediately. Button: "Add focus area".
 *
 * THE REDESIGN (what the screenshot was missing): the measurable target is now
 * driven by the structured METRIC_CATALOG. Instead of loose label chips with no
 * value, the player's REAL current value is shown next to every pickable stat,
 * and selecting one autofills the current value AND suggests a sensible target
 * to improve to (direction-aware, clamped). A "Custom" option still allows a
 * free-text metric (which simply won't auto-track). The chosen metric is stored
 * by its stable catalog key so the windowed auto-tracker
 * (src/app/golf/actions/v3/focus-area-progress.ts) can move the bar over time.
 *
 * The modal owns its own form lifecycle (state, autofill handlers, unsaved-
 * changes guard, save/saving) and persists through the caller-supplied
 * `onSubmit` so each surface keeps its own action wiring (coach_id, refresh).
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  AREA_TYPES,
  getAreaType,
  getProgressPercent,
  readMetricValue,
  suggestTarget,
  formatMetricValue,
  metricsForArea,
  findMetric,
  type AreaAutoFillStats,
  type MetricCatalogEntry,
} from './areaTypes';
import { Inset } from '@/components/fairway/surfaces';
import { Button } from '@/components/fairway/controls/button';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Badge } from '@/components/fairway/controls/badge';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import {
  FormSection,
  FormField,
  Input,
  TextArea,
  Select,
  NumberField,
} from '@/components/fairway/forms';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';

const AREA_OPTIONS = AREA_TYPES.map((a) => ({ value: a.value, label: a.label }));

type FocusAreaTimeframeKind = 'none' | 'date' | 'rounds';

/** Internal form shape (string fields for inputs; parsed on submit). */
interface FocusAreaForm {
  player_id: string;
  area_type: string;
  title: string;
  description: string;
  target_metric: string;
  current_value: string;
  target_value: string;
  target_kind: FocusAreaTimeframeKind;
  target_date: string;
  target_rounds: string;
}

const EMPTY_FORM: FocusAreaForm = {
  player_id: '',
  area_type: 'driving',
  title: '',
  description: '',
  target_metric: '',
  current_value: '',
  target_value: '',
  target_kind: 'none',
  target_date: '',
  target_rounds: '',
};

/** The normalized payload handed to the caller's persist action. */
export interface FocusAreaModalSubmit {
  player_id: string;
  area_type: string;
  title: string;
  description: string | null;
  target_metric: string | null;
  current_value: number | null;
  target_value: number | null;
  target_kind: 'date' | 'rounds' | null;
  target_date: string | null;
  target_rounds: number | null;
}

/** Pre-fill for the edit flow (values are pre-resolved by the caller). */
export interface FocusAreaModalInitial {
  player_id?: string;
  area_type?: string;
  title?: string;
  description?: string | null;
  target_metric?: string | null;
  current_value?: number | null;
  target_value?: number | null;
  target_kind?: 'date' | 'rounds' | null;
  target_date?: string | null;
  target_rounds?: number | null;
}

export interface FocusAreaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'coach' | 'player';
  /** Editing an existing area (locks player, relabels the CTA). */
  editing?: boolean;
  /** Coach mode: the roster to assign to. Ignored in player mode. */
  players?: { id: string; name: string }[];
  /** Per-player stats the catalog reads CURRENT values from. */
  playerStats: Record<string, AreaAutoFillStats | undefined>;
  /** Player mode: the fixed player. Coach create: optional preselect. */
  playerId?: string;
  /** Edit pre-fill. */
  initial?: FocusAreaModalInitial;
  /** Persist. Returns success so the modal can toast + close. */
  onSubmit: (payload: FocusAreaModalSubmit) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Build the form's starting state.
 *
 * Bug #59: on a fresh CREATE (no `initial`), the "Measurable target" section
 * used to open with `target_metric: ''` — no stat card highlighted, no unit,
 * both the Current/Target NumberFields blank with nothing to distinguish them
 * from decoration. It read as if the section had no real inputs at all. Fix:
 * mirror what `selectArea` already does when a coach/player manually changes
 * the category — pre-select the first catalog metric for the DEFAULT area
 * type up front, so the section always opens with one stat card active and
 * both value fields carrying a real unit (and a real value, when the
 * player's stats have one). Editing keeps using the caller's resolved
 * `initial` values untouched.
 */
function buildInitialForm(
  playerId: string | undefined,
  initial: FocusAreaModalInitial | undefined,
  stats: AreaAutoFillStats | undefined,
): FocusAreaForm {
  const base: FocusAreaForm = { ...EMPTY_FORM, player_id: playerId ?? '' };
  if (initial) {
    return {
      player_id: initial.player_id ?? base.player_id,
      area_type: initial.area_type || 'driving',
      title: initial.title || '',
      description: initial.description || '',
      target_metric: initial.target_metric || '',
      current_value: initial.current_value != null ? String(initial.current_value) : '',
      target_value: initial.target_value != null ? String(initial.target_value) : '',
      target_kind:
        initial.target_kind === 'date' || initial.target_kind === 'rounds'
          ? initial.target_kind
          : 'none',
      target_date: initial.target_date || '',
      target_rounds: initial.target_rounds != null ? String(initial.target_rounds) : '',
    };
  }

  const first = metricsForArea(base.area_type)[0];
  if (!first) return base;
  const cur = readMetricValue(first, stats);
  const tgt = suggestTarget(first, cur);
  return {
    ...base,
    target_metric: first.key,
    current_value: cur == null ? '' : String(cur),
    target_value: tgt == null ? '' : String(tgt),
  };
}

export function FocusAreaModal({
  open,
  onOpenChange,
  mode,
  editing = false,
  players = [],
  playerStats,
  playerId,
  initial,
  onSubmit,
}: FocusAreaModalProps) {
  const [form, setForm] = React.useState<FocusAreaForm>(() =>
    buildInitialForm(playerId, initial, playerId ? playerStats[playerId] : undefined),
  );
  const [saving, setSaving] = React.useState(false);
  const [customMode, setCustomMode] = React.useState(false);
  const baselineRef = React.useRef<FocusAreaForm>(form);
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);

  // Re-seed every piece of form-lifecycle state on the closed -> open edge.
  // Keep the dirty baseline in this same effect: a later effect would observe
  // `wasOpen.current === true` and leave the previous player's baseline behind.
  const wasOpen = React.useRef(open);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      const nextForm = buildInitialForm(
        playerId,
        initial,
        playerId ? playerStats[playerId] : undefined,
      );
      setForm(nextForm);
      baselineRef.current = nextForm;
      setCustomMode(false);
      setConfirmingDiscard(false);
    }
    wasOpen.current = open;
    // initial/playerId/playerStats are snapshotted at open; intentionally not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const playerOptions = React.useMemo(
    () => players.map((p) => ({ value: p.id, label: p.name })),
    [players],
  );

  const stats = form.player_id ? playerStats[form.player_id] : undefined;
  const area = getAreaType(form.area_type);
  const canSave = Boolean(form.player_id && form.title.trim());

  // Catalog metrics for the chosen area, each resolved to the player's CURRENT
  // value so the picker can show it next to the stat. Empty for areas with no
  // cached metrics (mental game, fitness) → the custom free-text input covers it.
  const areaMetrics = React.useMemo(
    () => metricsForArea(form.area_type),
    [form.area_type],
  );

  // Which catalog metric (if any) the current target_metric resolves to — drives
  // the active card highlight (resolves a stored label OR key).
  const selectedMetric = findMetric(form.target_metric);
  const selectedKey = selectedMetric?.key ?? null;
  // Unit of the currently-selected catalog metric (yds/%/ft/putts/strokes),
  // shown inside the Current/Target NumberFields (#59).
  const selectedMetricUnit = selectedMetric?.unit ?? '';
  // "Custom mode": a non-empty metric that ISN'T in the catalog, or the user
  // explicitly chose Custom. Reveals the free-text input.
  const showCustom = customMode || (!!form.target_metric && selectedKey == null);

  // Suggested target for the chosen metric + current value (null when unknown).
  const suggested = React.useMemo(() => {
    const cur = form.current_value === '' ? null : Number(form.current_value);
    return suggestTarget(form.target_metric, cur);
  }, [form.target_metric, form.current_value]);

  /* ---- handlers: area / metric selection drive autofill + suggestion ---- */

  function selectArea(areaType: string) {
    const metrics = metricsForArea(areaType);
    const first = metrics[0] ?? null;
    setCustomMode(metrics.length === 0); // no cached metrics → custom only
    setForm((prev) => {
      if (!first) {
        return { ...prev, area_type: areaType, target_metric: '', current_value: '', target_value: '' };
      }
      const cur = readMetricValue(first, stats);
      const tgt = suggestTarget(first, cur);
      return {
        ...prev,
        area_type: areaType,
        target_metric: first.key,
        current_value: cur == null ? '' : String(cur),
        target_value: tgt == null ? '' : String(tgt),
      };
    });
  }

  function selectMetric(entry: MetricCatalogEntry) {
    setCustomMode(false);
    const cur = readMetricValue(entry, stats);
    const tgt = suggestTarget(entry, cur);
    setForm((prev) => ({
      ...prev,
      target_metric: entry.key,
      // Autofill the current value; suggest a target the coach/player can edit.
      current_value: cur == null ? '' : String(cur),
      target_value: tgt == null ? '' : String(tgt),
    }));
  }

  function selectPlayer(nextId: string) {
    // Re-derive the current value for the selected metric against the new player.
    setForm((prev) => {
      const nextStats = playerStats[nextId];
      const entry = findMetric(prev.target_metric);
      const cur = entry ? readMetricValue(entry, nextStats) : null;
      const tgt = entry ? suggestTarget(entry, cur) : null;
      return {
        ...prev,
        player_id: nextId,
        ...(entry
          ? {
              current_value: cur == null ? '' : String(cur),
              target_value: tgt == null ? '' : String(tgt),
            }
          : {}),
      };
    });
  }

  function applySuggested() {
    if (suggested == null) return;
    setForm((prev) => ({ ...prev, target_value: String(suggested) }));
  }

  /* ---- unsaved-changes guard ---- */
  const isDirty = React.useMemo(() => {
    const b = baselineRef.current;
    return (
      form.player_id !== b.player_id ||
      form.area_type !== b.area_type ||
      form.title !== b.title ||
      form.description !== b.description ||
      form.target_metric !== b.target_metric ||
      form.current_value !== b.current_value ||
      form.target_value !== b.target_value ||
      form.target_kind !== b.target_kind ||
      form.target_date !== b.target_date ||
      form.target_rounds !== b.target_rounds
    );
  }, [form]);

  const requestClose = React.useCallback(() => {
    if (isDirty) setConfirmingDiscard(true);
    else onOpenChange(false);
  }, [isDirty, onOpenChange]);

  const discardAndClose = React.useCallback(() => {
    setConfirmingDiscard(false);
    onOpenChange(false);
  }, [onOpenChange]);

  /* ---- save ---- */
  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const roundsNum = form.target_rounds ? parseInt(form.target_rounds, 10) : NaN;
      const timeframe =
        form.target_kind === 'date' && form.target_date
          ? { target_kind: 'date' as const, target_date: form.target_date, target_rounds: null }
          : form.target_kind === 'rounds' && Number.isFinite(roundsNum) && roundsNum > 0
            ? { target_kind: 'rounds' as const, target_date: null, target_rounds: roundsNum }
            : { target_kind: null, target_date: null, target_rounds: null };

      const payload: FocusAreaModalSubmit = {
        player_id: form.player_id,
        area_type: form.area_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        target_metric: form.target_metric.trim() || null,
        current_value: form.current_value ? parseFloat(form.current_value) : null,
        target_value: form.target_value ? parseFloat(form.target_value) : null,
        ...timeframe,
      };

      const res = await onSubmit(payload);
      if (res.success) {
        fairwayToast.success(
          editing
            ? 'Focus area updated'
            : mode === 'coach'
              ? 'Focus area prescribed'
              : 'Focus area added',
        );
        onOpenChange(false);
      } else {
        fairwayToast.error(res.error ?? 'Could not save focus area');
      }
    } catch {
      fairwayToast.error('Could not save focus area');
    } finally {
      setSaving(false);
    }
  }

  const previewPct =
    form.current_value && form.target_value
      ? getProgressPercent(
          parseFloat(form.current_value),
          parseFloat(form.target_value),
          form.target_metric,
        )
      : null;

  const ctaLabel = editing
    ? 'Save changes'
    : mode === 'coach'
      ? 'Prescribe to player'
      : 'Add focus area';

  return (
    <ModalShell
      open={open}
      onOpenChange={(o) => {
        if (o) onOpenChange(true);
        else requestClose();
      }}
      size="xl"
      title={
        editing
          ? 'Edit focus area'
          : mode === 'coach'
            ? 'Prescribe a focus area'
            : 'New focus area'
      }
      description={
        editing
          ? 'Update the target and details for this development focus area.'
          : mode === 'coach'
            ? 'Set a measurable development focus — the player accepts to start tracking.'
            : 'Set a measurable focus area to track over your next rounds.'
      }
    >
      <ModalShell.Body>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start">
          {/* Assignment */}
          <FormSection title="Focus">
            {mode === 'coach' ? (
              <FormField label="Player" required>
                <Select
                  placeholder="Select a player…"
                  options={playerOptions}
                  value={form.player_id || undefined}
                  onValueChange={(v) => selectPlayer(v ?? '')}
                  disabled={editing}
                />
              </FormField>
            ) : null}

            <FormField label="Category" required>
              <Select
                options={AREA_OPTIONS}
                value={form.area_type}
                onValueChange={(v) => v && selectArea(v)}
              />
            </FormField>

            {/* Player snapshot — honest stat strip (props-fed, no recompute). */}
            {form.player_id ? (
              <Inset padding="sm" className="flex items-center gap-2">
                <span
                  className={cn(
                    'grid h-8 w-8 flex-shrink-0 place-items-center rounded-fw-sm',
                    'bg-accent-50 text-accent-700',
                  )}
                >
                  <area.icon size={16} />
                </span>
                {stats && stats.rounds_played > 0 ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-fw-sans text-eyebrow text-text-secondary">
                    <span>
                      Avg{' '}
                      <span className="font-fw-mono tabular-nums text-text-primary">
                        {stats.avg_score ?? '—'}
                      </span>
                    </span>
                    <span>
                      Putts{' '}
                      <span className="font-fw-mono tabular-nums text-text-primary">
                        {stats.avg_putts ?? '—'}
                      </span>
                    </span>
                    <span>
                      FW{' '}
                      <span className="font-fw-mono tabular-nums text-text-primary">
                        {stats.fairway_pct != null ? `${stats.fairway_pct}%` : '—'}
                      </span>
                    </span>
                    <span>
                      GIR{' '}
                      <span className="font-fw-mono tabular-nums text-text-primary">
                        {stats.gir_pct != null ? `${stats.gir_pct}%` : '—'}
                      </span>
                    </span>
                  </div>
                ) : (
                  <span className="font-fw-sans text-eyebrow italic text-text-tertiary">
                    No rounds recorded yet — values won&apos;t auto-fill.
                  </span>
                )}
              </Inset>
            ) : null}
          </FormSection>

          {/* Details */}
          <FormSection title="Details">
            <FormField label="Title" required>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Tighten driving dispersion"
              />
            </FormField>

            <FormField label="Description" showOptional>
              <TextArea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What should the player focus on, and why?"
                rows={3}
              />
            </FormField>
          </FormSection>
          </div>

          {/* Measurable target — catalog-driven picker with real player values */}
          <FormSection
            title="Measurable target"
            description="Pick the stat to improve — the player's current value is shown, and a target is suggested (golf metrics like putts/score are lower-is-better)."
          >
            {areaMetrics.length > 0 ? (
              <FormField label="Stat to improve" showOptional>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {areaMetrics.map((m) => {
                    const value = readMetricValue(m, stats);
                    const active = !showCustom && selectedKey === m.key;
                    return (
                      // Bespoke selectable stat card (label + the player's real
                      // value); <Button> can't express this two-column layout.
                      // eslint-disable-next-line helm/no-raw-button
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => selectMetric(m)}
                        aria-pressed={active}
                        className={cn(
                          'group flex items-center justify-between gap-3 rounded-fw-md border px-3 py-2.5 text-left',
                          'transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
                          active
                            ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-300'
                            : 'border-border-subtle bg-surface hover:border-border-strong hover:bg-surface-tint',
                        )}
                      >
                        <span
                          className={cn(
                            'font-fw-sans text-body-sm font-medium',
                            active ? 'text-accent-800' : 'text-text-primary',
                          )}
                        >
                          {m.label}
                        </span>
                        <span
                          className={cn(
                            'flex-shrink-0 font-fw-mono text-body-sm tabular-nums',
                            value == null ? 'text-text-tertiary' : 'text-text-primary',
                          )}
                        >
                          {value == null ? '—' : formatMetricValue(m, value)}
                        </span>
                      </button>
                    );
                  })}
                  {/* Dashed "custom" affordance — a bespoke card, not a Button. */}
                  {/* eslint-disable-next-line helm/no-raw-button */}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomMode(true);
                      setForm((prev) => ({ ...prev, target_metric: '' }));
                    }}
                    aria-pressed={showCustom}
                    className={cn(
                      'flex items-center justify-center rounded-fw-md border border-dashed px-3 py-2.5 text-left',
                      'font-fw-sans text-body-sm transition-all duration-200',
                      showCustom
                        ? 'border-accent-400 bg-accent-50 text-accent-800'
                        : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:bg-surface-tint',
                    )}
                  >
                    Custom metric…
                  </button>
                </div>
              </FormField>
            ) : null}

            {showCustom || areaMetrics.length === 0 ? (
              <FormField label="Custom metric" showOptional>
                <Input
                  value={form.target_metric}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, target_metric: e.target.value }))
                  }
                  placeholder="e.g. Pre-shot routine consistency"
                />
                <p className="mt-1 font-fw-sans text-eyebrow text-text-tertiary">
                  Custom metrics won&apos;t auto-track — update progress manually.
                </p>
              </FormField>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Current value" showOptional>
                <NumberField
                  value={form.current_value === '' ? null : Number(form.current_value)}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, current_value: v == null ? '' : String(v) }))
                  }
                  // #59: an empty NumberField with no unit reads as decoration,
                  // not an input — showing the metric's real unit (yds/%/ft/
                  // putts/strokes) makes clear this box is tied to a specific,
                  // pickable stat even before any value is entered.
                  unit={selectedMetricUnit || undefined}
                />
              </FormField>
              <FormField label="Target value" showOptional>
                <NumberField
                  value={form.target_value === '' ? null : Number(form.target_value)}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, target_value: v == null ? '' : String(v) }))
                  }
                  unit={selectedMetricUnit || undefined}
                />
                {suggested != null && String(suggested) !== form.target_value ? (
                  // Inline text affordance to apply the suggested target.
                  // eslint-disable-next-line helm/no-raw-button
                  <button
                    type="button"
                    onClick={applySuggested}
                    className="mt-1 font-fw-sans text-eyebrow text-accent-700 underline-offset-2 hover:underline"
                  >
                    Suggested: {formatMetricValue(form.target_metric, suggested)} — use it
                  </button>
                ) : null}
              </FormField>
            </div>

            {/* Timeframe */}
            <FormField label="Timeframe" showOptional>
              <div className="space-y-3">
                <Segmented<FocusAreaTimeframeKind>
                  aria-label="Target timeframe"
                  value={form.target_kind}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      target_kind: v,
                      ...(v === 'date' ? { target_rounds: '' } : {}),
                      ...(v === 'rounds' ? { target_date: '' } : {}),
                      ...(v === 'none' ? { target_date: '', target_rounds: '' } : {}),
                    }))
                  }
                  options={[
                    { value: 'none', label: 'No deadline' },
                    { value: 'date', label: 'By date' },
                    { value: 'rounds', label: 'In rounds' },
                  ]}
                />

                {form.target_kind === 'date' ? (
                  <Input
                    type="date"
                    aria-label="Target date"
                    value={form.target_date}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, target_date: e.target.value }))
                    }
                  />
                ) : null}

                {form.target_kind === 'rounds' ? (
                  <NumberField
                    aria-label="Number of rounds"
                    min={1}
                    value={form.target_rounds === '' ? null : Number(form.target_rounds)}
                    onValueChange={(v) =>
                      setForm((prev) => ({ ...prev, target_rounds: v == null ? '' : String(v) }))
                    }
                  />
                ) : null}
              </div>
            </FormField>

            {previewPct != null ? (
              <p className="font-fw-sans text-eyebrow text-text-tertiary">
                Starting at{' '}
                <Badge tone={previewPct >= 100 ? 'success' : 'neutral'} size="sm" numeric>
                  {previewPct}%
                </Badge>{' '}
                of target.
              </p>
            ) : null}
          </FormSection>
        </div>
      </ModalShell.Body>

      {confirmingDiscard ? (
        <ModalShell.Footer>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="font-fw-sans text-body-sm font-medium text-text-primary">
              Discard your unsaved changes?
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setConfirmingDiscard(false)} disabled={saving}>
                Keep editing
              </Button>
              <Button variant="danger" onClick={discardAndClose} disabled={saving}>
                Discard changes
              </Button>
            </div>
          </div>
        </ModalShell.Footer>
      ) : (
        <ModalShell.Footer>
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" busy={saving} disabled={!canSave} onClick={handleSave}>
            {ctaLabel}
          </Button>
        </ModalShell.Footer>
      )}
    </ModalShell>
  );
}
