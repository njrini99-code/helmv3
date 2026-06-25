'use client';

// =============================================================================
// src/components/baseball/import-center/ImportCenterShell.tsx
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// The Import Center shell that hosts the two import modes with a clear purpose
// for each (no generic uniform grid; one prominent action per mode):
//   * Box score — flat per-player game/season lines into baseball_player_stats
//     (the legacy ImportWizardClient, kept intact).
//   * Event level — pitch / batted-ball / swing events parsed with the vendor's
//     real format (TrackMan / Rapsodo / Blast / Diamond Kinetics / GameChanger /
//     StatCrew) into the elite event tables (the new EventImportWizard).
//
// Cream/green tokens + GolfHelm primitives. The mode switch is a segmented
// control, not a tab-soup; the header states what each mode is for.
// =============================================================================

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ImportWizardClient } from '@/components/baseball/import-center/ImportWizardClient';
import { EventImportWizard } from '@/components/baseball/import-center/EventImportWizard';
import type { BaseballImportRunRow } from '@/lib/types/baseball-imports';
import type { BaseballSourceKey } from '@/lib/types/baseball-stat-events';
import type { BaseballSourceTrustLevel } from '@/lib/types/baseball-settings';
import type { MatchablePlayer } from '@/lib/baseball/import-matching';

// The shell carries the full matcher shape (id/name + jersey/grad_year/position)
// so the box-score wizard's manual-match dropdown can show disambiguation hints.
// The event wizard only reads id/name, which this superset satisfies.
type RosterPlayer = MatchablePlayer;

/**
 * A box-score source picker option: the hardcoded adapter defaults merged with
 * the team's registered import-source policy (trust level + required-review),
 * so the wizard offers and labels what the coach actually configured.
 */
export interface RegisteredSourceOption {
  /** the key the commit path resolves the registry row on (source_type / adapter id). */
  value: string;
  label: string;
  registered: boolean;
  trustLevel: BaseballSourceTrustLevel | null;
  requiredReview: boolean | null;
}

interface Props {
  teamId: string;
  teamName: string;
  players: RosterPlayer[];
  recentRuns: BaseballImportRunRow[];
  eventSources: Array<{ key: BaseballSourceKey; label: string; accept: string }>;
  registeredSources: RegisteredSourceOption[];
}

type Mode = 'box_score' | 'event_level';

export function ImportCenterShell({
  teamId,
  teamName,
  players,
  recentRuns,
  eventSources,
  registeredSources,
}: Props) {
  const [mode, setMode] = useState<Mode>('box_score');

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-warm-900">Import Center</h1>
        <p className="mt-1 text-warm-600">
          Bring stats into <span className="font-medium text-warm-800">{teamName}</span> from an
          export. Every import is auditable and can be rolled back.
        </p>
      </header>

      {/* Mode switch — segmented control with a one-line purpose under each. */}
      <div
        role="tablist"
        aria-label="Import mode"
        className="mb-6 inline-flex rounded-xl border border-warm-200 bg-cream-50 p-1"
      >
        <ModeButton
          active={mode === 'box_score'}
          onClick={() => setMode('box_score')}
          label="Box score"
        />
        <ModeButton
          active={mode === 'event_level'}
          onClick={() => setMode('event_level')}
          label="Event level"
        />
      </div>

      {mode === 'box_score' ? (
        // showHeader={false} suppresses the wizard's own <h1> since the shell
        // already renders the "Import Center" header above the mode switcher.
        <ImportWizardClient
          teamId={teamId}
          teamName={teamName}
          players={players}
          recentRuns={recentRuns}
          registeredSources={registeredSources}
          showHeader={false}
        />
      ) : (
        <EventImportWizard
          teamId={teamId}
          teamName={teamName}
          players={players}
          eventSources={eventSources}
        />
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      variant={active ? 'primary' : 'ghost'}
      size="sm"
      className={active ? 'shadow-sm' : 'text-warm-600 hover:text-warm-900'}
    >
      {label}
    </Button>
  );
}
