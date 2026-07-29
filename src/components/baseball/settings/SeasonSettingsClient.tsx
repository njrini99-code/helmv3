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
// Capability-gated writes only; no golf vocabulary.
//
// DESIGN MIGRATION (settings unification)
// ---------------------------------------
// This screen rendered a hand-rolled `border-b border-warm-200/60` title bar
// (no masthead at all, unlike every sibling settings route), legacy
// `Card variant="glass"` panels, the generic `@/components/ui/empty-state`
// EmptyState, and `primary-*` phase pills — three vocabularies away from the
// Program Settings screen a coach reaches it from. It now composes from
// `SettingsChrome` + the Living Annual kit like the rest of the tree.
//
// PRESENTATION-ONLY: createSeason / updateSeason / setCurrentSeason /
// archiveSeason payloads, the optimistic-update-then-rollback pattern, the
// first-season-becomes-current rule, and every disabled/`canEdit` gate are
// untouched.
// =============================================================================

import { useState, useTransition } from 'react';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { IconCheck, IconLock, IconCalendar } from '@/components/icons';
import { EditorsLetter, InkBadge } from '@/components/baseball/living-annual';
import {
  SettingsNotice,
  SettingsSection,
  SettingsShell,
} from '@/components/baseball/settings/SettingsChrome';

/** Selected vs unselected chrome for the phase radio groups. */
const PHASE_BASE =
  'rounded-fw-sm border px-3 py-1.5 text-sm font-medium transition-colors duration-200';
const PHASE_SELECTED = 'border-grade-plus bg-grade-plus/10 text-text-primary';
const PHASE_IDLE =
  'border-[color:var(--hairline)] bg-[var(--paper-canvas)] text-text-secondary hover:border-grade-plus/40';

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
    <LazyMotion features={loadFeatures}>
      <SettingsShell
        title="Season Settings"
        lede="Phases, the current season, and what each season runs."
      >
        {!canEdit && (
          <SettingsNotice icon={<IconLock size={16} />}>
            You can view seasons but only staff with the manage-settings capability
            can change them.
          </SettingsNotice>
        )}

        {/* Create */}
        {canEdit && (
          <SettingsSection icon={<IconCalendar size={18} />} title="Add a season">
            <Input
              label="Season name"
              placeholder="e.g. Fall 2026"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <div>
              <p id="new-season-phase-label" className="mb-2 text-sm font-medium text-text-primary">
                Phase
              </p>
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
                    className={cn(PHASE_BASE, newPhase === phase ? PHASE_SELECTED : PHASE_IDLE)}
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
          </SettingsSection>
        )}

        {/* List */}
        {seasons.length === 0 ? (
          <EditorsLetter
            ink="team"
            title="No seasons yet."
            body={
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
              <SettingsSection
                title={season.label}
                subtitle={BASEBALL_SEASON_PHASE_LABELS[season.phase]}
                badge={
                  <>
                    {/* The check glyph stays alongside the stamp: "current" is
                        load-bearing state and the doctrine forbids color as the
                        only channel, so ink + glyph + word all carry it. */}
                    {season.is_current && (
                      <span className="inline-flex items-center gap-1">
                        <IconCheck size={12} className="text-grade-plus" />
                        <InkBadge label="Current" tone="team" variant="solid" />
                      </span>
                    )}
                    {season.status === 'archived' && (
                      <InkBadge label="Archived" tone="neutral" />
                    )}
                  </>
                }
                actions={
                  canEdit && season.status !== 'archived' ? (
                    <div className="flex gap-2">
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
                  ) : undefined
                }
              >
                {/* Phase picker */}
                {canEdit && season.status !== 'archived' && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-text-primary">Phase</p>
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
                            PHASE_BASE,
                            season.phase === phase ? PHASE_SELECTED : PHASE_IDLE,
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
                  <p className="mb-2 text-sm font-medium text-text-primary">
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
              </SettingsSection>
            </m.div>
          ))
        )}
      </SettingsShell>
    </LazyMotion>
  );
}
