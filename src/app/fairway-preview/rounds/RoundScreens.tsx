'use client';

/**
 * ============================================================================
 * Fairway · Rounds — mobile render harness (DEV-ONLY, ADDITIVE)
 * ----------------------------------------------------------------------------
 * Mounts the REAL round components at phone width with fixture props, so the
 * create-round and shot-tracking surfaces can be SEEN without an authenticated
 * session or a live round.
 *
 * Why this exists: every one of these screens sits behind auth and behind a
 * multi-step state machine, so the only way anyone had to review them was to
 * play a round. Design review then happened against hand-drawn approximations
 * of the components instead of the components — which is exactly how a
 * "redesign" drifts off-system. This route removes the approximation step:
 * what renders here is the shipped component, the shipped tokens, the shipped
 * CSS.
 *
 * It is NOT linked into nav, imports no route/page module, and mutates
 * nothing — every callback is a no-op. Sibling of `/fairway-preview`, which
 * does the same job for the Wave-1 primitives.
 * ========================================================================== */

import * as React from 'react';
import { fairwayScope } from '@/lib/redesign/flag';

import FairwayShotTracking from '@/components/fairway/pages/rounds-tracking/FairwayShotTracking';
import { FairwayNewRoundEntry } from '@/components/fairway/pages/rounds-new/FairwayNewRoundEntry';
import type { FairwaySetupForm } from '@/components/fairway/pages/rounds-new/FairwayNewRoundEntry';
import type { RoundHole } from '@/lib/types/golf';
import { CourseCard } from '@/components/golf/courses/CourseCard';
import { FairwayTeeCard } from '@/components/fairway/pages/rounds-new/FairwayTeeCard';
import type { GolfCourse, GolfCourseTee } from '@/lib/types/golf-course';
import type {
  SavedCourse,
  SavedCourseHoleConfig,
  RecentPlayedCourse,
  PlayerQualifierInfo,
} from '@/app/golf/actions/golf';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4];
const YARDS = [412, 538, 178, 401, 435, 165, 561, 388, 424, 396, 191, 547, 418, 372, 522, 154, 445, 407];

const EARLY_SCORES = [4, 5, 2, 5, 4, 3];

const HOLES: RoundHole[] = PARS.map((par, i) => ({
  number: i + 1,
  par,
  yardage: YARDS[i] ?? 400,
  score: i < EARLY_SCORES.length ? (EARLY_SCORES[i] ?? null) : null,
}));

const HOLE_CONFIGS: SavedCourseHoleConfig[] = PARS.map((par, i) => ({
  holeNumber: i + 1,
  par,
  yardage: YARDS[i] ?? 400,
}));

const SAVED_COURSE: SavedCourse = {
  id: 'sc-1',
  courseId: 'c-1',
  courseName: 'Pebble Beach Golf Links',
  courseCity: 'Pebble Beach',
  courseState: 'CA',
  courseRating: 74.9,
  courseSlope: 143,
  teesPlayed: 'Blue',
  holesPerRound: 18,
  holeConfigs: HOLE_CONFIGS,
  lastUsedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
};

const SAVED_COURSES: SavedCourse[] = [
  SAVED_COURSE,
  {
    ...SAVED_COURSE,
    id: 'sc-2',
    courseId: 'c-2',
    courseName: 'Torrey Pines · South',
    courseCity: 'La Jolla',
    courseState: 'CA',
    courseRating: 78.1,
    courseSlope: 149,
    teesPlayed: 'Black',
    lastUsedAt: new Date(Date.now() - 9 * 86400000).toISOString(),
  },
  {
    ...SAVED_COURSE,
    id: 'sc-3',
    courseId: 'c-3',
    courseName: 'Bandon Dunes',
    courseCity: 'Bandon',
    courseState: 'OR',
    courseRating: 74.1,
    courseSlope: 143,
    teesPlayed: 'Green',
    lastUsedAt: new Date(Date.now() - 26 * 86400000).toISOString(),
  },
];

