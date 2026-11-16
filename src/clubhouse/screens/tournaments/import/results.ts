/**
 * Results import (launch readiness F-01), step two: sheets of cells to results. Pure.
 *
 * Every results export names its columns, but no two name them alike, and Golf Genius's own exports differ by template.
 * So nothing here depends on one layout: each sheet's header row is found by the words it holds, each column is mapped
 * by what its heading says (and, for bare numbers, by the size of the values under it: 1 to 18 over holes, 2 to 6 over
 * round scores), and the coach can change any column in the check step (`ChColumnMap`).
 *
 * Shapes it understands, alone or mixed across a workbook's sheets:
 *  - hole by hole, one row per player per round (a Round column, a "Round 2" line above a block, or the sheet's name);
 *  - hole by hole for one round, with no round anywhere (the check step asks which round);
 *  - a leaderboard of round scores (R1, R2, R3, Total, Pos), players or teams;
 *  - a team leaderboard (a team column and round scores, no player column).
 * WD, DQ, NC and DNF in a score cell mark the player's status for that round.
 */

import type { ChResultsSheet } from './sheets';

export const MAX_HOLES = 18;
export const MAX_ROUNDS = 6;

export type ChColumnKey = 'name' | 'first' | 'last' | 'team' | 'round' | 'pos' | 'total' | 'status';

/** Where each value is in a sheet: column indexes, or null where the sheet has none. */
export interface ChColumnMap {
  name: number | null;
  first: number | null;
  last: number | null;
  team: number | null;
  round: number | null;
  pos: number | null;
  total: number | null;
  status: number | null;
  /** Hole 1 to 18. */
  holes: Array<number | null>;
  /** Round 1 to 6 scores. */
  rounds: Array<number | null>;
}

export type ChSheetKind = 'holes' | 'rounds' | 'teams' | 'none';

export interface ChSheetLayout {
  sheet: number;
  /** The header row (0 based); the rows under it are read. */
  header: number;
  columns: ChColumnMap;
  kind: ChSheetKind;
  /** The round the sheet's name gives ("Round 2", "R2"), for rows that name none. */
  sheetRound: number | null;
}

export type ChResultStatus = 'ok' | 'wd' | 'dq';

export interface ChPlace {
  n: number;
  tied: boolean;
}

/** One player's round as the file has it. */
export interface ChFileRound {
  /** Strokes on holes 1 to n; null where the file has no holes for the round. */
  holes: Array<number | null> | null;
  total: number | null;
  status: ChResultStatus;
}

export interface ChFilePlayer {
  /** Stable within one read: the name and team as normalised. */
  key: string;
  name: string;
  team: string | null;
  pos: ChPlace | null;
  /** Keyed by round number; 0 is "the round the coach picks" (holes for one round with no round named). */
  rounds: Record<number, ChFileRound>;
  /** The file's event total, where it gives one (a check on the rounds, never trusted over them). */
  total: number | null;
}

export interface ChFileTeam {
  key: string;
  name: string;
  pos: ChPlace | null;
  /** Round scores by round number (0: the picked round). */
  rounds: Record<number, number | null>;
  total: number | null;
}

export interface ChResultsRead {
  layouts: ChSheetLayout[];
  players: ChFilePlayer[];
  teams: ChFileTeam[];
  /** The round numbers the file names, sorted; 0 when holes came with no round. */
  rounds: number[];
  /** The longest hole run read (9 or 18), or null with no holes. */
  holes: 9 | 18 | null;
  /** The file's par row, where it has one: hole pars to check against the course. */
  pars: Array<number | null> | null;
  /** Things worth a look, in the coach's words. */
  warnings: string[];
}

// ── Headers ──────────────────────────────────────────────────────────────────────────────────────────────────

export const normHeader = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[#.:_\-/()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const HEAD: Record<Exclude<ChColumnKey, never>, readonly string[]> = {
  name: ['player', 'player name', 'players', 'name', 'golfer', 'competitor', 'participant', 'athlete', 'individual', 'student athlete', 'full name'],
  first: ['first', 'first name', 'firstname', 'fname', 'given name'],
  last: ['last', 'last name', 'lastname', 'lname', 'surname', 'family name'],
  team: ['team', 'team name', 'school', 'college', 'university', 'institution', 'affiliation', 'club', 'program'],
  round: ['round', 'rd', 'rnd', 'round number', 'round no', 'rd no', 'round num'],
  pos: ['pos', 'position', 'place', 'plc', 'rank', 'finish', 'standing', 'pl'],
  total: ['total', 'tot', 'gross', 'score', 'total score', 'gross score', 'strokes', 'total gross', 'total strokes', 'grs'],
  status: ['status', 'note', 'notes', 'wd dq'],
};

