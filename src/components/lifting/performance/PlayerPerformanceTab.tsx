'use client';

// =============================================================================
// src/components/lifting/performance/PlayerPerformanceTab.tsx
//
// Helm Lifting Lab — player performance profile tabbed container.
//
// Tabs:
//   Overview   — profile header + weight summary + latest PR + active nutrition
//   Weight     — BodyweightChart (7/30/90/season)
//   Soreness   — SorenessHistoryPanel (scrollable timeline)
//   Lifts      — LiftProgressionChart (per-exercise selector)
//   PRs        — PRTimeline
//   Compliance — PerformanceCompliancePanel
//   Nutrition  — PlayerNutritionPlans
//
// Data is fetched via server actions on mount (single pass per tab switch).
// Parent passes orgId + optionally athleteId (coach viewing a player).
// =============================================================================

import { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IconActivity,
  IconChart,
  IconNote,
  IconAlertCircle,
  IconTrendingUp,
  IconCheck,
} from '@/components/icons';

import { BodyweightChart } from './BodyweightChart';
import type { BodyweightEntry } from './BodyweightChart';
import { SorenessHistoryPanel } from './SorenessHistoryPanel';
import type { SorenessCheckinSummary, SorenessMapEntry } from './SorenessHistoryPanel';
import { LiftProgressionChart } from './LiftProgressionChart';
import { PRTimeline } from './PRTimeline';
import { PerformanceCompliancePanel } from './PerformanceCompliancePanel';
import { PlayerNutritionPlans } from './PlayerNutritionPlans';

import {
  getPlayerPerformanceProfile,
  getPlayerLiftProgression,
  getPlayerPerformanceCompliance,
} from '@/app/lifting/actions/performance-profile';
import type {
  PlayerPerformanceProfile,
  ExerciseProgression,
  PlayerPerformanceCompliance,
} from '@/app/lifting/actions/performance-profile';

import type { HelmLiftingReadinessBand } from '@/lib/types/helm-lifting-data';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  orgId: string;
  /** Coach-viewing-an-athlete path. Omit for athlete self-view. */
  athleteId?: string | null;
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

type TabKey = 'overview' | 'weight' | 'soreness' | 'lifts' | 'prs' | 'compliance' | 'nutrition';

const TABS: { key: TabKey; label: string; shortLabel: string }[] = [
  { key: 'overview',    label: 'Overview',    shortLabel: 'Overview'    },
  { key: 'weight',      label: 'Weight',      shortLabel: 'Weight'      },
  { key: 'soreness',    label: 'Soreness',    shortLabel: 'Soreness'    },
  { key: 'lifts',       label: 'Lifts',       shortLabel: 'Lifts'       },
  { key: 'prs',         label: 'PRs',         shortLabel: 'PRs'         },
  { key: 'compliance',  label: 'Compliance',  shortLabel: 'Compliance'  },
  { key: 'nutrition',   label: 'Nutrition',   shortLabel: 'Nutrition'   },
];

// ---------------------------------------------------------------------------
// Readiness band meta
// ---------------------------------------------------------------------------

