'use client';

// =============================================================================
// src/components/baseball/performance/ExerciseWizard.tsx
//
// Wave 4 — 7-step premium wizard for creating and editing exercises in the
// Helm Lifting Lab. Presentational: the parent wires onSubmit to
// createExercise / updateExercise from lifting actions — this component
// never imports actions directly.
//
// Steps:
//   1. Basics         — name (required) + category pills
//   2. Movement       — movementPattern selection (required)
//   3. Body Regions   — primary / secondary / stress multi-select from
//                       SORENESS_REGIONS (click to cycle role)
//   4. Stress Profile — 5 StressLevel segmented selectors + isPitcherSensitive
//   5. Equipment      — equipment[] tag chips + custom free-text add
//   6. Demo Video     — demoVideoUrl (optional URL input)
//   7. Review         — read-only summary before Save
//
// Design: cream/green tokens, framer-motion tabPanelMotion (reduced-motion-safe),
// sticky footer (Back / Next / Save), horizontal progress rail at top.
// Includes its own Modal shell — parent conditionally renders the component.
//
// Types imported (with `import type`) from the shared contract in
// '@/lib/baseball/exercise-conflict' (owned by the conflict-engine agent).
// =============================================================================

import { useState, useTransition } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  IconCheck,
  IconArrowLeft,
  IconArrowRight,
  IconSave,
  IconVideo,
  IconX,
  IconPlus,
  IconInfo,
  IconWarning,
} from '@/components/icons';
import { InkNotice } from '@/components/baseball/living-annual';
import { SORENESS_REGIONS, SORENESS_REGION_IDS } from '@/lib/lifting/soreness-regions';
import type { SorenessRegionGroup } from '@/lib/lifting/soreness-regions';
import { tabPanelMotion } from '@/lib/baseball/motion';
import type { BuilderExercise, StressLevel } from '@/lib/baseball/exercise-conflict';

// =============================================================================
// Vocabularies (mirrors DB CHECK constraints; extend here when adding options)
// =============================================================================

const CATEGORY_OPTIONS = [
  'strength', 'power', 'hypertrophy', 'conditioning',
  'mobility', 'arm_care', 'warmup', 'recovery', 'plyometric', 'carry',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Strength',
  power: 'Power',
  hypertrophy: 'Hypertrophy',
  conditioning: 'Conditioning',
  mobility: 'Mobility',
  arm_care: 'Arm Care',
  warmup: 'Warm-up',
  recovery: 'Recovery',
  plyometric: 'Plyometric',
  carry: 'Carry',
};

const MOVEMENT_OPTIONS = [
  'push_horizontal', 'push_vertical',
  'pull_horizontal', 'pull_vertical',
  'hinge', 'squat', 'lunge',
  'carry', 'rotate', 'isometric',
  'jump', 'throw', 'sprint',
] as const;

const MOVEMENT_LABELS: Record<string, string> = {
  push_horizontal: 'Push — Horizontal',
  push_vertical: 'Push — Vertical',
  pull_horizontal: 'Pull — Horizontal',
  pull_vertical: 'Pull — Vertical',
  hinge: 'Hinge',
  squat: 'Squat',
  lunge: 'Lunge',
  carry: 'Carry',
  rotate: 'Rotation',
  isometric: 'Isometric',
  jump: 'Jump / Plyometric',
  throw: 'Throw / Med Ball',
  sprint: 'Sprint / Speed',
};

const COMMON_EQUIPMENT = [
  'barbell', 'dumbbell', 'kettlebell', 'resistance_band',
  'cable', 'machine', 'bodyweight', 'medicine_ball',
  'trap_bar', 'box', 'bench', 'pull_up_bar',
  'foam_roller', 'battle_ropes', 'sled',
] as const;

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  resistance_band: 'Band',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  medicine_ball: 'Med Ball',
  trap_bar: 'Trap Bar',
  box: 'Box',
  bench: 'Bench',
  pull_up_bar: 'Pull-up Bar',
  foam_roller: 'Foam Roller',
  battle_ropes: 'Battle Ropes',
  sled: 'Sled',
};

