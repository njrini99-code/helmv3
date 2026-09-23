'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · DueForReviewPanel — Pkg 9 slice 4
 * ----------------------------------------------------------------------------
 * A minimal, additive triage panel: which of the roster's focus areas are
 * overdue or due soon, derived AT RENDER TIME from `target_date` on the SAME
 * `focusAreas` prop `PlayersGridView` already has (the loader in
 * `intelligence/page.tsx` selects `target_kind`/`target_date` into it) — no
 * new fetch, mirroring `RosterHealthHeader`'s own "derived from the same
 * props" convention. Renders nothing when there is nothing due — this is an
 * addition to the page, not a permanent fixture that needs its own "all
 * clear" state.
 *
 * The pure classification (`computeDueFocusAreas`) lives in
 * `src/lib/coachhelm/focus-areas/due-for-review.ts`. This panel runs it
 * locally against data already on the page — no fetch.
 *
 * `todayIso` is REQUIRED and comes from the server (`intelligence/page.tsx`
 * resolves `todayIsoInZone(teamTimezone)` from `golf_team_settings.timezone`
 * and threads it down through `PlayersGridView`). This component must never
 * compute "today" itself with `new Date()` — SSR runs in UTC and hydration
 * runs in the browser's zone, a mismatch on top of being the wrong zone for
 * a coach-local `target_date` (#1998 review; see the due-for-review.ts
 * module doc for the full incident).
 * ========================================================================== */

import * as React from 'react';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { Readout } from '@/components/fairway/instrument/Readout';
import { PlayerIdentity } from '@/components/fairway/controls/PlayerIdentity';
import { Badge } from '@/components/fairway/controls/badge';
import { Button } from '@/components/fairway/controls/button';
import { computeDueFocusAreas, FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT } from '@/lib/coachhelm/focus-areas/due-for-review';
import type { PlayersGridFocusArea, PlayersGridPlayer } from './PlayersGridView';

/** Matches `NEEDS_ATTENTION_LIST_CAP` in RosterHealthHeader.tsx — the panel
 *  states its own cap in the "+N more" caption, so this list and that one
 *  can never silently disagree with their own headline count. */
const DUE_LIST_CAP = 5;

function playerName(p?: PlayersGridPlayer | null): string {
  if (!p) return 'Player';
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
}

export interface DueForReviewPanelProps {
  players: PlayersGridPlayer[];
  focusAreas: PlayersGridFocusArea[];
  /** Today, `YYYY-MM-DD`, on the TEAM's wall clock — resolved server-side.
   *  See the file header; never computed here. */
  todayIso: string;
  /** Review window in days — defaults to `FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT`. */
  dueWithinDays?: number;
  /** Optional "view" affordance per row (e.g. scope the Focus-areas board to
   *  that player). Omit to render the list read-only. */
  onSelectPlayer?: (playerId: string) => void;
}

export function DueForReviewPanel({
  players,
  focusAreas,
  todayIso,
  dueWithinDays = FOCUS_AREA_DUE_WITHIN_DAYS_DEFAULT,
  onSelectPlayer,
}: DueForReviewPanelProps) {
  const byId = React.useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const due = React.useMemo(
    () => computeDueFocusAreas(focusAreas, { todayIso, dueWithinDays }),
    [focusAreas, todayIso, dueWithinDays],
  );

  // Additive, not a permanent fixture — an empty queue means nothing to
  // triage, so the panel simply doesn't render (no "0 due" readout taking up
  // header space on every visit).
  if (due.length === 0) return null;

  const overdueCount = due.filter((d) => d.reason === 'overdue').length;

  return (
    <InstrumentPanel
      depth="base"
      padding="lg"
      header="Due for review"
      as="section"
      readout={
        <Readout
          value={due.length}
          format={{ maximumFractionDigits: 0 }}
          label={overdueCount > 0 ? `${overdueCount} overdue` : 'Due soon'}
          size="sm"
          align="end"
          state="live"
        />
      }
    >
      <ul className="flex flex-col">
        {due.slice(0, DUE_LIST_CAP).map(({ area, reason }) => (
          <li key={area.id} className="border-t border-border-subtle py-2.5 first:border-t-0">
            <PlayerIdentity
              name={playerName(byId.get(area.player_id))}
              avatarUrl={byId.get(area.player_id)?.avatar_url ?? null}
              size="sm"
              meta={area.title || undefined}
              trailing={
                <div className="flex items-center gap-2">
                  <Badge tone={reason === 'overdue' ? 'danger' : 'warning'} size="sm">
                    {reason === 'overdue' ? 'Overdue' : 'Due soon'}
                  </Badge>
                  {onSelectPlayer ? (
                    <Button variant="ghost" size="sm" onClick={() => onSelectPlayer(area.player_id)}>
                      View
                    </Button>
                  ) : null}
                </div>
              }
            />
          </li>
        ))}
      </ul>
      {due.length > DUE_LIST_CAP ? (
        <span className="font-fw-sans text-caption text-text-tertiary">
          +{due.length - DUE_LIST_CAP} more due for review.
        </span>
      ) : null}
    </InstrumentPanel>
  );
}
