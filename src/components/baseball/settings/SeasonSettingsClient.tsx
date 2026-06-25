'use client';

// =============================================================================
// src/components/baseball/settings/SeasonSettingsClient.tsx
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// The SEASON settings surface (v4 §Team And Season Settings + §Season-specific)
// that previously had NO surface at all: phase (fall/winter/preseason/in-season/
// postseason/summer-showcase), archive status, the current season, and the
// season-specific module toggles (roster / schedule / stats / practice-templates
// / lift-groups / performance-baselines / player-status).
//
// Reuses GolfHelm UI primitives verbatim (Card / Button / Header / EmptyState).
// cream/green tokens, gap-6, editorial type. Capability-gated writes only; no
// golf vocabulary.
// =============================================================================

import { useState, useTransition } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { IconCheck, IconLock, IconClock } from '@/components/icons';

import {
  BASEBALL_SEASON_PHASES,
  BASEBALL_SEASON_PHASE_LABELS,
  BASEBALL_SEASON_MODULE_TOGGLES,
  type BaseballSeason,
  type BaseballSeasonPhase,
  type BaseballSeasonModuleKey,
} from '@/lib/types/baseball-team-season-settings';
import {
  createSeason,
  updateSeason,
  setCurrentSeason,
  archiveSeason,
} from '@/app/baseball/actions/team-season-settings';

interface Props {
  data: { seasons: BaseballSeason[]; viewerCanManageSettings: boolean };
}