const STRESS_LEVEL_OPTIONS: ReadonlyArray<{ value: StressLevel; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
];

const GROUP_LABELS: Record<SorenessRegionGroup, string> = {
  upper_body: 'Upper Body',
  trunk: 'Back / Trunk',
  hips: 'Core / Hips',
  lower_body: 'Lower Body',
  whole_body: 'Whole Body',
};

const GROUP_ORDER: SorenessRegionGroup[] = [
  'upper_body', 'trunk', 'hips', 'lower_body', 'whole_body',
];

// Pre-group regions for render — stable, computed once at module level.
const GROUPED_REGIONS = SORENESS_REGION_IDS.reduce<
  Record<SorenessRegionGroup, Array<{ id: string; label: string }>>
>(
  (acc, id) => {
    const r = SORENESS_REGIONS[id];
    acc[r.group].push({ id, label: r.label });
    return acc;
  },
  { upper_body: [], trunk: [], hips: [], lower_body: [], whole_body: [] },
);

// =============================================================================
// Step definitions
// =============================================================================

const STEPS = [
  { id: 'basics',    label: 'Basics' },
  { id: 'movement',  label: 'Movement' },
  { id: 'regions',   label: 'Body Regions' },
  { id: 'stress',    label: 'Stress Profile' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'video',     label: 'Demo Video' },
  { id: 'review',    label: 'Review' },
] as const satisfies ReadonlyArray<{ id: string; label: string }>;

const LAST_STEP = STEPS.length - 1;

// =============================================================================
// Default draft builder
// =============================================================================

function buildDraft(initial?: Partial<BuilderExercise>): BuilderExercise {
  const fallbackId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `ex-${Date.now()}`;
  return {
    id: initial?.id ?? fallbackId,
    name: initial?.name ?? '',
    category: initial?.category ?? '',
    movementPattern: initial?.movementPattern ?? '',
    primaryBodyRegions: initial?.primaryBodyRegions ?? [],
    secondaryBodyRegions: initial?.secondaryBodyRegions ?? [],
    stressRegions: initial?.stressRegions ?? [],
    throwingArmStress: initial?.throwingArmStress ?? 'none',
    spineLoading: initial?.spineLoading ?? 'none',
    lowerBodyLoading: initial?.lowerBodyLoading ?? 'none',
    rotationalStress: initial?.rotationalStress ?? 'none',
    gripStress: initial?.gripStress ?? 'none',
    isPitcherSensitive: initial?.isPitcherSensitive ?? false,
    equipment: initial?.equipment ?? [],
    demoVideoUrl: initial?.demoVideoUrl ?? null,
  };
}

// =============================================================================
// Per-step validation
// =============================================================================

function validateStep(stepIndex: number, draft: BuilderExercise): string | null {
  switch (stepIndex) {
    case 0:
      return draft.name.trim() ? null : 'Exercise name is required.';
    case 1:
      return draft.movementPattern ? null : 'Select a movement pattern before continuing.';
    case 2:
      return draft.primaryBodyRegions.length > 0
        ? null
        : 'Select at least one primary body region.';
    case 3:
      return null; // all stress fields default to 'none' — always valid
    case 4:
      return null; // equipment is optional
    case 5: {
      const url = draft.demoVideoUrl?.trim();
      if (!url) return null;
      try {
        new URL(url);
        return null;
      } catch {
        return 'Enter a valid URL (https://…) or leave blank.';
      }
    }
    case 6:
      return null; // review — validation happens on submit
    default:
      return null;
  }
}

// =============================================================================
// Props
// =============================================================================

export interface ExerciseWizardProps {
  /** Provide to pre-populate for editing an existing exercise. */
  initial?: Partial<BuilderExercise>;
  /** Called with the assembled BuilderExercise. The parent wires this to
   *  createExercise / updateExercise server actions. */
  onSubmit: (value: BuilderExercise) => Promise<void>;
  /** Close/unmount the wizard. */
  onClose: () => void;
}