const RECENT: RecentPlayedCourse[] = SAVED_COURSES.slice(0, 2).map((c, i) => ({
  ...c,
  roundCount: i === 0 ? 7 : 3,
  lastPlayedAt: new Date(Date.now() - (i === 0 ? 3 : 9) * 86400000).toISOString(),
}));

const QUALIFIERS: PlayerQualifierInfo[] = [
  {
    id: 'q-1',
    name: 'Fall Travel Qualifier',
    description: '54 holes · top 5 travel to Amelia Island',
    courseName: 'Pebble Beach Golf Links',
    location: 'Pebble Beach, CA',
    numRounds: 3,
    holesPerRound: 18,
    startDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    endDate: new Date(Date.now() + 5 * 86400000).toISOString(),
    status: 'in_progress',
    showLiveLeaderboard: true,
    roundsCompleted: 1,
    completedRoundNumbers: [1],
  } as PlayerQualifierInfo,
];

const SETUP: FairwaySetupForm = {
  courseName: 'Pebble Beach Golf Links',
  courseCity: 'Pebble Beach',
  courseState: 'CA',
  courseRating: '74.9',
  courseSlope: '143',
  teesPlayed: 'Blue',
  roundType: 'qualifier',
  roundDate: new Date().toISOString().slice(0, 10),
};

const noop = () => {};

const COURSE = (
  id: string,
  name: string,
  city: string,
  state: string,
  yards: number,
): GolfCourse => ({
  id,
  name,
  city,
  state,
  country: 'USA',
  course_rating: 74.9,
  slope_rating: 143,
  default_tee_name: 'Blue',
  default_tee_color: '#3b82f6',
  total_yardage: yards,
  total_par: 72,
  created_by: null,
  is_public: true,
  created_at: null,
  updated_at: null,
  normalized_name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  image_url: null,
});

const LIBRARY: GolfCourse[] = [
  COURSE('c-1', 'Pebble Beach Golf Links', 'Pebble Beach', 'CA', 6972),
  COURSE('c-2', 'Torrey Pines · South', 'La Jolla', 'CA', 7765),
  COURSE('c-3', 'Bandon Dunes', 'Bandon', 'OR', 6732),
  COURSE('c-4', 'Whistling Straits', 'Kohler', 'WI', 7790),
];