export function SeasonSettingsClient({ data }: Props) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [seasons, setSeasons] = useState<BaseballSeason[]>(data.seasons);
  const [newLabel, setNewLabel] = useState('');
  const [newPhase, setNewPhase] = useState<BaseballSeasonPhase>('preseason');

  const canEdit = data.viewerCanManageSettings;
  const reduceMotion = useReducedMotion();

  const refreshLocal = (updater: (prev: BaseballSeason[]) => BaseballSeason[]) =>
    setSeasons(updater);

  const handleCreate = () => {
    const label = newLabel.trim();
    if (!label) {
      showToast('Give the season a name first.', 'error');
      return;
    }
    startTransition(async () => {
      try {
        const makeCurrent = seasons.length === 0; // first season becomes current
        const res = await createSeason({
          label,
          phase: newPhase,
          is_current: makeCurrent,
        });
        refreshLocal((prev) => {
          const created: BaseballSeason = {
            id: res.id,
            team_id: prev[0]?.team_id ?? '',
            label,
            phase: newPhase,
            starts_on: null,
            ends_on: null,
            status: 'active',
            is_current: makeCurrent,
            roster_enabled: true,
            schedule_enabled: true,
            stats_enabled: true,
            practice_templates_enabled: true,
            lift_groups_enabled: true,
            performance_baselines_enabled: true,
            player_status_tracking_enabled: true,
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          // If the new season is current, clear is_current on the others.
          const rest = makeCurrent ? prev.map((s) => ({ ...s, is_current: false })) : prev;
          return [created, ...rest];
        });
        setNewLabel('');
        showToast(`Season "${label}" created`, 'success');
      } catch {
        showToast('Could not create the season.', 'error');
      }
    });
  };

  const handlePhase = (id: string, phase: BaseballSeasonPhase) => {
    const prev = seasons;
    refreshLocal((list) => list.map((s) => (s.id === id ? { ...s, phase } : s)));
    startTransition(async () => {
      try {
        await updateSeason(id, { phase });
      } catch {
        setSeasons(prev);
        showToast('Could not update the phase.', 'error');
      }
    });
  };

  const handleToggle = (id: string, key: BaseballSeasonModuleKey, value: boolean) => {
    const prev = seasons;
    refreshLocal((list) => list.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
    startTransition(async () => {
      try {
        await updateSeason(id, { [key]: value });
      } catch {
        setSeasons(prev);
        showToast('Could not update the module.', 'error');
      }
    });
  };

  const handleSetCurrent = (id: string) => {
    const prev = seasons;
    refreshLocal((list) =>
      list.map((s) => ({ ...s, is_current: s.id === id, status: s.id === id ? 'active' : s.status })),
    );
    startTransition(async () => {
      try {
        await setCurrentSeason(id);
        showToast('Current season updated', 'success');
      } catch {
        setSeasons(prev);
        showToast('Could not set the current season.', 'error');
      }
    });
  };

  const handleArchive = (id: string) => {
    const prev = seasons;
    refreshLocal((list) =>
      list.map((s) => (s.id === id ? { ...s, status: 'archived', is_current: false } : s)),
    );
    startTransition(async () => {
      try {
        await archiveSeason(id);
        showToast('Season archived', 'success');
      } catch {
        setSeasons(prev);
        showToast('Could not archive the season.', 'error');
      }
    });
  };

  return (
    <LazyMotion features={domAnimation}>
      <Header
        title="Season Settings"
        subtitle="Phases, the current season, and what each season runs."
      />

      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        {!canEdit && (
          <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-600 flex items-center gap-2">
            <IconLock size={16} className="text-warm-400 shrink-0" />
            You can view seasons but only staff with the manage-settings capability
            can change them.
          </div>
        )}

        {/* Create */}
        {canEdit && (
          <Card variant="glass">
            <CardHeader>
              <h2 className="font-semibold text-warm-900">Add a season</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                label="Season name"
                placeholder="e.g. Fall 2026"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <div>
                <p id="new-season-phase-label" className="font-medium text-warm-900 mb-2 text-sm">Phase</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="new-season-phase-label">
                  {BASEBALL_SEASON_PHASES.map((phase) => (
                    <Button
                      key={phase}
                      type="button"
                      variant="ghost"
                      size="sm"
                      role="radio"
                      aria-checked={newPhase === phase}
                      onClick={() => setNewPhase(phase)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                        newPhase === phase
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-primary-200',
                      )}
                    >
                      {BASEBALL_SEASON_PHASE_LABELS[phase]}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreate} isLoading={isPending} disabled={!newLabel.trim()}>
                  Add season
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* List */}
        {seasons.length === 0 ? (
          <EmptyState
            variant="card"
            glass
            icon={<IconClock size={40} />}
            title="No seasons yet"
            description={
              canEdit
                ? 'Add your first season above to start scoping rosters, schedules, and stats by season.'
                : 'Your coaching staff has not set up a season yet.'
            }
          />
        ) : (
          seasons.map((season, i) => (
            <m.div
              key={season.id}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.2) }}
            >
            <Card variant="glass">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-warm-900">{season.label}</h3>
                      {season.is_current && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                          <IconCheck size={12} /> Current
                        </span>
                      )}
                      {season.status === 'archived' && (
                        <span className="rounded-full bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-500">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-warm-500">
                      {BASEBALL_SEASON_PHASE_LABELS[season.phase]}
                    </p>
                  </div>
                  {canEdit && season.status !== 'archived' && (
                    <div className="flex gap-2 shrink-0">
                      {!season.is_current && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSetCurrent(season.id)}
                          disabled={isPending}
                        >
                          Set current
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchive(season.id)}
                        disabled={isPending}
                      >
                        Archive
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Phase picker */}
                {canEdit && season.status !== 'archived' && (
                  <div>
                    <p className="font-medium text-warm-900 mb-2 text-sm">Phase</p>
                    <div
                      className="flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-label={`Phase for ${season.label}`}
                    >
                      {BASEBALL_SEASON_PHASES.map((phase) => (
                        <Button
                          key={phase}
                          type="button"
                          variant="ghost"
                          size="sm"
                          role="radio"
                          aria-checked={season.phase === phase}
                          disabled={isPending}
                          onClick={() => handlePhase(season.id, phase)}
                          className={cn(
                            'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                            season.phase === phase
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-primary-200',
                            isPending && 'opacity-70',
                          )}
                        >
                          {BASEBALL_SEASON_PHASE_LABELS[phase]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Season-specific module toggles */}
                <div>
                  <p className="font-medium text-warm-900 mb-2 text-sm">
                    What this season runs
                  </p>
                  <div className="space-y-2">
                    {BASEBALL_SEASON_MODULE_TOGGLES.map((mod) => (
                      <Checkbox
                        key={mod.key}
                        label={mod.label}
                        description={mod.description}
                        checked={season[mod.key]}
                        disabled={!canEdit || isPending || season.status === 'archived'}
                        onChange={(e) => handleToggle(season.id, mod.key, e.target.checked)}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            </m.div>
          ))
        )}
      </div>
    </LazyMotion>
  );
}
