'use client';

/**
 * Roster CSV export.
 *
 * This file used to also export a `RosterToolbar` component — a sort dropdown +
 * export button strip. `FairwayCoachRoster.tsx` replaced it with its own inline
 * `Segmented<SortField>` sort control and export button, and the component was
 * left behind with zero callers (verified 2026-08-15: the only import of this
 * module anywhere is `FairwayCoachRoster.tsx:17`, and it imports
 * `exportRosterCSV` alone).
 *
 * The filename is now wider than its contents. It is kept as-is deliberately:
 * renaming the module would churn the one live import for no behavioural gain,
 * and this is a deletion pass, not a refactor.
 */

/**
 * Escape a single CSV cell to RFC-4180 and defuse spreadsheet formula injection.
 *
 * - Doubles embedded double-quotes and wraps the value in quotes so commas,
 *   quotes and newlines inside a cell can never break the column layout.
 * - Prefixes a leading apostrophe to any value that begins with a formula
 *   trigger (= + - @, or a leading tab / carriage return) so Excel / Sheets
 *   treat it as text instead of executing it.
 */
function escapeCsvCell(value: string): string {
  let cell = value;
  if (/^[=+\-@\t\r]/.test(cell)) {
    cell = `'${cell}`;
  }
  return `"${cell.replace(/"/g, '""')}"`;
}

/**
 * Helper: export roster data as CSV
 */
export function exportRosterCSV(players: Array<{
  first_name: string | null;
  last_name: string | null;
  hometown: string | null;
  state: string | null;
  graduation_year: number | null;
  handicap: number | null;
  rounds_count?: number;
  avg_score?: number;
}>) {
  const headers = ['First Name', 'Last Name', 'Hometown', 'State', 'Grad Year', 'Handicap', 'Rounds', 'Avg Score'];
  const rows = players.map(p => [
    p.first_name || '',
    p.last_name || '',
    p.hometown || '',
    p.state || '',
    p.graduation_year?.toString() || '',
    p.handicap !== null ? p.handicap.toFixed(1) : '',
    p.rounds_count?.toString() || '0',
    p.avg_score && p.avg_score > 0 ? p.avg_score.toFixed(1) : '',
  ]);

  const csv = [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `roster_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
