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

import { type Dispatch, type SetStateAction } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { Flag, MapPin, Check, BarChart3, Trophy, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface, Inset } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Chip } from '@/components/fairway/controls/badge';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { FairwayRecentCourses } from './FairwayRecentCourses';
import { OfflineWarningBanner } from '@/components/golf';
import { HoleConfigurationForm } from '@/components/golf/HoleConfigurationForm';
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
  showResumePrompt: boolean;
  existingInProgressRound?: {
    id: string;
    courseName: string;
    currentHole: number;
    holesPlayed: number;
  } | null;
  onContinueResume: () => void;
  onStartFresh: () => void;

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
  selectedQualifierId: string | null;
  setSelectedQualifierId: (id: string | null) => void;
  availableRounds: number[];
  selectedRoundNumber: number | null;
  setSelectedRoundNumber: (n: number | null) => void;

  error: string | null;
  isStartingRound: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;

  onHolesSave: Parameters<typeof HoleConfigurationForm>[0]['onSave'];
  onHolesBack: () => void;
}

/* — Field styling: recessed sunken-well tracks inside the lifted white cards — */
const fieldCls =
  'w-full rounded-fw-md border border-border-subtle bg-surface-sunken px-3.5 py-2.5 font-fw-sans text-body text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent-500 focus:bg-surface focus:ring-2 focus:ring-accent-500/25';
const labelCls = 'mb-1.5 block font-fw-sans text-caption font-medium text-text-secondary';
/** Section heading with a green structural spine. */
const headingCls = 'mb-4 flex items-center gap-2.5 font-fw-display text-body-lg font-semibold text-text-primary';