/** Hole headings: "1", "H1", "Hole 1", "Hole #1". */
function holeOf(h: string): number | null {
  const m = /^(?:h|hole|hl)?\s?(\d{1,2})$/.exec(h);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= MAX_HOLES ? n : null;
}

/** Round headings: "R1", "Rd 1", "Round 1", "Rnd1", "1st Round"; a bare number is decided by its values. */
function roundOf(h: string): number | null {
  const m = /^(?:r|rd|rnd|round)\s?(\d)$/.exec(h) ?? /^(\d)(?:st|nd|rd|th) (?:round|rd)$/.exec(h);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= MAX_ROUNDS ? n : null;
}

const emptyMap = (): ChColumnMap => ({
  name: null,
  first: null,
  last: null,
  team: null,
  round: null,
  pos: null,
  total: null,
  status: null,
  holes: Array.from({ length: MAX_HOLES }, () => null),
  rounds: Array.from({ length: MAX_ROUNDS }, () => null),
});

/** The numbers in a column under the header, for telling holes (1 to 15) from round scores (25 to 150). */
function columnNumbers(rows: readonly string[][], header: number, col: number): number[] {
  const out: number[] = [];
  for (let r = header + 1; r < Math.min(rows.length, header + 60); r += 1) {
    const n = Number((rows[r]?.[col] ?? '').replace(/[^\d.]/g, ''));
    if ((rows[r]?.[col] ?? '').trim() && Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

const median = (xs: readonly number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** The columns one header row names. */
export function mapColumns(rows: readonly string[][], header: number): ChColumnMap {
  const map = emptyMap();
  const cells = (rows[header] ?? []).map(normHeader);
  const bare: Array<{ col: number; n: number }> = [];
  cells.forEach((h, col) => {
    if (!h) return;
    for (const key of Object.keys(HEAD) as ChColumnKey[]) {
      if (map[key] == null && HEAD[key].includes(h)) {
        map[key] = col;
        return;
      }
    }
    const r = roundOf(h);
    if (r != null && map.rounds[r - 1] == null) {
      map.rounds[r - 1] = col;
      return;
    }
    if (/^\d{1,2}$/.test(h)) {
      bare.push({ col, n: Number(h) });
      return;
    }
    const hole = holeOf(h);
    if (hole != null && map.holes[hole - 1] == null) map.holes[hole - 1] = col;
  });
  // Bare numbers: holes when there are nine or more of them or the values are hole sized, else round scores.
  if (bare.length) {
    const values = bare.flatMap((b) => columnNumbers(rows, header, b.col));
    const mid = median(values);
    const asHoles = bare.length >= 9 || (mid != null && mid <= 15);
    for (const b of bare) {
      if (asHoles && b.n >= 1 && b.n <= MAX_HOLES && map.holes[b.n - 1] == null) map.holes[b.n - 1] = b.col;
      else if (!asHoles && b.n >= 1 && b.n <= MAX_ROUNDS && map.rounds[b.n - 1] == null) map.rounds[b.n - 1] = b.col;
    }
  }
  return map;
}

export function kindOf(map: ChColumnMap): ChSheetKind {
  const holes = map.holes.filter((c) => c != null).length;
  const person = map.name != null || map.last != null || map.first != null;
  if (holes >= 9 && (person || map.team != null)) return 'holes';
  if (person && (map.rounds.some((c) => c != null) || map.total != null)) return 'rounds';
  if (!person && map.team != null && (map.rounds.some((c) => c != null) || map.total != null)) return 'teams';
  return 'none';
}

const score = (map: ChColumnMap) => {
  const k = kindOf(map);
  if (k === 'none') return 0;
  const named = (Object.keys(HEAD) as ChColumnKey[]).filter((key) => map[key] != null).length;
  return named * 3 + map.holes.filter((c) => c != null).length + map.rounds.filter((c) => c != null).length * 2;
};

/** The sheet's round from its name: "Round 2", "R2", "Rd 2 Scores". */
export function roundFromName(name: string): number | null {
  const m = /\b(?:round|rd|rnd|r)\s?(\d)\b/i.exec(name);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= MAX_ROUNDS ? n : null;
}

/** The header row of a sheet: the row in its first 40 whose words map the most columns. */
export function findLayout(sheet: ChResultsSheet, index: number): ChSheetLayout {
  let best: ChSheetLayout = { sheet: index, header: 0, columns: emptyMap(), kind: 'none', sheetRound: roundFromName(sheet.name) };
  let bestScore = 0;
  for (let r = 0; r < Math.min(sheet.rows.length, 40); r += 1) {
    const columns = mapColumns(sheet.rows, r);
    const s = score(columns);
    if (s > bestScore) {
      bestScore = s;
      best = { ...best, header: r, columns, kind: kindOf(columns) };
    }
  }
  return best;
}

// ── Cells ────────────────────────────────────────────────────────────────────────────────────────────────────

const STATUS_WORDS: Record<string, ChResultStatus> = {
  wd: 'wd',
  withdrew: 'wd',
  withdrawn: 'wd',
  rtd: 'wd',
  ret: 'wd',
  dnf: 'wd',
  dns: 'wd',
  dq: 'dq',
  dsq: 'dq',
  disq: 'dq',
  disqualified: 'dq',
};

/** WD, DQ and their spellings in a cell ("W/D", "DQ'd", "RTD"); null for anything else. */
export function statusOf(cell: string): ChResultStatus | null {
  const w = cell.toLowerCase().replace(/[^a-z]/g, '');
  return STATUS_WORDS[w] ?? (w === 'dqd' ? 'dq' : null);
}

/** A whole number in a cell ("72", "72.0", "(72)"); null for anything else. */
export function intOf(cell: string | undefined): number | null {
  const s = (cell ?? '').replace(/[()*\s]/g, '');
  if (!/^\d{1,3}(?:\.0+)?$/.test(s)) return null;
  return Number(s);
}

/** "T3", "3", "3T", "=3", "1st"; null for anything else. */
export function placeOf(cell: string | undefined): ChPlace | null {
  const s = (cell ?? '').trim().toUpperCase();
  const m = /^(T|=)?\s?(\d{1,3})(?:ST|ND|RD|TH)?\s?(T)?$/.exec(s);
  if (!m) return null;
  return { n: Number(m[2]), tied: !!(m[1] || m[3]) };
}

/** Each all-capitals or all-lowercase word in title case ("SMITH" and "smith" to "Smith"); "McKenzie" stays. */
const title = (s: string) =>
  s
    .split(' ')
    .map((w) => (w === w.toUpperCase() || w === w.toLowerCase() ? w.toLowerCase().replace(/(^|['’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : w))
    .join(' ');

/**
 * A person's name as the file writes it, in "First Last" order: "Smith, John" turns round, "(a)" and "*" markers go,
 * and a team in brackets after the name ("John Smith (Demo University)") is split off.
 */
export function personName(raw: string): { name: string; team: string | null } {
  let s = raw.replace(/\s+/g, ' ').trim();
  let team: string | null = null;
  const bracket = /^(.*?)\s*[([]([^)\]]{3,})[)\]]\s*$/.exec(s);
  if (bracket && !/^a$/i.test(bracket[2]!.trim())) {
    s = bracket[1]!.trim();
    team = bracket[2]!.trim();
  }
  s = s.replace(/\s*\((?:a|am)\)\s*/gi, ' ').replace(/[*\u2020\u2021]+/g, '').trim();
  const comma = /^([^,]+),\s*(.+)$/.exec(s);
  if (comma) s = `${comma[2]} ${comma[1]}`;
  return { name: title(s.replace(/\s+/g, ' ').trim()), team };
}

export const keyOf = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SKIP_ROW = /^(par|yardage|yards|yds|handicap|hdcp|hcp|hole|total|totals|team total|si|stroke index|tee|tees|course)$/;

// ── Reading ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Every sheet's layout as found. */
export function findLayouts(sheets: readonly ChResultsSheet[]): ChSheetLayout[] {
  return sheets.map((s, i) => findLayout(s, i));
}

/**
 * Results from sheets and their layouts (the found ones, or the coach's after a column change). Rows that are a par or
 * yardage line, a repeated header, or blank are passed over; a line holding only "Round N" sets the round for the rows
 * under it.
 */
export function readResults(sheets: readonly ChResultsSheet[], layouts: readonly ChSheetLayout[] = findLayouts(sheets)): ChResultsRead {
  const players = new Map<string, ChFilePlayer>();
  const teams = new Map<string, ChFileTeam>();
  const warnings: string[] = [];
  let pars: Array<number | null> | null = null;
  let longest = 0;
  const roundsSeen = new Set<number>();
  const badHoles: string[] = [];

  for (const layout of layouts) {
    if (layout.kind === 'none') continue;
    const sheet = sheets[layout.sheet];
    if (!sheet) continue;
    const c = layout.columns;
    const header = sheet.rows[layout.header] ?? [];
    const holeCols = c.holes.map((col, i) => ({ col, n: i + 1 })).filter((h): h is { col: number; n: number } => h.col != null);
    const lastHole = Math.max(0, ...holeCols.map((h) => h.n));
    const size = lastHole > 9 ? 18 : lastHole > 0 ? 9 : 0;
    // A "Round 1" line just above the header starts the first block.
    let blockRound: number | null = null;
    for (let r = layout.header - 1; r >= Math.max(0, layout.header - 2); r -= 1) {
      const filled = (sheet.rows[r] ?? []).filter((x) => x !== '');
      const named = filled.length && filled.length <= 2 ? roundFromName(filled.join(' ')) : null;
      if (named != null) {
        blockRound = named;
        break;
      }
    }
    for (let r = layout.header + 1; r < sheet.rows.length; r += 1) {
      const row = sheet.rows[r]!;
      const filled = row.filter((x) => x !== '');
      if (!filled.length) continue;
      if (row.every((x, i) => x === (header[i] ?? ''))) continue;
      // A "Round 2" line over a block of rows.
      if (filled.length <= 2) {
        const named = roundFromName(filled.join(' '));
        if (named != null) {
          blockRound = named;
          continue;
        }
      }
      const lead = normHeader(row[c.name ?? c.last ?? c.team ?? 0] ?? '');
      if (SKIP_ROW.test(lead)) {
        if (lead === 'par' && size) pars = Array.from({ length: size }, (_, i) => intOf(row[c.holes[i] ?? -1]));
        continue;
      }

      const round = c.round != null ? (intOf(row[c.round]) ?? roundFromName(row[c.round] ?? '')) : (blockRound ?? layout.sheetRound);
      const roundKey = round != null && round >= 1 && round <= MAX_ROUNDS ? round : 0;
      const statusCell = c.status != null ? statusOf(row[c.status] ?? '') : null;
      const pos = c.pos != null ? placeOf(row[c.pos]) : null;
      const teamCell = c.team != null ? (row[c.team] ?? '').trim() : '';

      if (layout.kind === 'teams') {
        if (!teamCell) continue;
        const key = keyOf(teamCell);
        const t = teams.get(key) ?? { key, name: teamCell, pos: null, rounds: {}, total: null };
        c.rounds.forEach((col, i) => {
          if (col == null) return;
          const v = intOf(row[col]);
          if (v != null) {
            t.rounds[i + 1] = v;
            roundsSeen.add(i + 1);
          }
        });
        if (c.round != null && c.total != null && roundKey) {
          t.rounds[roundKey] = intOf(row[c.total]);
          roundsSeen.add(roundKey);
        } else if (c.total != null) t.total = intOf(row[c.total]) ?? t.total;
        t.pos = pos ?? t.pos;
        teams.set(key, t);
        continue;
      }

      const rawName = c.name != null ? (row[c.name] ?? '') : [row[c.first ?? -1] ?? '', row[c.last ?? -1] ?? ''].join(' ');
      if (!rawName.trim() || /^\d+$/.test(rawName.trim())) continue;
      const person = personName(rawName);
      if (!person.name) continue;
      const team = teamCell || person.team || null;
      const key = `${keyOf(person.name)}|${keyOf(team ?? '')}`;
      const p = players.get(key) ?? { key, name: person.name, team, pos: null, rounds: {}, total: null };
      p.pos = pos ?? p.pos;

      if (layout.kind === 'holes') {
        let rowStatus: ChResultStatus = statusCell ?? 'ok';
        const holes = Array.from({ length: size }, (_, i) => {
          const col = c.holes[i];
          if (col == null) return null;
          const cell = row[col] ?? '';
          const st = statusOf(cell);
          if (st) rowStatus = st;
          const v = intOf(cell);
          if (v != null && (v < 1 || v > 15)) {
            badHoles.push(`${person.name} hole ${i + 1}`);
            return null;
          }
          return v;
        });
        const totalCell = c.total != null ? (row[c.total] ?? '') : '';
        const st = statusOf(totalCell);
        if (st) rowStatus = st;
        if (holes.every((h) => h == null) && rowStatus === 'ok' && intOf(totalCell) == null) continue;
        longest = Math.max(longest, size);
        p.rounds[roundKey] = { holes, total: intOf(totalCell), status: rowStatus };
        roundsSeen.add(roundKey);
      } else {
        // Round scores: each round column, or one Round column with a Total.
        let any = false;
        if (c.round != null && c.total != null) {
          const cell = row[c.total] ?? '';
          const st = statusOf(cell) ?? statusCell;
          const v = intOf(cell);
          if (v != null || st) {
            p.rounds[roundKey] = { holes: null, total: v, status: st ?? 'ok' };
            roundsSeen.add(roundKey);
            any = true;
          }
        } else {
          c.rounds.forEach((col, i) => {
            if (col == null) return;
            const cell = row[col] ?? '';
            const st = statusOf(cell);
            const v = intOf(cell);
            if (v == null && !st) return;
            const prev = p.rounds[i + 1];
            p.rounds[i + 1] = { holes: prev?.holes ?? null, total: v ?? prev?.total ?? null, status: st ?? prev?.status ?? 'ok' };
            roundsSeen.add(i + 1);
            any = true;
          });
          if (c.total != null) {
            const cell = row[c.total] ?? '';
            p.total = intOf(cell) ?? p.total;
            const st = statusOf(cell) ?? statusCell;
            // A one-round leaderboard: the total is the round (the check step asks which).
            if (!c.rounds.some((x) => x != null) && (p.total != null || st)) {
              p.rounds[0] = { holes: null, total: p.total, status: st ?? 'ok' };
              roundsSeen.add(0);
              any = true;
            } else if (st) {
              // "WD" in the total: the last round they have is where they withdrew.
              const last = Object.keys(p.rounds).map(Number).sort((a, b) => b - a)[0];
              if (last != null) p.rounds[last] = { ...p.rounds[last]!, status: st };
            }
          }
        }
        if (!any && p.total == null) continue;
      }
      players.set(key, p);
    }
  }

  // Holes and a written total that disagree: the holes are the card; say so.
  const mismatched: string[] = [];
  for (const p of players.values()) {
    for (const [n, r] of Object.entries(p.rounds)) {
      if (!r.holes || r.total == null || r.holes.some((h) => h == null)) continue;
      const sum = r.holes.reduce<number>((a, b) => a + (b ?? 0), 0);
      if (sum !== r.total) mismatched.push(`${p.name}${Number(n) ? ` in round ${n}` : ''}`);
    }
  }
  if (mismatched.length) warnings.push(`The holes don’t add up to the total written for ${listOf(mismatched)}. The holes are used.`);
  const oneBad = badHoles.length === 1;
  if (badHoles.length) warnings.push(`${listOf(badHoles)} ${oneBad ? 'isn’t a hole score' : 'aren’t hole scores'}, so ${oneBad ? 'it is' : 'they are'} left empty.`);

  return {
    layouts: [...layouts],
    players: [...players.values()],
    teams: [...teams.values()],
    rounds: [...roundsSeen].sort((a, b) => a - b),
    holes: longest === 18 ? 18 : longest === 9 ? 9 : null,
    pars,
    warnings,
  };
}

/** "A, B and 3 more". */
export function listOf(xs: readonly string[], max = 3): string {
  if (xs.length <= 1) return xs[0] ?? '';
  if (xs.length <= max) return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
  return `${xs.slice(0, max).join(', ')} and ${xs.length - max} more`;
}

/** One sheet's layout with one column moved (the check step's column editor). */
export function withColumn(layout: ChSheetLayout, field: ChColumnKey | { hole: number } | { round: number }, col: number | null): ChSheetLayout {
  const columns: ChColumnMap = { ...layout.columns, holes: [...layout.columns.holes], rounds: [...layout.columns.rounds] };
  if (typeof field === 'string') columns[field] = col;
  else if ('hole' in field) columns.holes[field.hole - 1] = col;
  else columns.rounds[field.round - 1] = col;
  return { ...layout, columns, kind: kindOf(columns) };
}

/**
 * One sheet's layout with a run of hole or round columns moved together: hole `first` at `col`, the next at `col + 1`
 * and so on for `count` (the column editor's "Hole 1 is column D" and "Round 1 is column E"). Null clears the run.
 */
export function withRun(layout: ChSheetLayout, kind: 'hole' | 'round', first: number, col: number | null, count: number): ChSheetLayout {
  let out = layout;
  for (let i = 0; i < count; i += 1) out = withColumn(out, kind === 'hole' ? { hole: first + i } : { round: first + i }, col == null ? null : col + i);
  return out;
}

/** "A", "B", … "AA": a spreadsheet's name for a column. */
export function columnName(col: number): string {
  let n = col + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
