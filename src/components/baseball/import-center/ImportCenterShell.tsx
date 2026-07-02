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
// LIVING ANNUAL PRESENTATION — SectionMasthead hosts the page title (Pressbox /
// team-ops, green ink) and the mode switch reads as an InkBadge tab pair (the
// same pressable-tab pattern the postgame game-picker uses), not a shadcn
// segmented control. The header states what each mode is for.
// =============================================================================

import { useState } from 'react';

import { cn } from '@/lib/utils';
import { pressableClass, InkBadge, Reveal, SectionMasthead } from '@/components/baseball/living-annual';
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

const MODE_META: Record<Mode, { label: string; blurb: string }> = {
  box_score: { label: 'Box score', blurb: 'Per-player game or season lines' },
  event_level: { label: 'Event level', blurb: 'Pitch / batted-ball / swing data' },
};

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
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <Reveal>
        <SectionMasthead eyebrow="THE PRESSBOX · IMPORT CENTER" title="Import Center" ink="team">
          <p className="max-w-2xl font-annual text-body-lg leading-relaxed text-text-secondary">
            Bring stats into <span className="font-semibold text-text-primary">{teamName}</span> from an
            export. Every import is auditable and can be rolled back.
          </p>
        </SectionMasthead>
      </Reveal>

      {/* Mode switch — a two-tab pressable pair, ink carries the active state
          (spec §7.1, the postgame game-picker's pattern), with a one-line
          purpose blurb under each so the coach knows which mode to pick. */}
      <Reveal staggerIndex={1}>
        <div role="tablist" aria-label="Import mode" className="flex flex-wrap gap-2">
          {(Object.keys(MODE_META) as Mode[]).map((m) => {
            const active = mode === m;
            return (
              // eslint-disable-next-line helm/no-raw-button
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(m)}
                className={cn('flex flex-col items-start gap-1 rounded-fw-lg px-4 py-2.5', pressableClass({ ink: 'team' }))}
              >
                <InkBadge label={MODE_META[m].label} tone={active ? 'team' : 'neutral'} variant={active ? 'solid' : 'soft'} />
                <span className="text-caption text-text-tertiary">{MODE_META[m].blurb}</span>
              </button>
            );
          })}
        </div>
      </Reveal>

      {mode === 'box_score' ? (
        // showHeader={false} suppresses the wizard's own header since the shell
        // already renders the "Import Center" masthead above the mode switcher.
        // onRequestEventLevel: when the coach picks "Event log" in Step 1, we
        // switch to the "Event level" mode so they reach the EventImportWizard
        // instead of a dead end.
        <ImportWizardClient
          teamId={teamId}
          teamName={teamName}
          players={players}
          recentRuns={recentRuns}
          registeredSources={registeredSources}
          showHeader={false}
          onRequestEventLevel={() => setMode('event_level')}
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