const BAND_META: Record<HelmLiftingReadinessBand, { label: string; cls: string }> = {
  green:        { label: 'Ready',   cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  yellow:       { label: 'Caution', cls: 'bg-amber-50 text-amber-700 border-amber-200'       },
  orange_lower: { label: 'Limited', cls: 'bg-orange-50 text-orange-700 border-orange-200'    },
  orange_upper: { label: 'At risk', cls: 'bg-orange-50 text-orange-700 border-orange-200'    },
  red:          { label: 'Hold',    cls: 'bg-red-50 text-red-600 border-red-200'             },
  blue:         { label: 'Sick',    cls: 'bg-blue-50 text-blue-700 border-blue-200'          },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weightChangePill(change: number | null): { label: string; cls: string } | null {
  if (change === null) return null;
  if (Math.abs(change) < 0.1) return { label: 'Stable', cls: 'text-warm-500' };
  const sign = change > 0 ? '+' : '';
  return {
    label: `${sign}${change} lbs`,
    cls: change > 0 ? 'text-amber-600' : 'text-primary-600',
  };
}

function fmtDate(ymd: string | null): string {
  if (!ymd) return '';
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Overview header card
// ---------------------------------------------------------------------------

function ProfileHeader({ profile }: { profile: PlayerPerformanceProfile }) {
  const name = [profile.athlete.first_name, profile.athlete.last_name]
    .filter(Boolean)
    .join(' ') || 'Athlete';
  const band =
    profile.lastReadinessBand && profile.lastReadinessBand in BAND_META
      ? BAND_META[profile.lastReadinessBand as HelmLiftingReadinessBand]
      : null;
  const wChange = weightChangePill(profile.weightChange30d);

  return (
    <Card variant="glass">
      <CardContent className="pt-5">
        {/* Name + band */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-warm-900">{name}</h2>
            {profile.athlete.position && (
              <p className="text-sm text-warm-500">{profile.athlete.position}</p>
            )}
          </div>
          {band && (
            <Badge className={`${band.cls} border text-xs`}>{band.label}</Badge>
          )}
        </div>

        {/* Stats grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Weight */}
          <div className="rounded-xl bg-warm-50/60 px-3 py-2.5">
            <p className="text-xs text-warm-400 uppercase tracking-wide">Weight</p>
            <p className="mt-0.5 font-semibold text-warm-900">
              {profile.currentWeightLbs !== null ? `${profile.currentWeightLbs} lbs` : '—'}
            </p>
            {wChange && (
              <p className={`text-xs font-medium ${wChange.cls}`}>{wChange.label} (30d)</p>
            )}
            {profile.weightEntryDate && (
              <p className="text-xs text-warm-400">{fmtDate(profile.weightEntryDate)}</p>
            )}
          </div>

          {/* Soreness status */}
          <div className="rounded-xl bg-warm-50/60 px-3 py-2.5">
            <p className="text-xs text-warm-400 uppercase tracking-wide">Last Check-in</p>
            <p className="mt-0.5 font-semibold text-warm-900">
              {profile.lastSorenessStatus === 'ready_to_go' ? (
                <span className="flex items-center gap-1 text-primary-600">
                  <IconCheck size={14} /> Ready
                </span>
              ) : profile.lastSorenessStatus === 'reported_soreness' ? (
                <span className="flex items-center gap-1 text-amber-600">
                  <IconActivity size={14} /> Soreness
                </span>
              ) : (
                '—'
              )}
            </p>
            {profile.lastCheckinDate && (
              <p className="text-xs text-warm-400">{fmtDate(profile.lastCheckinDate)}</p>
            )}
          </div>

          {/* Lift completion */}
          <div className="rounded-xl bg-warm-50/60 px-3 py-2.5">
            <p className="text-xs text-warm-400 uppercase tracking-wide">Lift Rate</p>
            <p className="mt-0.5 font-semibold text-warm-900">
              {profile.liftCompletionPct30d !== null
                ? `${profile.liftCompletionPct30d}%`
                : '—'}
            </p>
            <p className="text-xs text-warm-400">30 days</p>
          </div>

          {/* Latest PR */}
          <div className="rounded-xl bg-warm-50/60 px-3 py-2.5">
            <p className="text-xs text-warm-400 uppercase tracking-wide">Latest PR</p>
            {profile.latestPR ? (
              <>
                <p className="mt-0.5 truncate font-semibold text-warm-900">
                  {profile.latestPR.value} {profile.latestPR.unit}
                </p>
                <p className="truncate text-xs text-warm-400">
                  {profile.latestPR.exercise_name}
                </p>
              </>
            ) : (
              <p className="mt-0.5 font-semibold text-warm-400">—</p>
            )}
          </div>
        </div>

        {/* Active nutrition plan pill */}
        {profile.activeNutritionPlan && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-50/60 px-3 py-2">
            <IconNote size={14} className="text-primary-600 shrink-0" />
            <p className="min-w-0 truncate text-xs font-medium text-primary-700">
              Active plan: {profile.activeNutritionPlan.title}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function PlayerPerformanceTab({ orgId, athleteId }: Props) {
  const prefersReduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // ── Data state ────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<PlayerPerformanceProfile | null>(null);
  const [progressions, setProgressions] = useState<ExerciseProgression[]>([]);
  const [compliance, setCompliance] = useState<PlayerPerformanceCompliance | null>(null);

  // Bodyweight and soreness history are derived from embedded profile data
  // and secondary fetches. We keep a simple "hydrated" flag per section.
  const [weightEntries, setWeightEntries] = useState<BodyweightEntry[]>([]);
  const [sorenessHistory, setSorenessHistory] = useState<SorenessCheckinSummary[]>([]);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingLifts, setLoadingLifts] = useState(false);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [loadingWeight, setLoadingWeight] = useState(false);
  const [loadingSoreness, setLoadingSoreness] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Track which deferred tabs have been fetched
  const fetchedTabs = useRef(new Set<TabKey>());

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const data = await getPlayerPerformanceProfile({ orgId, athleteId });
      setProfile(data);
    } catch {
      setError('Could not load performance profile.');
    } finally {
      setLoadingProfile(false);
    }
  }, [orgId, athleteId]);

  const fetchLifts = useCallback(async () => {
    if (fetchedTabs.current.has('lifts')) return;
    fetchedTabs.current.add('lifts');
    setLoadingLifts(true);
    try {
      const data = await getPlayerLiftProgression({ orgId, athleteId });
      setProgressions(data);
    } catch {
      // Non-fatal; lifts will show empty state
    } finally {
      setLoadingLifts(false);
    }
  }, [orgId, athleteId]);

  const fetchCompliance = useCallback(async () => {
    if (fetchedTabs.current.has('compliance')) return;
    fetchedTabs.current.add('compliance');
    setLoadingCompliance(true);
    try {
      const data = await getPlayerPerformanceCompliance({ orgId, athleteId });
      setCompliance(data);
    } catch {
      // Non-fatal
    } finally {
      setLoadingCompliance(false);
    }
  }, [orgId, athleteId]);

  // Weight history: derive from profile's current weight; for a real chart we
  // need the raw bodyweight entries. We fetch them lazily via the soreness/
  // weight tab by re-using the profile data structure. Since performance-profile
  // only returns the latest weight entry (not the full series), we call
  // getPlayerLiftProgression which already fetches sessions. For the actual
  // bodyweight series we need a dedicated fetch — we approximate by composing
  // from profile when the weight tab is opened.
  //
  // NOTE: A full bodyweight time-series would require a dedicated server action.
  // Until one exists, BodyweightChart receives whatever entries are available
  // from the profile (0 or 1 point from currentWeightLbs).
  // The parent page can inject a pre-fetched `weightEntries` prop in the future.
  //
  // For now, if profile has a current weight, seed the chart with that single
  // point so the empty state is honest ("No weight entries" means truly zero).

  const seedWeightFromProfile = useCallback(() => {
    if (fetchedTabs.current.has('weight')) return;
    fetchedTabs.current.add('weight');
    setLoadingWeight(true);
    setTimeout(() => {
      setWeightEntries((prev) => {
        if (prev.length > 0) return prev;
        if (profile?.currentWeightLbs != null && profile.weightEntryDate) {
          return [{ entry_date: profile.weightEntryDate, weight_lbs: profile.currentWeightLbs }];
        }
        return [];
      });
      setLoadingWeight(false);
    }, 0);
  }, [profile]);

  // Soreness history: similarly seeded from profile's lastSorenessStatus until
  // a dedicated soreness-history action is wired. The panel shows honest empty state.
  const seedSorenessFromProfile = useCallback(() => {
    if (fetchedTabs.current.has('soreness')) return;
    fetchedTabs.current.add('soreness');
    setLoadingSoreness(true);
    setTimeout(() => {
      setSorenessHistory((prev) => {
        if (prev.length > 0) return prev;
        if (profile?.lastSorenessStatus && profile.lastCheckinDate) {
          const entry: SorenessCheckinSummary = {
            checkin_date: profile.lastCheckinDate,
            soreness_status: profile.lastSorenessStatus,
            soreness_overall: null,
            notes: null,
            regions: [] as SorenessMapEntry[],
          };
          return [entry];
        }
        return [];
      });
      setLoadingSoreness(false);
    }, 0);
  }, [profile]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  // Fetch deferred data when tabs are selected
  useEffect(() => {
    if (activeTab === 'lifts' || activeTab === 'prs') void fetchLifts();
    if (activeTab === 'compliance') void fetchCompliance();
    if (activeTab === 'weight') seedWeightFromProfile();
    if (activeTab === 'soreness') seedSorenessFromProfile();
  }, [activeTab, fetchLifts, fetchCompliance, seedWeightFromProfile, seedSorenessFromProfile]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingProfile) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading performance profile">
        <Card variant="glass">
          <CardHeader>
            <Skeleton className="h-6 w-40 rounded-lg" />
            <Skeleton className="mt-1 h-4 w-24 rounded-lg" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <Skeleton key={t.key} className="h-8 w-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <IconAlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="font-medium text-red-700 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Profile header — always visible */}
      {profile && <ProfileHeader profile={profile} />}

      {/* Tab bar */}
      <div
        className="flex gap-1 overflow-x-auto rounded-2xl bg-warm-100/70 p-1 scrollbar-hide"
        role="tablist"
        aria-label="Performance sections"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`perf-tab-${tab.key}`}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 ${
              activeTab === tab.key
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            {tab.shortLabel}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          id={`perf-tab-${activeTab}`}
          role="tabpanel"
          aria-label={TABS.find((t) => t.key === activeTab)?.label}
          initial={prefersReduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: prefersReduced ? 0 : 0.18 }}
          className="space-y-4"
        >
          {activeTab === 'overview' && (
            <OverviewTab profile={profile} progressions={progressions} />
          )}

          {activeTab === 'weight' && (
            <BodyweightChart entries={weightEntries} loading={loadingWeight} />
          )}

          {activeTab === 'soreness' && (
            <SorenessHistoryPanel checkins={sorenessHistory} loading={loadingSoreness} />
          )}

          {activeTab === 'lifts' && (
            <LiftProgressionChart progressions={progressions} loading={loadingLifts} />
          )}

          {activeTab === 'prs' && (
            <PRTimeline progressions={progressions} loading={loadingLifts} />
          )}

          {activeTab === 'compliance' && (
            <PerformanceCompliancePanel compliance={compliance} loading={loadingCompliance} />
          )}

          {activeTab === 'nutrition' && (
            <PlayerNutritionPlans
              plan={profile?.activeNutritionPlan ?? null}
              loading={loadingProfile}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab — quick summary combining profile + recent lift highlights
// ---------------------------------------------------------------------------

function OverviewTab({
  profile,
  progressions,
}: {
  profile: PlayerPerformanceProfile | null;
  progressions: ExerciseProgression[];
}) {
  if (!profile) {
    return (
      <Card variant="glass">
        <CardContent className="py-8 text-center text-sm text-warm-400">
          No profile data available.
        </CardContent>
      </Card>
    );
  }

  // Top exercises by number of top-set data points
  const topExercises = [...progressions]
    .sort((a, b) => b.topSets.length - a.topSets.length)
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Active nutrition plan — quick access */}
      {profile.activeNutritionPlan && (
        <PlayerNutritionPlans plan={profile.activeNutritionPlan} />
      )}

      {/* Recent lift highlights */}
      {topExercises.length > 0 && (
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconChart size={18} className="text-primary-600" />
              <h3 className="font-semibold text-warm-900">Recent Lifts</h3>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-warm-100">
              {topExercises.map((ex) => {
                const latest = ex.topSets[ex.topSets.length - 1];
                const first = ex.topSets[0];
                const change =
                  latest && first && ex.topSets.length >= 2 && latest.est1RM && first.est1RM
                    ? latest.est1RM - first.est1RM
                    : null;
                return (
                  <div key={ex.exercise_id} className="flex items-center gap-3 px-4 py-3 lg:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-warm-900 truncate">{ex.exercise_name}</p>
                      <p className="text-xs text-warm-400">
                        {ex.topSets.length} session{ex.topSets.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {latest?.est1RM != null && (
                        <p className="text-sm font-semibold text-warm-900">
                          {latest.est1RM} lbs
                        </p>
                      )}
                      {change !== null && (
                        <p
                          className={`flex items-center justify-end gap-0.5 text-xs font-medium ${
                            change > 0 ? 'text-primary-600' : change < 0 ? 'text-red-500' : 'text-warm-400'
                          }`}
                        >
                          <IconTrendingUp
                            size={11}
                            style={{ transform: change < 0 ? 'scaleY(-1)' : undefined }}
                          />
                          {change > 0 ? '+' : ''}{change} lbs
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* If nothing to show yet */}
      {topExercises.length === 0 && !profile.activeNutritionPlan && (
        <Card variant="glass">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-warm-400">
              Complete sessions to see your performance summary here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
