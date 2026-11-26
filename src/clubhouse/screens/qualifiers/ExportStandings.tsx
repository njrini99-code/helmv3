'use client';

import { isoDay } from '../../lib/dates';
import { ExportButton } from '../../ui/ExportButton';
import { plural, type ChQBoard } from './model';
import { standingsCsv } from './export';

/**
 * Launch readiness F-02: Export on a qualifier (the coach's): the standings as the board orders them, every round's score,
 * as a spreadsheet. Built from the board on screen, so it needs no read; CH-09080 when the browser refuses the file.
 */
export function ExportStandings({
  name,
  board,
  numRounds,
  label = 'Export',
  variant = 'ghost',
  size = 'sm',
}: {
  name: string;
  board: Pick<ChQBoard, 'rows' | 'unscored'>;
  numRounds: number;
  label?: string;
  variant?: 'ghost' | 'secondary';
  size?: 'sm' | 'md';
}) {
  return (
    <ExportButton data-ctl="CTL-P009-008"
      file={() => standingsCsv({ name, board, numRounds, day: isoDay(new Date()) })}
      done={(f) => `Standings exported · ${plural(f.rows.length, 'player')}`}
      failed="Couldn’t export the standings"
      code="CH-09080"
      surface="qualifiers.export"
      label={label}
      variant={variant}
      size={size}
    />
  );
}