const TEE = (
  id: string,
  name: string,
  color: string,
  yards: number,
  rating: number,
  slope: number,
): GolfCourseTee => ({
  id,
  course_id: 'c-1',
  tee_name: name,
  normalized_tee_name: name.toLowerCase(),
  tee_color: color,
  category: null,
  total_yards: yards,
  total_par: 72,
  course_rating: rating,
  slope_rating: slope,
  holes_count: 18,
  source: 'seed',
  is_draft: false,
  created_by_user_id: null,
  created_by_team_id: null,
  last_edited_by_user_id: null,
  last_edited_by_team_id: null,
  last_edited_at: null,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

const TEES: GolfCourseTee[] = [
  TEE('t-1', 'Championship', '#111827', 6972, 75.5, 145),
  TEE('t-2', 'Blue', '#3b82f6', 6116, 72.7, 135),
  TEE('t-3', 'White', '#f8fafc', 5482, 70.1, 128),
  TEE('t-4', 'Red', '#ef4444', 5197, 71.9, 130),
];

/* ── Screens ────────────────────────────────────────────────────────────── */

export type RoundScreen =
  | 'track-mid'
  | 'track-first'
  | 'setup'
  | 'picker-courses'
  | 'picker-tees';

export function RoundScreens({ screen }: { screen: RoundScreen }) {
  const [setupData, setSetupData] = React.useState<FairwaySetupForm>(SETUP);

  return (
    <div className={fairwayScope('min-h-dvh bg-canvas font-fw-sans text-text-primary')}>
      {screen === 'track-mid' && (
        <FairwayShotTracking
          holes={HOLES}
          currentHoleIndex={6}
          onHoleComplete={async () => true}
          onSaveShot={noop}
          onExit={noop}
          onNavigateToHole={noop}
          autoSaveDisabled
        />
      )}

      {screen === 'track-first' && (
        <FairwayShotTracking
          holes={HOLES}
          currentHoleIndex={0}
          onHoleComplete={async () => true}
          onSaveShot={noop}
          onExit={noop}
          onNavigateToHole={noop}
          autoSaveDisabled
        />
      )}

      {screen === 'picker-courses' && (
        <div className="flex flex-col gap-6 px-5 pb-10 pt-6">
          <header>
            <p className="font-fw-sans text-eyebrow uppercase tracking-eyebrow text-accent-600">
              Recently played
            </p>
            <h2 className="font-fw-display text-h2 font-semibold text-text-primary">
              Pick a course
            </h2>
          </header>
          <div className="flex flex-col gap-4">
            {LIBRARY.slice(0, 2).map((c, i) => (
              <CourseCard
                key={c.id}
                course={c}
                variant="featured"
                teeCount={4}
                meta={i === 0 ? 'Played 7\u00d7 \u00b7 3d ago' : 'Played 3\u00d7 \u00b7 9d ago'}
                onSelect={noop}
              />
            ))}
          </div>
          <header>
            <p className="font-fw-sans text-eyebrow uppercase tracking-eyebrow text-text-tertiary">
              Course library
            </p>
          </header>
          <div className="flex flex-col gap-3">
            {LIBRARY.map((c) => (
              <CourseCard key={`std-${c.id}`} course={c} teeCount={4} onSelect={noop} />
            ))}
          </div>
        </div>
      )}

      {screen === 'picker-tees' && (
        <div className="flex flex-col gap-5 px-5 pb-10 pt-6">
          <header>
            <p className="font-fw-sans text-eyebrow uppercase tracking-eyebrow text-accent-600">
              Pebble Beach Golf Links
            </p>
            <h2 className="font-fw-display text-h2 font-semibold text-text-primary">
              Which tees?
            </h2>
          </header>
          <div className="flex flex-col gap-3">
            {TEES.map((t) => (
              <FairwayTeeCard key={t.id} tee={t} longestYards={6972} onClick={noop} />
            ))}
          </div>
        </div>
      )}

      {screen === 'setup' && (
        <FairwayNewRoundEntry
          step="setup"
          onBrowseCourseLibrary={noop}
          recentCourses={RECENT}
          onQuickPickConfirm={noop}
          isOnline
          loadingSavedCourses={false}
          savedCourses={SAVED_COURSES}
          filteredSavedCourses={SAVED_COURSES}
          courseMode="saved"
          onCourseModeChange={noop}
          courseSearchQuery=""
          setCourseSearchQuery={noop}
          selectedCourseId="sc-1"
          onSavedCourseSelect={noop}
          selectedCourse={SAVED_COURSE}
          cloudPickActive
          onClearSelectedCourse={noop}
          pickedCourseImage={{ imageUrl: null, normalizedName: 'pebble-beach-golf-links' }}
          setupData={setupData}
          setSetupData={setSetupData}
          maxRoundDate={new Date().toISOString().slice(0, 10)}
          saveCourseChecked
          onToggleSaveCourse={noop}
          holesPerRound={18}
          setHolesPerRound={noop}
          preloadedHoleConfigs={HOLE_CONFIGS}
          nineSelection="front"
          setNineSelection={noop}
          allActiveQualifiers={QUALIFIERS}
          loadingActiveQualifiers={false}
          onPickActiveQualifier={noop}
          qualifiers={QUALIFIERS}
          loadingQualifiers={false}
          qualifierError={null}
          onRetryQualifiers={noop}
          selectedQualifierId="q-1"
          setSelectedQualifierId={noop}
          qualifierRoundError={null}
          onRetryQualifierRound={noop}
          availableRounds={[2, 3]}
          selectedRoundNumber={2}
          setSelectedRoundNumber={noop}
          error={null}
          isStartingRound={false}
          onSubmit={(e) => e.preventDefault()}
          onCancel={noop}
          onExitToDashboard={noop}
          onHolesSave={noop}
          onHolesBack={noop}
        />
      )}
    </div>
  );
}
