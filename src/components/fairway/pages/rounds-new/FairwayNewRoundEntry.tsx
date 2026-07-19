'use client';

/**
 * ============================================================================
 * Fairway · Rounds · FairwayNewRoundEntry — the redesigned create-round ENTRY
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Renders the first three create-round screens — the resume
 * gate, the Setup step, and the Holes-config wrapper — in the warm Fairway
 * system. It owns NO state, NO mutations, NO autosave: every value + callback
 * is passed from new-round-client.tsx, which keeps the whole state machine +
 * persistence/optimistic-lock/submit machinery intact.
 *
 * DESIGN — a real three-value system (fixes the old cream-on-cream flatness):
 *   • a dark warm-black "cockpit" header band (bg-nav-bg + .on-dark) carrying
 *     the title + a green 4-step progress spine — the figure;
 *   • borderless, soft-lifted white cards (Surface elevation="shadow") floating
 *     on the cream canvas — the ground; never card-in-card double borders;
 *   • sunken Inset wells (bg-surface-sunken) INSIDE the cards for lists + input
 *     tracks — a true card→well depth step;
 *   • green used as STRUCTURE: the step spine, the selected-course state
 *     (accent-50 + border-accent-500 + check medallion), the Start CTA.
 * Native <input>/<select> keep their EXACT onChange handlers (Fairway-token
 * styling only). Restrained, reduced-motion-safe entrance.
 * ========================================================================== */