// =============================================================================
// ExerciseWizard — root
// =============================================================================

export function ExerciseWizard({ initial, onSubmit, onClose }: ExerciseWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<BuilderExercise>(() => buildDraft(initial));
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const reduce = useReducedMotion();
  const isEdit = Boolean(initial?.id);

  function patch(updates: Partial<BuilderExercise>) {
    setDraft((prev) => ({ ...prev, ...updates }));
    // Clear validation error as soon as the user makes a change.
    setStepError(null);
  }

  function goNext() {
    const err = validateStep(step, draft);
    if (err) { setStepError(err); return; }
    setStepError(null);
    if (step < LAST_STEP) setStep((s) => s + 1);
  }

  function goBack() {
    setStepError(null);
    if (step > 0) setStep((s) => s - 1);
  }

  function jumpTo(i: number) {
    // Forward jumps require passing validation of every intermediate step;
    // backward jumps are always allowed.
    if (i >= step) return;
    setStepError(null);
    setStep(i);
  }

  function handleSubmit() {
    const err = validateStep(step, draft);
    if (err) { setStepError(err); return; }
    setSubmitError(null);
    startSubmit(async () => {
      try {
        await onSubmit(draft);
        onClose();
      } catch (e) {
        setSubmitError(
          e instanceof Error ? e.message : 'Could not save the exercise. Please try again.',
        );
      }
    });
  }

  // STEPS is a const tuple; step is bounded to [0, LAST_STEP].
  const currentStep = STEPS[step] as (typeof STEPS)[number];
  const motionProps = tabPanelMotion(reduce);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit exercise${draft.name ? ` — ${draft.name}` : ''}` : 'New exercise'}
      size="xl"
      sheetOnMobile
    >
      {/* Progress rail */}
      <ProgressRail currentStep={step} onJump={jumpTo} />

      {/* Step content — min-height prevents layout shift between short/tall steps */}
      <div className="min-h-[340px] py-5">
        <AnimatePresence mode="wait">
          <motion.div key={currentStep.id} {...motionProps}>
            {step === 0 && <StepBasics draft={draft} onChange={patch} />}
            {step === 1 && <StepMovement draft={draft} onChange={patch} />}
            {step === 2 && <StepBodyRegions draft={draft} onChange={patch} />}
            {step === 3 && <StepStressProfile draft={draft} onChange={patch} />}
            {step === 4 && <StepEquipment draft={draft} onChange={patch} />}
            {step === 5 && <StepDemoVideo draft={draft} onChange={patch} />}
            {step === 6 && <StepReview draft={draft} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky footer — rounded-b matches Modal's own outer radius (rounded-[24px]
          on md+ once sheetOnMobile collapses to a fully-rounded dialog; flush
          rounded-b-none on mobile where the sheet sits bottom-anchored) so this
          full-bleed footer doesn't paint square corners over Modal's rounded shape. */}
      <div className="sticky bottom-0 -mx-6 -mb-6 rounded-b-none md:rounded-b-[24px] border-t border-warm-100 bg-cream-50/95 px-6 py-4">
        {(stepError ?? submitError) && (
          <InkNotice role="alert" className="mb-3">
            {stepError ?? submitError}
          </InkNotice>
        )}
        <div className="flex items-center justify-between gap-3">
          {/* Left: Cancel or Back */}
          <Button
            variant="ghost"
            leftIcon={step === 0 ? undefined : <IconArrowLeft size={16} />}
            onClick={step === 0 ? onClose : goBack}
            disabled={submitting}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>

          {/* Right: step counter + Next or Save */}
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-xs text-warm-400" aria-hidden>
              {step + 1} / {STEPS.length}
            </span>
            {step < LAST_STEP ? (
              <Button
                variant="primary"
                rightIcon={<IconArrowRight size={16} />}
                onClick={goNext}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="primary"
                leftIcon={<IconSave size={16} />}
                onClick={handleSubmit}
                isLoading={submitting}
              >
                {isEdit ? 'Save changes' : 'Add exercise'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// Progress rail
// =============================================================================

function ProgressRail({
  currentStep,
  onJump,
}: {
  currentStep: number;
  onJump: (i: number) => void;
}) {
  const currentLabel = STEPS[currentStep]?.label ?? '';

  return (
    <>
      {/* Compact step indicator — visible only on small screens where rail labels are hidden */}
      <p className="sm:hidden mb-2 text-xs font-medium text-warm-500">
        Step {currentStep + 1} of {STEPS.length} — {currentLabel}
      </p>

      <nav
        aria-label="Wizard steps"
        className="mb-5 flex items-center gap-1"
      >
        {STEPS.map((s, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <Button
              key={s.id}
              aria-current={active ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${s.label}${done ? ' — complete' : ''}`}
              title={s.label}
              onClick={() => onJump(i)}
              disabled={i > currentStep}
              variant={active ? 'primary' : done ? 'secondary' : 'ghost'}
              className={[
                'flex-1 min-h-[44px] py-1.5 rounded-full text-caption uppercase tracking-wide',
                !done && !active ? 'text-warm-400' : '',
              ].join(' ')}
            >
              {done ? (
                <span className="flex items-center justify-center gap-0.5">
                  <IconCheck size={10} aria-hidden />
                  <span className="hidden sm:inline">{s.label}</span>
                </span>
              ) : (
                <>
                  <span className="hidden sm:inline">{s.label}</span>
                  {/* Numeric fallback on very small screens */}
                  <span className="sm:hidden">{i + 1}</span>
                </>
              )}
            </Button>
          );
        })}
      </nav>
    </>
  );
}

