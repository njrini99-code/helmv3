'use client';

/**
 * ============================================================================
 * Fairway · player-game · FairwayGolfClasses — the player's academic classes
 * ----------------------------------------------------------------------------
 * The flag-on redesign of /golf/dashboard/classes (player-only). The legacy
 * page is a single inline `'use client'` component that owns ALL state, the
 * browser-client fetch, and the add/edit/delete handlers (which call the SAME
 * golf_player_classes writes + calendar-sync actions). This component is a
 * PRESENTATION-ONLY re-skin: it receives that already-computed state + the
 * verbatim handlers as props and renders the warm-premium layout.
 *
 * PRESERVED PLUMBING (owned by the legacy page, passed in — NEVER touched here):
 *   • fetchClasses + the golf_player_classes select.
 *   • handleAddClass / handleUpdateClass / handleConfirmClasses /
 *     handleDeleteClass / confirmDeleteAllClasses — the same insert/update/
 *     delete + calendar-sync calls. We re-skin the TRIGGERS only; the
 *     destructive single-class / delete-all deletes stay EXACTLY as the legacy
 *     page wired them (we add no new destructive write).
 *   • The four modals (AddClassModal / UploadScheduleModal / ConfirmClassesModal
 *     / ClassDetailModal) + the ConfirmDialog stay mounted by the LEGACY page —
 *     overlays are allowed glass and out of this surface's scope.
 *
 * ── HONESTY ─────────────────────────────────────────────────────────────────
 *   • Empty schedule → an honest EmptyState (no fabricated classes). The
 *     stat readouts render the real counts (0 is a legitimate count for a
 *     literal tally like "classes added", so 0 IS shown — these are not
 *     stats/scores/percentiles).
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in the
 * classes page. Renders inside the `.fairway-ds` scope on a bg-canvas page.
 * Built with Fairway tokens + primitives only (no bg-white / serif / gauges).
 * ========================================================================== */

import { BookOpen, Plus, Upload, MapPin } from 'lucide-react';

import {
  ViewHeader,
  InstrumentPanel,
  Readout,
  Surface,
  EmptyState,
  Skeleton,
  Chip,
  Button,
} from '@/components/fairway';

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the PRE-COMPUTED state + verbatim handlers the legacy page owns.
 * Mirrors the legacy PlayerClass shape exactly.
 * ────────────────────────────────────────────────────────────────────────── */