import { type Dispatch, type SetStateAction, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { MapPin, Check, BarChart3, Trophy, Search, ChevronLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatCourseName } from '@/components/golf/courses/CourseImage';
import { Surface, Inset } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { Button as UIButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Chip } from '@/components/fairway/controls/badge';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { FairwayRecentCourses } from './FairwayRecentCourses';
import { OfflineWarningBanner } from '@/components/golf';
import { FairwayHoleConfig } from './FairwayHoleConfig';
import type { HoleConfig } from '@/lib/types/golf-course';
import type {
  SavedCourse,
  SavedCourseHoleConfig,
  RecentPlayedCourse,
  PlayerQualifierInfo,
} from '@/app/golf/actions/golf';

/** Mirrors the legacy RoundSetupForm (string-based). */
export interface FairwaySetupForm {
  courseName: string;
  courseCity: string;
  courseState: string;
  courseRating: string;
  courseSlope: string;
  teesPlayed: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
}

type Step = 'setup' | 'holes' | 'tracking' | 'submitting';

export interface FairwayNewRoundEntryProps {
  step: Step;

  /** Opens the Cloud Course Library tee picker (primary course-selection CTA). */
  onBrowseCourseLibrary: () => void;
  recentCourses: RecentPlayedCourse[];
  onQuickPickConfirm: (course: RecentPlayedCourse) => void;
  isOnline: boolean;
  loadingSavedCourses: boolean;
  savedCourses: SavedCourse[];
  filteredSavedCourses: SavedCourse[];
  courseMode: 'saved' | 'new';
  onCourseModeChange: (next: 'saved' | 'new') => void;
  courseSearchQuery: string;
  setCourseSearchQuery: (q: string) => void;
  selectedCourseId: string | null;
  onSavedCourseSelect: (id: string | null) => void;
  selectedCourse: SavedCourse | null | undefined;
  /** A Cloud Library tee was picked — show a read-only confirmation (driven by
   *  setupData) instead of the editable form, so editing can't desync the round
   *  from its selected tee_id/course_id. */
  cloudPickActive: boolean;
  onClearSelectedCourse: () => void;

  setupData: FairwaySetupForm;
  setSetupData: Dispatch<SetStateAction<FairwaySetupForm>>;
  saveCourseChecked: boolean;
  onToggleSaveCourse: () => void;

  holesPerRound: 9 | 18;
  setHolesPerRound: (n: 9 | 18) => void;
  preloadedHoleConfigs: SavedCourseHoleConfig[] | null;
  nineSelection: 'front' | 'back';
  setNineSelection: (n: 'front' | 'back') => void;

  allActiveQualifiers: PlayerQualifierInfo[];
  loadingActiveQualifiers: boolean;
  onPickActiveQualifier: (q: PlayerQualifierInfo) => void;
  qualifiers: PlayerQualifierInfo[];
  loadingQualifiers: boolean;
  qualifierError: string | null;
  /** Re-runs the qualifier fetch — wired to the inline "Try again" retry. */
  onRetryQualifiers: () => void;
  selectedQualifierId: string | null;
  setSelectedQualifierId: (id: string | null) => void;
  availableRounds: number[];
  selectedRoundNumber: number | null;
  setSelectedRoundNumber: (n: number | null) => void;

  error: string | null;
  isStartingRound: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  /** Persistent back-to-dashboard nav (rendered in the cockpit header on the
   *  setup step) so a player can always leave without relying on the form Cancel
   *  button — Nielsen #3 user control & freedom. */
  onExitToDashboard: () => void;

  onHolesSave: (holes: HoleConfig[]) => void;
  onHolesBack: () => void;
}

/* — Field styling: recessed sunken-well tracks inside the lifted white cards —
 * Focus uses the canonical Fairway forms recipe (forms/styles.ts): a SOLID
 * accent-600 ring (>=3:1 over canvas/sunken/surface — clears WCAG 2.2 1.4.11 /
 * 2.4.7), gated on `focus-visible:` so it only shows for keyboard users (a bare
 * `focus:` ring fired on mouse-click and the old `/25` alpha ring composited to
 * ~1.3:1, far below the 3:1 floor). */

/** Override className passed into the canonical <Input>/<Select> wrappers so
 * they render with the Fairway token recipe above instead of their own
 * cream/warm defaults. twMerge (via `cn`) resolves same-family conflicts
 * (rounded-*, border-*, bg-*, text-*, focus:*) in favor of these classes —
 * the `focus:` overrides explicitly cancel the wrapper's baked-in
 * mouse-click ring so only `focus-visible:` shows the accent ring, matching
 * the accessibility intent documented above. */
const fwInputCls =
  'rounded-[var(--fw-radius-md)] border-border-subtle bg-surface-sunken px-3.5 py-2.5 min-h-0 font-fw-sans text-body text-text-primary placeholder:text-text-tertiary hover:border-border-subtle focus:border-border-subtle focus:ring-0 focus:bg-surface-sunken focus-visible:border-border-focus focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas';
const labelCls = 'mb-1.5 block font-fw-sans text-caption font-medium text-text-secondary';
/** Section heading with a green structural spine. */
const headingCls = 'mb-4 flex items-center gap-2.5 font-fw-display text-body-lg font-semibold text-text-primary';

function totalPar(configs: SavedCourseHoleConfig[]): number {
  return configs.reduce((s, h) => s + (h.par ?? 0), 0);
}

/**
 * Build the editable baseline holes for the Hole-config editor from a picked
 * course/tee's preloaded configs. Mirrors the parent's submit-time slicing so a
 * 9-hole round off an 18-hole tee (front/back) seeds the right nine, renumbered
 * 1..N. Returns undefined when there is nothing to seed (manual entry → the
 * editor falls back to its standard template). Pure: never mutates the configs.
 */
function seedInitialHoles(
  configs: SavedCourseHoleConfig[] | null,
  holesPerRound: 9 | 18,
  nineSelection: 'front' | 'back',
): HoleConfig[] | undefined {
  if (!configs || configs.length === 0) return undefined;
  let slice: SavedCourseHoleConfig[];
  if (holesPerRound === 9 && configs.length >= 18 && nineSelection === 'back') {
    slice = configs.slice(9, 18);
  } else {
    slice = configs.slice(0, holesPerRound);
  }
  return slice.map((h, idx) => ({
    holeNumber: idx + 1, // renumber 1..N regardless of front/back
    par: h.par,
    yardage: h.yardage,
  }));
}

function relTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const TEE_OPTIONS = [
  { value: 'Championship', label: 'Championship' },
  { value: 'Black', label: 'Black' },
  { value: 'Blue', label: 'Blue' },
  { value: 'White', label: 'White' },
  { value: 'Gold', label: 'Gold' },
  { value: 'Red', label: 'Red' },
];

const ROUND_TYPE_OPTIONS = [
  { value: 'practice', label: 'Practice' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'qualifier', label: 'Qualifier' },
];

const STEP_CONFIG = [
  { key: 'setup', label: 'Course setup', shortLabel: 'Setup' },
  { key: 'holes', label: 'Hole config', shortLabel: 'Holes' },
  { key: 'tracking', label: 'Shot tracking', shortLabel: 'Track' },
  { key: 'submitting', label: 'Submit', shortLabel: 'Done' },
] as const;

/** A small green structural spine for section headers. */
function Spine() {
  return <span aria-hidden className="h-5 w-[3px] flex-shrink-0 rounded-full bg-accent-500" />;
}

/** The green 4-step progress spine, rendered on the dark cockpit band. */
function StepSpine({ step }: { step: Step }) {
  const current = STEP_CONFIG.findIndex((s) => s.key === step);
  return (
    <div className="mt-7 flex items-stretch gap-2">
      {STEP_CONFIG.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex flex-1 flex-col gap-2">
            <span className="h-1 w-full overflow-hidden rounded-full bg-warm-50/10">
              <span
                className="block h-full rounded-full bg-accent-400 transition-[width] duration-500 ease-out"
                style={{ width: done ? '100%' : active ? '60%' : '0%' }}
              />
            </span>
            <span
              className={cn(
                'font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em]',
                active ? 'text-nav-text' : done ? 'text-nav-text-dim' : 'text-white/35',
              )}
            >
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.shortLabel}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The dark warm-black cockpit header band (the figure). */
function CockpitBand({
  step,
  eyebrow,
  title,
  description,
  onBack,
  backLabel,
}: {
  step: Step;
  eyebrow: string;
  title: string;
  description?: string;
  /** Optional persistent back affordance rendered at the top of the band. */
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="on-dark relative overflow-hidden rounded-card bg-nav-bg p-7 text-nav-text shadow-soft md:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent-500/15 blur-[70px]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-warm-50/[0.06]" />
      {onBack && (
        <UIButton
          type="button"
          variant="ghost"
          onClick={onBack}
          haptic="none"
          className="relative -ml-1 mb-3 min-h-[44px] gap-1 rounded-[var(--fw-radius-sm)] px-1 py-0 font-fw-sans text-body-sm font-medium text-nav-text-dim hover:bg-transparent hover:text-nav-text focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-nav-bg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {backLabel ?? 'Back'}
        </UIButton>
      )}
      <p className="relative font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-nav-accent">
        {eyebrow}
      </p>
      <h1 className="relative mt-2 max-w-xl font-fw-display text-h2 font-semibold leading-tight tracking-[-0.01em] text-nav-text">
        {title}
      </h1>
      {description && (
        <p className="relative mt-2 max-w-lg font-fw-sans text-body-sm text-nav-text-dim">{description}</p>
      )}
      <StepSpine step={step} />
    </div>
  );
}

export function FairwayNewRoundEntry(props: FairwayNewRoundEntryProps) {
  const { step } = props;
  const prefersReducedMotion = useReducedMotion();
  // Internal "review holes" stage for a CLOUD / SAVED course pick. The parent's
  // submit handler would otherwise skip the editor and jump straight to tracking
  // for a usable preloaded config — but the cloud course is a BASELINE the player
  // must be able to tune for today's round. When a baseline pick is active we keep
  // the player on the setup screen, and the primary CTA opens this in-place editor
  // (seeded from the picked tee) instead of submitting. Saving pipes the edited
  // holes to onHolesSave, which the parent already routes into round creation
  // (it never mutates the shared catalog for a cloud-tee pick). Manual entry is
  // unaffected: with no preloaded config the CTA still submits via onSubmit and
  // the parent advances to its own 'holes' step.
  const [reviewingHoles, setReviewingHoles] = useState(false);
  const enter = (i: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] as const },
        };

  // NOTE: there is intentionally NO in-flow resume gate here. Unfinished rounds
  // are surfaced on the /rounds page (UnfinishedRoundsSection), so this entry
  // screen always renders the setup/holes flow directly.

  // ── Holes config step ─────────────────────────────────────────────────────
  // Seeded from whatever course/tee was picked (cloud library, saved course, or
  // a recent quick-pick). The configs are an editable baseline for THIS round —
  // edits flow out via onHolesSave and never touch the shared catalog.
  const seededHoles = seedInitialHoles(props.preloadedHoleConfigs, props.holesPerRound, props.nineSelection);
  // #157 (round 2) — display-only formatting; the raw value stays wired to the
  // editable "Course name *" input further down so a coach's own typing is
  // never fought mid-edit.
  const formattedCourseName = props.setupData.courseName ? formatCourseName(props.setupData.courseName) : '';
  const baselineLabel = seededHoles ? (formattedCourseName || 'this course') : undefined;
  if (step === 'holes') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-10">
        <m.div {...enter(0)}>
          <CockpitBand
            step="holes"
            eyebrow={`New round${formattedCourseName ? ` · ${formattedCourseName}` : ''}`}
            title={seededHoles ? 'Review the scorecard.' : 'Configure the holes.'}
            description={
              seededHoles
                ? 'These pars and yardages come from the course you picked — tweak any hole, then start tracking.'
                : 'Set par and yardage for each hole, then start tracking.'
            }
          />
        </m.div>
        <FairwayHoleConfig
          courseName={formattedCourseName}
          initialHoles={seededHoles}
          baselineLabel={baselineLabel}
          onSave={props.onHolesSave}
          onBack={props.onHolesBack}
          holesPerRound={props.holesPerRound}
        />
      </div>
    );
  }

  // ── In-place "review holes" stage for a cloud / saved baseline pick ─────────
  // Reached from the setup screen's primary CTA when a preloaded config exists,
  // so the editable scorecard appears BEFORE the parent's submit can skip it.
  if (reviewingHoles && seededHoles) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-10">
        <m.div {...enter(0)}>
          <CockpitBand
            step="holes"
            eyebrow={`New round${formattedCourseName ? ` · ${formattedCourseName}` : ''}`}
            title="Review the scorecard."
            description="These pars and yardages come from the course you picked — tweak any hole, then start tracking."
          />
        </m.div>
        <FairwayHoleConfig
          courseName={formattedCourseName}
          initialHoles={seededHoles}
          baselineLabel={baselineLabel}
          onSave={props.onHolesSave}
          onBack={() => setReviewingHoles(false)}
          holesPerRound={props.holesPerRound}
        />
      </div>
    );
  }

  // ── Setup step ──────────────────────────────────────────────────────────
  const {
    setupData,
    setSetupData,
    savedCourses,
    loadingSavedCourses,
    filteredSavedCourses,
    courseMode,
    selectedCourse,
    selectedCourseId,
    allActiveQualifiers,
    loadingActiveQualifiers,
    qualifiers,
    loadingQualifiers,
    qualifierError,
    selectedQualifierId,
    availableRounds,
    selectedRoundNumber,
    holesPerRound,
    preloadedHoleConfigs,
    nineSelection,
  } = props;

  const showSelector = !loadingSavedCourses && savedCourses.length > 0;
  let i = 0;

  // A qualifier round still needs its qualifier + round number chosen before we
  // can advance. The parent's onSubmit validates this and surfaces the error, so
  // for an incomplete qualifier we route through the form (type=submit) rather
  // than jumping into the in-place holes editor. For non-qualifier rounds (and
  // fully-selected qualifiers) a baseline pick goes straight to the editor.
  const qualifierIncomplete =
    setupData.roundType === 'qualifier' && (!selectedQualifierId || !selectedRoundNumber);
  const canReviewHoles = !!seededHoles && !qualifierIncomplete;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-10">
      <div className="flex flex-col gap-6">
        <m.div {...enter(i++)}>
          <CockpitBand
            step="setup"
            eyebrow="New round · Setup"
            title="Track every shot of this round."
            description="Pick a course, set up your scorecard, then start tracking."
            onBack={props.onExitToDashboard}
            backLabel="Dashboard"
          />
        </m.div>

        {/* PRIMARY course source: the shared Cloud Course Library (course + tee). */}
        <m.div {...enter(i++)}>
          <Button
            type="button"
            variant="primary"
            onClick={props.onBrowseCourseLibrary}
            className="w-full justify-center"
          >
            <MapPin size={16} aria-hidden /> Browse course library
          </Button>
        </m.div>

        {props.recentCourses.length > 0 && (
          <m.div {...enter(i++)}>
            <FairwayRecentCourses courses={props.recentCourses} onConfirmCourse={props.onQuickPickConfirm} />
          </m.div>
        )}

        <form onSubmit={props.onSubmit} className="flex flex-col gap-6">
          {!props.isOnline && (
            <OfflineWarningBanner variant="inline" showForSlowConnection dismissable context="Starting a round" />
          )}

          {/* ── Course ── */}
          <m.div {...enter(i++)}>
            <Surface elevation="shadow" padding="lg" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className={cn(headingCls, 'mb-0')}>
                  <Spine />
                  Course
                </h3>
                {showSelector && (
                  <Segmented<'saved' | 'new'>
                    size="sm"
                    aria-label="Course source"
                    value={courseMode}
                    onValueChange={props.onCourseModeChange}
                    options={[
                      { value: 'saved', label: 'Saved' },
                      { value: 'new', label: 'New' },
                    ]}
                  />
                )}
              </div>

              {/* Saved-course picker (sunken well of lifted rows) */}
              {showSelector && courseMode === 'saved' && (
                <div className="flex flex-col gap-3">
                  {savedCourses.length >= 4 && (
                    <Input
                      type="search"
                      value={props.courseSearchQuery}
                      onChange={(e) => props.setCourseSearchQuery(e.target.value)}
                      placeholder="Search saved courses…"
                      enterKeyHint="search"
                      autoComplete="off"
                      leftIcon={<Search className="h-4 w-4 text-text-tertiary" />}
                      className={fwInputCls}
                    />
                  )}
                  <Inset padding="sm" className="scrollbar-hide flex max-h-[300px] flex-col gap-2 overflow-y-auto">
                    {filteredSavedCourses.length === 0 ? (
                      <p className="py-6 text-center font-fw-sans text-body-sm text-text-tertiary">
                        No courses match &ldquo;{props.courseSearchQuery}&rdquo;
                      </p>
                    ) : (
                      filteredSavedCourses.map((course) => {
                        const isSel = selectedCourseId === course.id;
                        const par = course.holeConfigs.length > 0 ? totalPar(course.holeConfigs) : null;
                        const loc = [course.courseCity, course.courseState].filter(Boolean).join(', ');
                        return (
                          <UIButton
                            key={course.id}
                            type="button"
                            variant="ghost"
                            haptic="none"
                            onClick={() => props.onSavedCourseSelect(isSel ? null : course.id)}
                            className={cn(
                              'block h-auto w-full min-h-0 relative overflow-hidden rounded-[var(--fw-radius-md)] border p-3.5 text-left shadow-flat transition-colors hover:-translate-y-0',
                              isSel
                                ? 'border-accent-500 bg-accent-50 hover:bg-accent-50'
                                : 'border-border-subtle bg-surface hover:border-border-strong hover:bg-surface-tint',
                            )}
                          >
                            {isSel && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent-500" />}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  {isSel && (
                                    <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-accent-500">
                                      <Check className="h-3 w-3 text-text-on-accent" />
                                    </span>
                                  )}
                                  <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                                    {formatCourseName(course.courseName)}
                                  </p>
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
                                  {loc && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {loc}
                                    </span>
                                  )}
                                  {loc && course.teesPlayed && <span>·</span>}
                                  {course.teesPlayed && <span>{course.teesPlayed} tees</span>}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {par !== null && <Chip size="sm" tone="neutral">Par {par}</Chip>}
                                  {course.holeConfigs.length > 0 && (
                                    <Chip size="sm" tone="neutral">{course.holeConfigs.length} holes</Chip>
                                  )}
                                  {course.courseRating !== null && (
                                    <Chip size="sm" tone="neutral">
                                      {course.courseRating}/{course.courseSlope ?? '—'}
                                    </Chip>
                                  )}
                                </div>
                              </div>
                              <span className="flex-shrink-0 whitespace-nowrap font-fw-sans text-caption text-text-tertiary">
                                {relTime(course.lastUsedAt)}
                              </span>
                            </div>
                          </UIButton>
                        );
                      })
                    )}
                  </Inset>
                </div>
              )}

              {/* Selected-course summary OR new-course form */}
              {courseMode === 'saved' && !selectedCourse && props.cloudPickActive ? (
                /* Cloud Library pick — read-only confirmation (driven by setupData).
                   No editable fields, so the round can't be desynced from its
                   selected tee_id/course_id. "Change" reopens the picker. */
                <Inset padding="md">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 font-fw-sans text-body-sm font-medium text-text-primary">
                      <Check className="h-4 w-4 text-accent-700" />
                      Course ready
                    </h4>
                    <Button variant="ghost" size="sm" type="button" onClick={props.onBrowseCourseLibrary}>
                      Change
                    </Button>
                  </div>
                  <p className="font-fw-display text-body font-medium text-text-primary">{formatCourseName(setupData.courseName)}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-fw-sans text-caption text-text-tertiary">
                    {setupData.courseCity && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {setupData.courseCity}
                        {setupData.courseState ? `, ${setupData.courseState}` : ''}
                      </span>
                    )}
                    {setupData.teesPlayed && <span>{setupData.teesPlayed} tees</span>}
                    {setupData.courseRating && <span>Rating {setupData.courseRating}</span>}
                    {setupData.courseSlope && <span>Slope {setupData.courseSlope}</span>}
                  </div>
                </Inset>
              ) : courseMode === 'saved' && selectedCourse ? (
                <Inset padding="md">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 font-fw-sans text-body-sm font-medium text-text-primary">
                      <Check className="h-4 w-4 text-accent-700" />
                      Course ready
                    </h4>
                    <Button variant="ghost" size="sm" type="button" onClick={props.onClearSelectedCourse}>
                      Change
                    </Button>
                  </div>
                  <p className="font-fw-display text-body font-medium text-text-primary">{formatCourseName(selectedCourse.courseName)}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-fw-sans text-caption text-text-tertiary">
                    {selectedCourse.courseCity && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {selectedCourse.courseCity}
                        {selectedCourse.courseState ? `, ${selectedCourse.courseState}` : ''}
                      </span>
                    )}
                    {selectedCourse.teesPlayed && <span>{selectedCourse.teesPlayed} tees</span>}
                    {selectedCourse.courseRating !== null && <span>Rating {selectedCourse.courseRating}</span>}
                    {selectedCourse.courseSlope !== null && <span>Slope {selectedCourse.courseSlope}</span>}
                    {selectedCourse.holeConfigs.length > 0 && (
                      <span className="font-medium text-accent-700">
                        {selectedCourse.holeConfigs.length} holes · Par {totalPar(selectedCourse.holeConfigs)}
                      </span>
                    )}
                  </div>
                </Inset>
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <label htmlFor="courseName" className={labelCls}>Course name *</label>
                    <Input
                      id="courseName"
                      type="text"
                      value={setupData.courseName}
                      onChange={(e) => setSetupData({ ...setupData, courseName: e.target.value })}
                      enterKeyHint="next"
                      autoComplete="off"
                      className={fwInputCls}
                      placeholder="Pebble Beach Golf Links"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="courseCity" className={labelCls}>City</label>
                      <Input
                        id="courseCity"
                        type="text"
                        value={setupData.courseCity}
                        onChange={(e) => setSetupData({ ...setupData, courseCity: e.target.value })}
                        enterKeyHint="next"
                        autoComplete="off"
                        className={fwInputCls}
                        placeholder="Pebble Beach"
                      />
                    </div>
                    <div>
                      <label htmlFor="courseState" className={labelCls}>State</label>
                      <Input
                        id="courseState"
                        type="text"
                        value={setupData.courseState}
                        onChange={(e) => setSetupData({ ...setupData, courseState: e.target.value })}
                        enterKeyHint="next"
                        autoComplete="off"
                        className={fwInputCls}
                        placeholder="CA"
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="courseRating" className={labelCls}>Rating</label>
                      <Input
                        id="courseRating"
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        enterKeyHint="next"
                        value={setupData.courseRating}
                        onChange={(e) => setSetupData({ ...setupData, courseRating: e.target.value })}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className={fwInputCls}
                        placeholder="72.1"
                      />
                    </div>
                    <div>
                      <label htmlFor="courseSlope" className={labelCls}>Slope</label>
                      <Input
                        id="courseSlope"
                        type="number"
                        inputMode="numeric"
                        enterKeyHint="next"
                        value={setupData.courseSlope}
                        onChange={(e) => setSetupData({ ...setupData, courseSlope: e.target.value })}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className={fwInputCls}
                        placeholder="133"
                        aria-label="Course slope rating"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <Select
                        label="Tees"
                        options={TEE_OPTIONS}
                        value={setupData.teesPlayed}
                        onChange={(value) => setSetupData({ ...setupData, teesPlayed: value })}
                        className={fwInputCls}
                      />
                    </div>
                  </div>

                  {courseMode === 'new' && (
                    <UIButton
                      type="button"
                      variant="ghost"
                      haptic="none"
                      onClick={props.onToggleSaveCourse}
                      className={cn(
                        'h-auto w-full min-h-0 flex items-center justify-start gap-3 rounded-[var(--fw-radius-md)] border p-3.5 text-left transition-colors',
                        props.saveCourseChecked
                          ? 'border-accent-500 bg-accent-50 hover:bg-accent-50'
                          : 'border-border-subtle bg-surface-sunken hover:bg-surface-tint',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-5 w-5 flex-shrink-0 place-items-center rounded-md border-2 transition-colors',
                          props.saveCourseChecked ? 'border-accent-500 bg-accent-500' : 'border-border-strong',
                        )}
                      >
                        {props.saveCourseChecked && <Check className="h-3 w-3 text-text-on-accent" />}
                      </span>
                      <span>
                        <span className="block font-fw-sans text-body-sm font-medium text-text-primary">
                          Save for quick access next round
                        </span>
                        <span className="block font-fw-sans text-caption text-text-tertiary">
                          Remembers hole pars, yardages &amp; course details
                        </span>
                      </span>
                    </UIButton>
                  )}
                </div>
              )}
            </Surface>
          </m.div>

          {/* ── Active qualifiers ── */}
          {!loadingActiveQualifiers && allActiveQualifiers.length > 0 && setupData.roundType !== 'qualifier' && (
            <m.div {...enter(i++)}>
              <Surface elevation="shadow" padding="lg" className="flex flex-col gap-3">
                <h3 className={cn(headingCls, 'mb-0')}>
                  <Spine />
                  <Trophy className="h-4 w-4 text-accent-700" />
                  Active qualifiers
                </h3>
                <p className="font-fw-sans text-caption text-text-tertiary">Tap to start a qualifier round</p>
                <Inset padding="sm" className="flex max-h-[240px] flex-col gap-2 overflow-y-auto">
                  {allActiveQualifiers.map((q) => (
                    <UIButton
                      key={q.id}
                      type="button"
                      variant="ghost"
                      haptic="none"
                      onClick={() => props.onPickActiveQualifier(q)}
                      className="h-auto min-h-0 w-full flex items-center justify-between gap-3 rounded-[var(--fw-radius-md)] border border-border-subtle bg-surface p-3.5 text-left shadow-flat transition-colors hover:border-border-strong hover:bg-surface-tint"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{q.name}</p>
                        <div className="mt-1 flex items-center gap-3 font-fw-sans text-caption text-text-tertiary">
                          {q.courseName && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3" />
                              {formatCourseName(q.courseName)}
                            </span>
                          )}
                          <span className="tabular-nums">
                            {q.roundsCompleted}/{q.numRounds} rounds
                          </span>
                        </div>
                      </div>
                      <StatusPill tone="accent" size="sm">Play</StatusPill>
                    </UIButton>
                  ))}
                </Inset>
              </Surface>
            </m.div>
          )}

          {/* ── Round details ── */}
          <m.div {...enter(i++)}>
            <Surface elevation="shadow" padding="lg">
              <h3 className={headingCls}>
                <Spine />
                Round details
              </h3>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Select
                      label="Round type"
                      options={ROUND_TYPE_OPTIONS}
                      value={setupData.roundType}
                      onChange={(value) =>
                        setSetupData({ ...setupData, roundType: value as FairwaySetupForm['roundType'] })
                      }
                      className={fwInputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="roundDate" className={labelCls}>Date</label>
                    <Input
                      id="roundDate"
                      type="date"
                      value={setupData.roundDate}
                      onChange={(e) => setSetupData({ ...setupData, roundDate: e.target.value })}
                      className={fwInputCls}
                      required
                    />
                  </div>
                </div>
                <div>
                  <span className={labelCls}>Holes</span>
                  <Segmented<'9' | '18'>
                    size="md"
                    fullWidth
                    aria-label="Holes per round"
                    value={holesPerRound === 9 ? '9' : '18'}
                    onValueChange={(next) => props.setHolesPerRound(next === '9' ? 9 : 18)}
                    options={[
                      { value: '9', label: '9 holes' },
                      { value: '18', label: '18 holes' },
                    ]}
                  />
                  {holesPerRound === 9 && preloadedHoleConfigs && preloadedHoleConfigs.length >= 18 && (
                    <div className="mt-2">
                      <Segmented<'front' | 'back'>
                        size="sm"
                        fullWidth
                        aria-label="Nine selection"
                        value={nineSelection}
                        onValueChange={props.setNineSelection}
                        options={[
                          { value: 'front', label: 'Front 9' },
                          { value: 'back', label: 'Back 9' },
                        ]}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Surface>
          </m.div>

          {/* ── Qualifier selection ── */}
          {setupData.roundType === 'qualifier' && (
            <m.div {...enter(i++)}>
              <Surface elevation="shadow" padding="lg" className="flex flex-col gap-3">
                <h3 className={cn(headingCls, 'mb-0')}>
                  <Spine />
                  <Trophy className="h-4 w-4 text-accent-700" />
                  Qualifier round
                </h3>
                {loadingQualifiers ? (
                  <p className="font-fw-sans text-body-sm text-text-tertiary">Loading your qualifiers…</p>
                ) : qualifierError ? (
                  // "no active qualifiers" is an empty-state (quiet info, no retry);
                  // anything else is a genuine fetch failure → InlineNotice with an
                  // inline "Try again" so the player never has to refresh the page.
                  /no active qualifiers/i.test(qualifierError) ? (
                    <p className="font-fw-sans text-body-sm text-text-tertiary">{qualifierError}</p>
                  ) : (
                    <InlineNotice
                      tone="danger"
                      title="Couldn't load your qualifiers"
                      action={
                        <Button type="button" variant="secondary" size="sm" onClick={props.onRetryQualifiers}>
                          Try again
                        </Button>
                      }
                    >
                      {qualifierError}
                    </InlineNotice>
                  )
                ) : qualifiers.length === 0 ? (
                  <p className="font-fw-sans text-body-sm text-text-tertiary">
                    You are not entered in any active qualifiers. Please contact your coach.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <Select
                        label="Select qualifier *"
                        placeholder="Choose a qualifier…"
                        value={selectedQualifierId || ''}
                        onChange={(value) => props.setSelectedQualifierId(value || null)}
                        options={qualifiers.map((q) => ({
                          value: q.id,
                          label: `${q.name} (${q.roundsCompleted}/${q.numRounds} rounds completed)`,
                        }))}
                        className={fwInputCls}
                      />
                    </div>
                    {selectedQualifierId && availableRounds.length > 0 && (
                      <div>
                        <Select
                          label="Round number *"
                          placeholder="Select round…"
                          value={selectedRoundNumber ? String(selectedRoundNumber) : ''}
                          onChange={(value) => props.setSelectedRoundNumber(Number(value) || null)}
                          options={availableRounds.map((num) => ({
                            value: String(num),
                            label: `Round ${num}`,
                          }))}
                          className={fwInputCls}
                        />
                      </div>
                    )}
                  </div>
                )}
              </Surface>
            </m.div>
          )}

          {/* ── 50+ stats note (quietest element) ── */}
          <m.div {...enter(i++)} className="flex items-start gap-3 px-1">
            <BarChart3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-700" />
            <p className="font-fw-sans text-caption text-text-tertiary">
              <span className="font-medium text-text-secondary">50+ stats tracked</span> — driving, approach
              proximity, putting, scrambling and more. Use your rangefinder for accurate distances.
            </p>
          </m.div>

          {props.error && (
            <InlineNotice tone="danger" title="Unable to start round">
              {props.error}
            </InlineNotice>
          )}

          {/* ── Action dock ──
              When a course/tee is picked we have an editable baseline scorecard
              (`seededHoles`): the primary CTA opens the in-place review editor
              (type=button) so the player always confirms/tunes the holes for THIS
              round before tracking — the cloud course is a baseline, not a skip.
              With no baseline (manual entry) the CTA submits and the parent sends
              the player to its own hole-configuration step. */}
          <m.div {...enter(i++)} className="flex gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={props.onCancel} disabled={props.isStartingRound} className="flex-1">
              Cancel
            </Button>
            {canReviewHoles ? (
              <Button
                variant="primary"
                type="button"
                onClick={() => setReviewingHoles(true)}
                disabled={props.isStartingRound}
                className="flex-[2]"
              >
                Next: review holes →
              </Button>
            ) : (
              <Button variant="primary" type="submit" disabled={props.isStartingRound} className="flex-[2]">
                {props.isStartingRound
                  ? 'Starting…'
                  : seededHoles
                    ? 'Start round →'
                    : 'Next: configure holes →'}
              </Button>
            )}
          </m.div>
        </form>
      </div>
    </div>
  );
}

export default FairwayNewRoundEntry;