// =============================================================================
// Step 1: Basics
// =============================================================================

function StepBasics({
  draft,
  onChange,
}: {
  draft: BuilderExercise;
  onChange: (p: Partial<BuilderExercise>) => void;
}) {
  return (
    <div className="space-y-5">
      <StepHeader
        title="Exercise basics"
        description="Name this exercise and choose a training category."
      />

      <Input
        label="Exercise name"
        placeholder="e.g. Romanian Deadlift"
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-warm-500">
          Category <span className="text-warm-400">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map((c) => (
            <PillToggle
              key={c}
              label={CATEGORY_LABELS[c] ?? c}
              active={draft.category === c}
              onClick={() => onChange({ category: draft.category === c ? '' : c })}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// =============================================================================
// Step 2: Movement pattern
// =============================================================================

function StepMovement({
  draft,
  onChange,
}: {
  draft: BuilderExercise;
  onChange: (p: Partial<BuilderExercise>) => void;
}) {
  return (
    <div className="space-y-5">
      <StepHeader
        title="Movement pattern"
        description="Choose the primary movement pattern. The conflict engine uses this to flag mechanical overlaps across a session."
      />

      <fieldset>
        <legend className="sr-only">Movement pattern</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MOVEMENT_OPTIONS.map((m) => {
            const active = draft.movementPattern === m;
            return (
              <Button
                key={m}
                aria-pressed={active}
                onClick={() => onChange({ movementPattern: active ? '' : m })}
                variant={active ? 'secondary' : 'outline'}
                className={[
                  'min-h-0 h-auto py-2.5 rounded-xl justify-start text-left text-sm font-medium',
                  active ? 'border-primary-400 bg-primary-50 text-primary-800' : '',
                ].join(' ')}
              >
                {MOVEMENT_LABELS[m] ?? m}
              </Button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

// =============================================================================
// Step 3: Body Regions
// =============================================================================

type RegionRole = 'primary' | 'secondary' | 'stress';

// Lane-ink per role: `primary` is the team-ink brand fill (the exercise's main
// load), `secondary` a quiet graphite tint (a lesser degree, not a warning),
// `stress` the pursuit-ink lane (this region is genuinely a caution flag).
const ROLE_META: Record<RegionRole, { label: string; activeCls: string }> = {
  primary: {
    label: 'Primary',
    activeCls: 'border-primary-500 bg-primary-600 text-white',
  },
  secondary: {
    label: 'Secondary',
    activeCls: 'border-grade-avg/40 bg-grade-avg/10 text-grade-avg',
  },
  stress: {
    label: 'Stress',
    activeCls: 'border-pursuit/50 bg-pursuit/10 text-pursuit',
  },
};

const CYCLE_ORDER: Array<RegionRole | null> = [null, 'primary', 'secondary', 'stress'];

function regionRole(draft: BuilderExercise, id: string): RegionRole | null {
  if (draft.primaryBodyRegions.includes(id)) return 'primary';
  if (draft.secondaryBodyRegions.includes(id)) return 'secondary';
  if (draft.stressRegions.includes(id)) return 'stress';
  return null;
}

function cycleRegion(draft: BuilderExercise, id: string): Partial<BuilderExercise> {
  const cur = regionRole(draft, id);
  const curIdx = CYCLE_ORDER.indexOf(cur);
  const next = CYCLE_ORDER[(curIdx + 1) % CYCLE_ORDER.length];

  const withoutId = {
    primaryBodyRegions: draft.primaryBodyRegions.filter((r) => r !== id),
    secondaryBodyRegions: draft.secondaryBodyRegions.filter((r) => r !== id),
    stressRegions: draft.stressRegions.filter((r) => r !== id),
  };

  if (next === null) return withoutId;
  if (next === 'primary') return { ...withoutId, primaryBodyRegions: [...withoutId.primaryBodyRegions, id] };
  if (next === 'secondary') return { ...withoutId, secondaryBodyRegions: [...withoutId.secondaryBodyRegions, id] };
  return { ...withoutId, stressRegions: [...withoutId.stressRegions, id] };
}

function StepBodyRegions({
  draft,
  onChange,
}: {
  draft: BuilderExercise;
  onChange: (p: Partial<BuilderExercise>) => void;
}) {
  const selectedCount =
    draft.primaryBodyRegions.length +
    draft.secondaryBodyRegions.length +
    draft.stressRegions.length;

  return (
    <div className="space-y-5">
      <StepHeader
        title="Body regions"
        description="Tag which regions this exercise loads. Click a region to cycle: none → Primary → Secondary → Stress → none."
      />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.entries(ROLE_META) as Array<[RegionRole, typeof ROLE_META[RegionRole]]>).map(
          ([role, meta]) => (
            <span
              key={role}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.activeCls}`}
            >
              {meta.label}
            </span>
          ),
        )}
        <span className="inline-flex items-center rounded-full border border-warm-200 bg-cream-50 px-2.5 py-0.5 text-xs font-medium text-warm-400">
          Unselected
        </span>
        {selectedCount > 0 && (
          <span className="ml-auto text-xs font-medium text-primary-700 tabular-nums">
            {selectedCount} selected
          </span>
        )}
      </div>

      {GROUP_ORDER.map((group) => {
        const regions = GROUPED_REGIONS[group];
        if (regions.length === 0) return null;
        return (
          <div key={group}>
            <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-wider text-warm-400">
              {GROUP_LABELS[group]}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {regions.map(({ id, label }) => {
                const role = regionRole(draft, id);
                const meta = role ? ROLE_META[role] : null;
                return (
                  <Button
                    key={id}
                    aria-pressed={Boolean(role)}
                    aria-label={`${label}: ${role ?? 'unselected'} — click to cycle`}
                    onClick={() => onChange(cycleRegion(draft, id))}
                    variant="outline"
                    className={[
                      'min-h-0 py-1 rounded-full text-xs font-medium',
                      meta
                        ? meta.activeCls + ' border-current'
                        : 'border-warm-200 text-warm-500',
                    ].join(' ')}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Step 4: Stress Profile
// =============================================================================

function StepStressProfile({
  draft,
  onChange,
}: {
  draft: BuilderExercise;
  onChange: (p: Partial<BuilderExercise>) => void;
}) {
  return (
    <div className="space-y-4">
      <StepHeader
        title="Stress profile"
        description="Rate how much mechanical and systemic stress this exercise generates. The conflict engine uses these to surface load-spike warnings."
      />

      <StressSelector
        label="Throwing arm stress"
        description="Load on the shoulder, elbow, and forearm chain."
        value={draft.throwingArmStress}
        onChange={(v) => onChange({ throwingArmStress: v })}
      />
      <StressSelector
        label="Spine loading"
        description="Axial or shear forces through the lumbar and thoracic spine."
        value={draft.spineLoading}
        onChange={(v) => onChange({ spineLoading: v })}
      />
      <StressSelector
        label="Lower body loading"
        description="Quad, hamstring, knee, and hip cumulative demand."
        value={draft.lowerBodyLoading}
        onChange={(v) => onChange({ lowerBodyLoading: v })}
      />
      <StressSelector
        label="Rotational stress"
        description="Torso rotation demand — overlaps with pitching mechanics."
        value={draft.rotationalStress}
        onChange={(v) => onChange({ rotationalStress: v })}
      />
      <StressSelector
        label="Grip stress"
        description="Forearm and hand fatigue — relevant for bat speed and throwing."
        value={draft.gripStress}
        onChange={(v) => onChange({ gripStress: v })}
      />

      <div className="rounded-xl border border-warm-100 bg-cream-100/60 px-4 pt-1 pb-2">
        <Checkbox
          label="Pitcher-sensitive"
          description="Adds extra caution when scheduling pitchers, even on low-stress days."
          checked={draft.isPitcherSensitive}
          onChange={(e) =>
            onChange({ isPitcherSensitive: (e.target as HTMLInputElement).checked })
          }
        />
      </div>
    </div>
  );
}

/** Segmented four-option selector for a StressLevel field. */
function StressSelector({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: StressLevel;
  onChange: (v: StressLevel) => void;
}) {
  // Lane-ink ordinal ramp: `none`/`low` stay neutral/team (still fine), `medium`
  // and `high` both read pursuit clay — the border/bg weight (not a new hue)
  // carries the extra step of severity between them.
  const ACTIVE_CLS: Record<StressLevel, string> = {
    none: 'border-warm-300 bg-warm-100 text-warm-700',
    low: 'border-primary-400 bg-primary-50 text-primary-800',
    medium: 'border-pursuit/40 bg-pursuit/10 text-pursuit',
    high: 'border-pursuit bg-pursuit/20 text-pursuit',
  };

  return (
    <div className="rounded-xl border border-warm-100 bg-cream-50 px-4 py-3">
      <p className="text-sm font-medium text-warm-900">{label}</p>
      <p className="mb-2.5 text-xs text-warm-500">{description}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex items-center gap-1.5"
      >
        {STRESS_LEVEL_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            variant="outline"
            className={[
              'flex-1 min-h-0 py-1.5 rounded-lg text-xs font-semibold',
              value === opt.value ? ACTIVE_CLS[opt.value] : 'text-warm-400',
            ].join(' ')}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Step 5: Equipment
// =============================================================================

function StepEquipment({
  draft,
  onChange,
}: {
  draft: BuilderExercise;
  onChange: (p: Partial<BuilderExercise>) => void;
}) {
  const [customInput, setCustomInput] = useState('');

  function toggleEquipment(item: string) {
    onChange({
      equipment: draft.equipment.includes(item)
        ? draft.equipment.filter((e) => e !== item)
        : [...draft.equipment, item],
    });
  }

  function addCustom() {
    const v = customInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v || draft.equipment.includes(v)) {
      setCustomInput('');
      return;
    }
    onChange({ equipment: [...draft.equipment, v] });
    setCustomInput('');
  }

  return (
    <div className="space-y-5">
      <StepHeader
        title="Equipment"
        description="Select all equipment this exercise requires. Leave blank for a bodyweight exercise."
      />

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-warm-500">Common equipment</legend>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_EQUIPMENT.map((eq) => (
            <PillToggle
              key={eq}
              label={EQUIPMENT_LABELS[eq] ?? eq}
              active={draft.equipment.includes(eq)}
              onClick={() => toggleEquipment(eq)}
            />
          ))}
        </div>
      </fieldset>

      {/* Custom equipment free-text */}
      <div className="flex gap-2">
        <Input
          placeholder="Add custom equipment…"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          className="flex-1"
        />
        <Button variant="outline" leftIcon={<IconPlus size={16} />} onClick={addCustom}>
          Add
        </Button>
      </div>

      {/* Selected chips */}
      {draft.equipment.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-warm-500">Selected</p>
          <div className="flex flex-wrap gap-1.5">
            {draft.equipment.map((eq) => (
              <span
                key={eq}
                className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800"
              >
                {EQUIPMENT_LABELS[eq] ?? eq.replace(/_/g, ' ')}
                <Button
                  variant="ghost"
                  aria-label={`Remove ${EQUIPMENT_LABELS[eq] ?? eq}`}
                  onClick={() =>
                    onChange({ equipment: draft.equipment.filter((e) => e !== eq) })
                  }
                  className="ml-0.5 h-auto w-auto min-h-0 p-0.5 rounded-full"
                >
                  <IconX size={11} aria-hidden />
                </Button>
              </span>
            ))}
          </div>
        </div>
      )}

      {draft.equipment.length === 0 && (
        <p className="text-sm italic text-warm-400">
          No equipment selected — this will appear as a bodyweight exercise.
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Step 6: Demo Video
// =============================================================================

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function StepDemoVideo({
  draft,
  onChange,
}: {
  draft: BuilderExercise;
  onChange: (p: Partial<BuilderExercise>) => void;
}) {
  const url = draft.demoVideoUrl ?? '';
  const valid = url.trim() !== '' && isValidUrl(url.trim());

  return (
    <div className="space-y-5">
      <StepHeader
        title="Demo video"
        description="Paste a YouTube or direct video URL so athletes can watch correct form. Optional — the exercise works fine without one."
      />

      <Input
        label="Video URL"
        type="url"
        placeholder="https://youtube.com/watch?v=…"
        value={url}
        leftIcon={<IconVideo size={16} className="text-warm-400" />}
        onChange={(e) =>
          onChange({ demoVideoUrl: e.target.value.trim() || null })
        }
      />

      {valid && (
        <div className="flex items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2.5 text-sm font-medium text-primary-700">
          <IconCheck size={14} aria-hidden />
          Valid URL — athletes will see an inline demo link in the session card.
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-warm-100 bg-cream-100/40 px-3 py-2.5 text-xs text-warm-500">
        <IconInfo size={13} className="mt-0.5 shrink-0" aria-hidden />
        YouTube, Vimeo, and direct video links are all supported. Videos are shown
        inline in the exercise card during a live session.
      </div>
    </div>
  );
}

// =============================================================================
// Step 7: Review
// =============================================================================

const STRESS_BADGE_CLS: Record<StressLevel, string> = {
  none: 'bg-warm-100 text-warm-500',
  low: 'bg-primary-50 text-primary-700',
  medium: 'bg-pursuit/10 text-pursuit',
  high: 'bg-pursuit/20 text-pursuit',
};

function resolveRegionLabel(id: string): string {
  const r = SORENESS_REGIONS[id as keyof typeof SORENESS_REGIONS];
  return r?.label ?? id;
}

function StepReview({ draft }: { draft: BuilderExercise }) {
  return (
    <div className="space-y-5">
      <StepHeader
        title="Review"
        description="Check everything looks right before saving."
      />

      <dl className="divide-y divide-warm-50 rounded-xl border border-warm-100 bg-cream-50">
        <ReviewRow
          label="Name"
          value={draft.name || '—'}
          highlight={!draft.name}
        />
        <ReviewRow
          label="Category"
          value={
            draft.category
              ? (CATEGORY_LABELS[draft.category] ?? draft.category)
              : 'None'
          }
        />
        <ReviewRow
          label="Movement pattern"
          value={
            draft.movementPattern
              ? (MOVEMENT_LABELS[draft.movementPattern] ?? draft.movementPattern)
              : '—'
          }
          highlight={!draft.movementPattern}
        />
        <ReviewRow
          label="Primary regions"
          value={
            draft.primaryBodyRegions.length > 0
              ? draft.primaryBodyRegions.map(resolveRegionLabel).join(', ')
              : '—'
          }
          highlight={draft.primaryBodyRegions.length === 0}
        />
        <ReviewRow
          label="Secondary regions"
          value={
            draft.secondaryBodyRegions.length > 0
              ? draft.secondaryBodyRegions.map(resolveRegionLabel).join(', ')
              : 'None'
          }
        />
        <ReviewRow
          label="Stress regions"
          value={
            draft.stressRegions.length > 0
              ? draft.stressRegions.map(resolveRegionLabel).join(', ')
              : 'None'
          }
        />
        <ReviewRow
          label="Equipment"
          value={
            draft.equipment.length > 0
              ? draft.equipment
                  .map((e) => EQUIPMENT_LABELS[e] ?? e.replace(/_/g, ' '))
                  .join(', ')
              : 'Bodyweight'
          }
        />
        <ReviewRow
          label="Demo video"
          value={draft.demoVideoUrl ?? 'Not set'}
        />
      </dl>

      {/* Stress profile summary */}
      <div>
        <p className="mb-2 text-eyebrow font-semibold uppercase tracking-wider text-warm-400">
          Stress profile
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StressReviewPill label="Throwing arm" value={draft.throwingArmStress} />
          <StressReviewPill label="Spine" value={draft.spineLoading} />
          <StressReviewPill label="Lower body" value={draft.lowerBodyLoading} />
          <StressReviewPill label="Rotational" value={draft.rotationalStress} />
          <StressReviewPill label="Grip" value={draft.gripStress} />
          {draft.isPitcherSensitive && (
            <div className="flex items-center gap-1.5 rounded-lg border border-pursuit/30 bg-pursuit/10 px-3 py-2 text-xs font-semibold text-pursuit">
              <IconWarning size={12} aria-hidden />
              Pitcher-sensitive
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5">
      <dt className="w-32 shrink-0 text-xs font-medium text-warm-500">{label}</dt>
      <dd className={`text-sm ${highlight ? 'font-medium text-pursuit' : 'text-warm-900'}`}>
        {value}
      </dd>
    </div>
  );
}

function StressReviewPill({ label, value }: { label: string; value: StressLevel }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-warm-100 px-3 py-2">
      <span className="text-xs text-warm-500">{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STRESS_BADGE_CLS[value]}`}
      >
        {value}
      </span>
    </div>
  );
}

// =============================================================================
// Shared primitive: PillToggle
// Uses <Button> with compact size overrides — respects the helm/no-raw-button rule.
// =============================================================================

function PillToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-pressed={active}
      onClick={onClick}
      variant={active ? 'secondary' : 'outline'}
      className={[
        'min-h-0 py-1 px-3 rounded-full text-xs font-medium',
        active ? 'border-primary-400 bg-primary-100 text-primary-800' : 'text-warm-600',
      ].join(' ')}
    >
      {label}
    </Button>
  );
}

// =============================================================================
// Shared primitive: StepHeader
// =============================================================================

function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-1">
      <h3 className="text-base font-semibold text-warm-900">{title}</h3>
      <p className="mt-0.5 text-sm text-warm-500">{description}</p>
    </div>
  );
}