function totalPar(configs: SavedCourseHoleConfig[]): number {
  return configs.reduce((s, h) => s + (h.par ?? 0), 0);
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
            <span className="h-1 w-full overflow-hidden rounded-full bg-white/10">
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
}: {
  step: Step;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="on-dark relative overflow-hidden rounded-card bg-nav-bg p-7 text-nav-text shadow-soft md:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent-500/15 blur-[70px]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.06]" />
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
  const { step, showResumePrompt } = props;
  const prefersReducedMotion = useReducedMotion();
  const enter = (i: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] as const },
        };

  // ── Resume gate ─────────────────────────────────────────────────────────
  if (showResumePrompt && props.existingInProgressRound) {
    const r = props.existingInProgressRound;
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center px-4 py-12">
        <m.div {...enter(0)} className="w-full">
          <Surface elevation="shadow" padding="lg" className="text-center">
            <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent-50 text-accent-700">
              <Flag className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="font-fw-display text-h3 font-semibold tracking-[-0.01em] text-text-primary">
              Round in progress
            </h2>
            <p className="mt-2 font-fw-sans text-body-sm text-text-tertiary">You have an unfinished round at</p>
            <p className="mt-1 font-fw-sans text-body font-medium text-text-primary">{r.courseName}</p>
            <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
              Hole {r.currentHole} of {r.holesPlayed}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Button variant="primary" onClick={props.onContinueResume}>
                Continue round
              </Button>
              <Button variant="secondary" onClick={props.onStartFresh}>
                Start fresh round
              </Button>
            </div>
          </Surface>
        </m.div>
      </div>
    );
  }

  // ── Holes config step ─────────────────────────────────────────────────────
  if (step === 'holes') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-10">
        <m.div {...enter(0)}>
          <CockpitBand step="holes" eyebrow="New round" title="Configure the holes." description="Set par and yardage for each hole." />
        </m.div>
        <m.div {...enter(1)}>
          <Surface elevation="shadow" padding="lg">
            <HoleConfigurationForm
              courseName={props.setupData.courseName}
              onSave={props.onHolesSave}
              onBack={props.onHolesBack}
              holesPerRound={props.holesPerRound}
            />
          </Surface>
        </m.div>
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

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-10">
      <div className="flex flex-col gap-6">
        <m.div {...enter(i++)}>
          <CockpitBand
            step="setup"
            eyebrow="New round · Setup"
            title="Track every shot of this round."
            description="Pick a course, set up your scorecard, then start tracking."
          />
        </m.div>

        {props.recentCourses.length > 0 && !showResumePrompt && (
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
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                      <input
                        type="search"
                        value={props.courseSearchQuery}
                        onChange={(e) => props.setCourseSearchQuery(e.target.value)}
                        placeholder="Search saved courses…"
                        enterKeyHint="search"
                        autoComplete="off"
                        className={`${fieldCls} pl-9`}
                      />
                    </div>
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
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => props.onSavedCourseSelect(isSel ? null : course.id)}
                            className={cn(
                              'relative overflow-hidden rounded-fw-md border p-3.5 text-left shadow-flat transition-colors',
                              isSel
                                ? 'border-accent-500 bg-accent-50'
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
                                    {course.courseName}
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
                          </button>
                        );
                      })
                    )}
                  </Inset>
                </div>
              )}

              {/* Selected-course summary OR new-course form */}
              {courseMode === 'saved' && selectedCourse ? (
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
                  <p className="font-fw-display text-body font-medium text-text-primary">{selectedCourse.courseName}</p>
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
                    <input
                      id="courseName"
                      type="text"
                      value={setupData.courseName}
                      onChange={(e) => setSetupData({ ...setupData, courseName: e.target.value })}
                      enterKeyHint="next"
                      autoComplete="off"
                      className={fieldCls}
                      placeholder="Pebble Beach Golf Links"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="courseCity" className={labelCls}>City</label>
                      <input
                        id="courseCity"
                        type="text"
                        value={setupData.courseCity}
                        onChange={(e) => setSetupData({ ...setupData, courseCity: e.target.value })}
                        enterKeyHint="next"
                        autoComplete="off"
                        className={fieldCls}
                        placeholder="Pebble Beach"
                      />
                    </div>
                    <div>
                      <label htmlFor="courseState" className={labelCls}>State</label>
                      <input
                        id="courseState"
                        type="text"
                        value={setupData.courseState}
                        onChange={(e) => setSetupData({ ...setupData, courseState: e.target.value })}
                        enterKeyHint="next"
                        autoComplete="off"
                        className={fieldCls}
                        placeholder="CA"
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="courseRating" className={labelCls}>Rating</label>
                      <input
                        id="courseRating"
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        enterKeyHint="next"
                        value={setupData.courseRating}
                        onChange={(e) => setSetupData({ ...setupData, courseRating: e.target.value })}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className={fieldCls}
                        placeholder="72.1"
                      />
                    </div>
                    <div>
                      <label htmlFor="courseSlope" className={labelCls}>Slope</label>
                      <input
                        id="courseSlope"
                        type="number"
                        inputMode="numeric"
                        enterKeyHint="next"
                        value={setupData.courseSlope}
                        onChange={(e) => setSetupData({ ...setupData, courseSlope: e.target.value })}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className={fieldCls}
                        placeholder="133"
                        aria-label="Course slope rating"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label htmlFor="teesPlayed" className={labelCls}>Tees</label>
                      <select
                        id="teesPlayed"
                        value={setupData.teesPlayed}
                        onChange={(e) => setSetupData({ ...setupData, teesPlayed: e.target.value })}
                        className={fieldCls}
                      >
                        <option>Championship</option>
                        <option>Black</option>
                        <option>Blue</option>
                        <option>White</option>
                        <option>Gold</option>
                        <option>Red</option>
                      </select>
                    </div>
                  </div>

                  {courseMode === 'new' && (
                    <button
                      type="button"
                      onClick={props.onToggleSaveCourse}
                      className={cn(
                        'flex items-center gap-3 rounded-fw-md border p-3.5 text-left transition-colors',
                        props.saveCourseChecked
                          ? 'border-accent-500 bg-accent-50'
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
                    </button>
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
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => props.onPickActiveQualifier(q)}
                      className="flex items-center justify-between gap-3 rounded-fw-md border border-border-subtle bg-surface p-3.5 text-left shadow-flat transition-colors hover:border-border-strong hover:bg-surface-tint"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{q.name}</p>
                        <div className="mt-1 flex items-center gap-3 font-fw-sans text-caption text-text-tertiary">
                          {q.courseName && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3" />
                              {q.courseName}
                            </span>
                          )}
                          <span className="tabular-nums">
                            {q.roundsCompleted}/{q.numRounds} rounds
                          </span>
                        </div>
                      </div>
                      <StatusPill tone="accent" size="sm">Play</StatusPill>
                    </button>
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
                    <label htmlFor="roundType" className={labelCls}>Round type</label>
                    <select
                      id="roundType"
                      value={setupData.roundType}
                      onChange={(e) =>
                        setSetupData({ ...setupData, roundType: e.target.value as FairwaySetupForm['roundType'] })
                      }
                      className={fieldCls}
                    >
                      <option value="practice">Practice</option>
                      <option value="tournament">Tournament</option>
                      <option value="qualifier">Qualifier</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="roundDate" className={labelCls}>Date</label>
                    <input
                      id="roundDate"
                      type="date"
                      value={setupData.roundDate}
                      onChange={(e) => setSetupData({ ...setupData, roundDate: e.target.value })}
                      className={fieldCls}
                      required
                    />
                  </div>
                </div>
                <div>
                  <span className={labelCls}>Holes</span>
                  <Segmented<'9' | '18'>
                    size="md"
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
                  <p className="font-fw-sans text-body-sm text-fw-danger">{qualifierError}</p>
                ) : qualifiers.length === 0 ? (
                  <p className="font-fw-sans text-body-sm text-text-tertiary">
                    You are not entered in any active qualifiers. Please contact your coach.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label htmlFor="qualifier" className={labelCls}>Select qualifier *</label>
                      <select
                        id="qualifier"
                        value={selectedQualifierId || ''}
                        onChange={(e) => props.setSelectedQualifierId(e.target.value || null)}
                        className={fieldCls}
                        required
                      >
                        <option value="">Choose a qualifier…</option>
                        {qualifiers.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name} ({q.roundsCompleted}/{q.numRounds} rounds completed)
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedQualifierId && availableRounds.length > 0 && (
                      <div>
                        <label htmlFor="roundNumber" className={labelCls}>Round number *</label>
                        <select
                          id="roundNumber"
                          value={selectedRoundNumber || ''}
                          onChange={(e) => props.setSelectedRoundNumber(Number(e.target.value) || null)}
                          className={fieldCls}
                          required
                        >
                          <option value="">Select round…</option>
                          {availableRounds.map((num) => (
                            <option key={num} value={num}>
                              Round {num}
                            </option>
                          ))}
                        </select>
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
            <p className="rounded-fw-md bg-fw-danger-bg px-4 py-3 font-fw-sans text-body-sm text-fw-danger">
              {props.error}
            </p>
          )}

          {/* ── Action dock ── */}
          <m.div {...enter(i++)} className="flex gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={props.onCancel} disabled={props.isStartingRound} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={props.isStartingRound} className="flex-[2]">
              {props.isStartingRound
                ? 'Starting…'
                : preloadedHoleConfigs && preloadedHoleConfigs.length > 0
                  ? 'Start round →'
                  : 'Next: configure holes →'}
            </Button>
          </m.div>
        </form>
      </div>
    </div>
  );
}

export default FairwayNewRoundEntry;