export interface FairwayPlayerClass {
  id: string;
  player_id: string;
  class_name: string;
  instructor: string | null;
  days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  building: string | null;
  room: string | null;
  credits: number | null;
  color: string | null;
  notes: string | null;
  team_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FairwayGolfClassesProps {
  classes: FairwayPlayerClass[];
  loading: boolean;
  /**
   * True when the signed-in user is NOT a player (Classes is a player-only
   * feature — a coach landing here gets an honest "wrong feature" state rather
   * than an empty schedule with CTAs that silently no-op).
   */
  isWrongRole?: boolean;
  /** True when the player has no team yet (join-a-team state). */
  hasTeam: boolean;
  /** Day → classes map, already grouped + time-sorted by the legacy page. */
  classesByDay: Record<string, FairwayPlayerClass[]>;
  totalCredits: number;
  /** Display helpers (verbatim from the legacy page). */
  parseClassName: (className: string) => { code: string; name: string };
  getLocationDisplay: (cls: FairwayPlayerClass) => string | null;
  formatTimeDisplay: (time: string) => string;
  formatDaysDisplay: (days: string[]) => string;
  /** Verbatim handlers (re-skinned triggers only). */
  onAddClass: () => void;
  onImportSchedule: () => void;
  onClassClick: (cls: FairwayPlayerClass) => void;
  onDeleteAll: () => void;
}

const DAY_ORDER = ['M', 'T', 'W', 'Th', 'F'];
const DAY_NAMES: Record<string, string> = {
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  Th: 'Thursday',
  F: 'Friday',
};

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayGolfClasses({
  classes,
  loading,
  isWrongRole = false,
  hasTeam,
  classesByDay,
  totalCredits,
  parseClassName,
  getLocationDisplay,
  formatTimeDisplay,
  formatDaysDisplay,
  onAddClass,
  onImportSchedule,
  onClassClick,
  onDeleteAll,
}: FairwayGolfClassesProps) {
  const count = classes.length;
  const hasClasses = count > 0;
  const daysActive = Object.keys(classesByDay).length;
  const buildingCount = new Set(
    classes.map((c) => c.building).filter((b): b is string => Boolean(b)),
  ).size;

  // ── Wrong-role gate — Classes is player-only. A coach (no playerId) would
  // otherwise see an empty schedule with Add/Import CTAs that silently no-op. ──
  if (isWrongRole) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6">
        <Surface elevation="border" padding="lg">
          <EmptyState
            icon={BookOpen}
            title="Classes are a player feature"
            description="Class schedules belong to individual players so coaches can plan practices around their academics. Head back to your dashboard to manage your team."
            action={
              <Button asChild variant="primary">
                <a href="/golf/dashboard">Back to dashboard</a>
              </Button>
            }
          />
        </Surface>
      </div>
    );
  }

  // ── No-team gate — honest, with the join CTA (mirrors legacy behavior) ──────
  if (!hasTeam) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6">
        <Surface elevation="border" padding="lg">
          <EmptyState
            icon={BookOpen}
            title="Join a team first"
            description="You need to be on a team before you can add your class schedule. Ask your coach for a join code."
            action={
              <Button asChild variant="primary">
                <a href="/golf/join">Join a team</a>
              </Button>
            }
          />
        </Surface>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6">
      <div className="flex flex-col gap-8">
        {/* ════════════════ 1 · MASTHEAD (the ONE masthead) ═════════════════ */}
        <ViewHeader
          eyebrow="My Classes"
          title="Your classes this semester"
          description={
            hasClasses
              ? `${count} ${count === 1 ? 'class' : 'classes'} · ${totalCredits} ${totalCredits === 1 ? 'credit' : 'credits'}`
              : 'Add your schedule so coaches plan practices around your academics.'
          }
          primaryAction={
            <Button variant="primary" onClick={onAddClass} leftIcon={<Plus className="h-4 w-4" />}>
              Add class
            </Button>
          }
          secondaryActions={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={onImportSchedule}
                leftIcon={<Upload className="h-4 w-4" />}
              >
                Import
              </Button>
              {hasClasses ? (
                <Button variant="ghost" size="sm" onClick={onDeleteAll}>
                  Delete all
                </Button>
              ) : null}
            </>
          }
        />

        {loading ? (
          /* ── Loading skeleton — shape-matched to the readout grid + weekly
             schedule below (not a generic two-bar placeholder). This is the
             state users actually watch: this page fetches its classes
             client-side, so the route's own Suspense fallback resolves long
             before `loading` here goes false. ── */
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-card border border-border-subtle bg-surface p-4">
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="mt-2 h-3 w-20" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="ml-1 h-3 w-36" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                {DAY_ORDER.map((day) => (
                  <div key={day} className="flex flex-col">
                    <Skeleton className="mx-auto mb-2 h-3 w-16" />
                    <div className="flex min-h-[160px] flex-col gap-2">
                      <div className="flex flex-col gap-1 rounded-fw-md border border-border-subtle bg-surface px-3 py-2.5">
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : !hasClasses ? (
          /* ── Honest empty state ── */
          <Surface elevation="border" padding="lg">
            <EmptyState
              icon={BookOpen}
              title="No classes added"
              description="Add your class schedule to help your coaches plan practices around your academic commitments."
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={onImportSchedule}
                    leftIcon={<Upload className="h-4 w-4" />}
                  >
                    Import schedule
                  </Button>
                  <Button onClick={onAddClass} variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
                    Add first class
                  </Button>
                </div>
              }
            />
          </Surface>
        ) : (
          <>
            {/* ════════════ 2 · QUICK READOUTS (flat, literal tallies) ══════ */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <InstrumentPanel depth="base" padding="md">
                <Readout
                  value={count}
                  format={{ maximumFractionDigits: 0 }}
                  label="Classes"
                  size="md"
                  state="live"
                />
              </InstrumentPanel>
              <InstrumentPanel depth="base" padding="md">
                <Readout
                  value={totalCredits}
                  format={{ maximumFractionDigits: 0 }}
                  label="Credits"
                  size="md"
                  state="live"
                />
              </InstrumentPanel>
              <InstrumentPanel depth="base" padding="md">
                <Readout
                  value={daysActive}
                  format={{ maximumFractionDigits: 0 }}
                  label="Days / week"
                  size="md"
                  state="live"
                />
              </InstrumentPanel>
              <InstrumentPanel depth="base" padding="md">
                <Readout
                  value={buildingCount}
                  format={{ maximumFractionDigits: 0 }}
                  label="Buildings"
                  size="md"
                  state="live"
                />
              </InstrumentPanel>
            </div>

            {/* ════════════ 3 · WEEKLY SCHEDULE (matte day columns) ═════════ */}
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                Weekly schedule
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:gap-3 md:overflow-x-visible md:pb-0">
                {DAY_ORDER.map((day) => {
                  const dayClasses = classesByDay[day] ?? [];
                  return (
                    <div
                      key={day}
                      className="min-w-[70vw] flex-shrink-0 md:min-w-0 md:flex-shrink"
                    >
                      <p className="mb-2 text-center font-fw-sans text-caption font-medium text-text-tertiary">
                        {DAY_NAMES[day]}
                      </p>
                      <div className="flex min-h-[160px] flex-col gap-2">
                        {dayClasses.length > 0 ? (
                          dayClasses.map((cls) => {
                            const { code, name } = parseClassName(cls.class_name);
                            const location = getLocationDisplay(cls);
                            return (
                              <Button
                                key={`${cls.id}-${day}`}
                                type="button"
                                variant="ghost"
                                onClick={() => onClassClick(cls)}
                                className="flex h-auto min-h-0 w-full flex-col items-start gap-0.5 rounded-fw-md border border-border-subtle bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                style={{
                                  borderLeftColor: cls.color || undefined,
                                  borderLeftWidth: cls.color ? '3px' : undefined,
                                }}
                              >
                                {code ? (
                                  <span className="font-fw-mono text-caption font-medium text-accent-600">
                                    {code}
                                  </span>
                                ) : null}
                                <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                                  {name}
                                </span>
                                {cls.start_time ? (
                                  <span className="font-fw-sans text-caption text-text-tertiary">
                                    {formatTimeDisplay(cls.start_time)}
                                    {cls.end_time ? ` – ${formatTimeDisplay(cls.end_time)}` : ''}
                                  </span>
                                ) : null}
                                {location ? (
                                  <span className="font-fw-sans text-caption text-text-tertiary">
                                    {location}
                                  </span>
                                ) : null}
                              </Button>
                            );
                          })
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-fw-md border border-dashed border-border-subtle py-8">
                            <span className="font-fw-sans text-caption text-text-tertiary">
                              No classes
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ════════════ 4 · ALL CLASSES (matte list) ════════════════════ */}
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                All classes
              </h2>
              <div className="flex flex-col gap-2.5">
                {classes.map((cls) => {
                  const { code, name } = parseClassName(cls.class_name);
                  const location = getLocationDisplay(cls);
                  return (
                    <Surface key={cls.id} elevation="border" padding="none">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onClassClick(cls)}
                        className="h-auto min-h-0 w-full items-center justify-start gap-4 rounded-none px-4 py-3.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        <span
                          aria-hidden
                          className="h-10 w-1.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: cls.color || 'var(--fw-accent-500, currentColor)' }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            {code ? (
                              <span className="font-fw-mono text-body-sm font-medium text-accent-600">
                                {code}
                              </span>
                            ) : null}
                            <span className="truncate font-fw-sans text-body font-medium text-text-primary">
                              {name}
                            </span>
                            {cls.credits != null ? (
                              <Chip tone="neutral" size="sm" className="font-fw-mono tabular-nums">
                                {cls.credits} cr
                              </Chip>
                            ) : null}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-caption text-text-tertiary">
                            {(cls.days ?? []).length > 0 ? (
                              <span className="font-medium text-text-secondary">
                                {formatDaysDisplay(cls.days ?? [])}
                              </span>
                            ) : null}
                            {cls.start_time && cls.end_time ? (
                              <span>
                                {formatTimeDisplay(cls.start_time)} – {formatTimeDisplay(cls.end_time)}
                              </span>
                            ) : null}
                            {location ? (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" aria-hidden />
                                {location}
                              </span>
                            ) : null}
                            {cls.instructor ? <span>{cls.instructor}</span> : null}
                          </span>
                        </span>
                      </Button>
                    </Surface>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default FairwayGolfClasses;
