'use client';

import { readRoundHolesForExport } from '@/app/golf/actions/rounds-export';
import type { ChLibraryRound } from '../../data/rounds-shape';
import { isoDay } from '../../lib/dates';
import { plural } from '../../lib/plural';
import { ChExportReadError, ExportButton } from '../../ui/ExportButton';
import { roundsCsv, type ChExportHole } from './export';

/** The one read an export makes: the holes of the rounds it holds. The preview and tests pass their own. */
export type ChReadRoundHoles = (roundIds: string[]) => Promise<{ success: true; data: Record<string, ChExportHole[]> } | { success: false; error: string }>;
export const LIVE_READ_ROUND_HOLES: ChReadRoundHoles = (ids) => readRoundHolesForExport(ids);

/**
 * Launch readiness F-02: Export on Rounds (the player's own) and Team rounds (the coach's). It exports the rounds the list
 * shows, search and player filter applied, with their holes read at the press (CH-11480 while they load). A failed read is
 * CH-11080 and nothing is exported; a round posted as a total only goes out with its total and no holes.
 */
export function ExportRounds({
  rounds,
  team,
  name,
  read = LIVE_READ_ROUND_HOLES,
  icon = false,
}: {
  rounds: ReadonlyArray<ChLibraryRound & { player?: string }>;
  team: boolean;
  /** The file name's parts before the day it is exported: the team, the player, "rounds". */
  name: Array<string | null | undefined>;
  read?: ChReadRoundHoles;
  /** The phone's tools row: an icon key. */
  icon?: boolean;
}) {
  const file = async () => {
    const ids = rounds.filter((r) => !r.totalOnly).map((r) => r.id);
    let holes: Record<string, ChExportHole[]> = {};
    if (ids.length) {
      const res = await read(ids).catch((err: unknown) => {
        throw new ChExportReadError(err instanceof Error ? err.message : 'export read failed');
      });
      if (!res.success) throw new ChExportReadError(res.error);
      holes = res.data;
    }
    return roundsCsv({ rounds, holes, team, name: [...name, isoDay(new Date())] });
  };
  return (
    <ExportButton data-ctl="CTL-P011-024"
      file={file}
      done={(f) => `Rounds exported · ${plural(f.rows.length, 'round')}`}
      failed="Couldn’t export the rounds"
      code="CH-11080"
      busyCode="CH-11480"
      surface={team ? 'rounds.team.export' : 'rounds.export'}
      icon={icon ? 'Export rounds' : undefined}
      variant="ghost"
      size="sm"
    />
  );
}
