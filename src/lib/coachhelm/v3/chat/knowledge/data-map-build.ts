/**
 * CoachHelm chat knowledge: builds the data map's text. Pure, so the generator (`scripts/coachhelm/gen-data-map.ts`) and
 * the drift test call the same function with the same three inputs and must get the same bytes.
 *
 *   schema      table → its columns, parsed from `src/lib/types/database.ts`
 *   allowlist   `TEAM_QUERY_TABLES`: the tables and columns of `query_team_data`
 *   tools       the read tools each surface is offered, from the registry
 *
 * It refuses (returns `problems`) instead of printing anything untrue: a table or column that is not in the schema, a
 * reader that is not in the registry, a registry reader the guide forgot, an allowlisted column missing from the schema.
 */
import {
  CONNECTIONS,
  FLAGGED_READERS,
  NOT_DATA_READERS,
  NOT_READABLE,
  NOT_RECORDED,
  PLAYER_NOT_AVAILABLE,
  QUERY_TABLE_NOTES,
  READER_GUIDE,
  THINGS,
  VALUE_LISTS,
} from './data-map.source';

export type Schema = Readonly<Record<string, readonly string[]>>;
export interface AllowRule {
  label: string;
  scope: 'team' | 'player';
  columns: readonly string[];
  flag?: string;
}
export interface DataMapInput {
  schema: Schema;
  allowlist: Readonly<Record<string, AllowRule>>;
  /** Names of the read tools offered to a coach (every coach surface together) and to a player. */
  tools: { coach: readonly string[]; player: readonly string[] };
}
export interface DataMaps {
  coach: string;
  player: string;
  problems: string[];
}

/** Table → columns, from the text of the generated `database.ts` (every `Row: { ... }` of the public schema). */
export function parseSchema(databaseTs: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const publicAt = databaseTs.indexOf('\n  public: {');
  const text = publicAt >= 0 ? databaseTs.slice(publicAt) : databaseTs;
  const re = /^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)^ {8}\}/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out[m[1]!] = [...m[2]!.matchAll(/^ {10}(\w+)\??:/gm)].map((c) => c[1]!);
  }
  return out;
}

/** table.column → the values its CHECK constraint allows, from the schema mirror's SQL (`supabase/schemas/golf/*.sql`). */
export function parseChecks(sql: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let table: string | null = null;
  for (const line of sql.split('\n')) {
    const t = /(?:CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE(?: ONLY)?) "public"\."(\w+)"/.exec(line);
    if (t) table = t[1]!;
    const c = /CHECK \(.*?"(\w+)" = ANY \(ARRAY\[(.*?)\]\)/.exec(line);
    if (table && c) out[`${table}.${c[1]}`] = [...c[2]!.matchAll(/'([^']*)'/g)].map((v) => v[1]!);
  }
  return out;
}

const list = (xs: readonly string[]): string => xs.join(', ');
const flagWords = (reader: string): string => (FLAGGED_READERS[reader] ? ` (${FLAGGED_READERS[reader]})` : '');

export function renderDataMaps(input: DataMapInput): DataMaps {
  const problems: string[] = [];
  const has = (table: string, column?: string) => !!input.schema[table] && (column === undefined || input.schema[table]!.includes(column));
  const coachTools = new Set([...input.tools.coach, ...Object.keys(FLAGGED_READERS)]);
  const playerTools = new Set(input.tools.player);

  for (const thing of THINGS) {
    for (const table of thing.backing) if (!has(table)) problems.push(`${thing.id}: table ${table} is not in database.ts`);
    for (const r of thing.readers) if (!coachTools.has(r)) problems.push(`${thing.id}: read ${r} is not offered to a coach`);
    for (const r of thing.player?.readers ?? []) if (!playerTools.has(r)) problems.push(`${thing.id}: read ${r} is not offered to a player`);
  }
  for (const g of READER_GUIDE) {
    if (!coachTools.has(g.reader)) problems.push(`reader guide: ${g.reader} is not offered to a coach`);
    if (g.player && !playerTools.has(g.reader)) problems.push(`reader guide: ${g.reader} is not offered to a player`);
  }
  const guided = new Set(READER_GUIDE.map((g) => g.reader));
  for (const name of input.tools.coach) if (!guided.has(name) && !NOT_DATA_READERS.includes(name)) problems.push(`reader guide: the registry offers ${name} and the map does not say what it answers`);
  for (const name of input.tools.player) if (!READER_GUIDE.some((g) => g.reader === name && g.player) && !NOT_DATA_READERS.includes(name)) problems.push(`reader guide: a player is offered ${name} and the player's map does not say what it answers`);
  for (const [table, rule] of Object.entries(input.allowlist)) {
    if (!has(table)) problems.push(`allowlist: table ${table} is not in database.ts`);
    for (const col of rule.columns) if (!has(table, col)) problems.push(`allowlist: ${table}.${col} is not in database.ts`);
    if (!(table in QUERY_TABLE_NOTES)) problems.push(`allowlist: ${table} has no line in QUERY_TABLE_NOTES`);
  }
  for (const table of Object.keys(QUERY_TABLE_NOTES)) if (!input.allowlist[table]) problems.push(`QUERY_TABLE_NOTES: ${table} is not in the allowlist`);
  for (const v of VALUE_LISTS) if (!has(v.table, v.column)) problems.push(`values: ${v.table}.${v.column} is not in database.ts`);

  const allowed = (table: string) => !!input.allowlist[table];
  // The reads come first: a thing's allowlisted tables are named once, in the query section, with their columns.
  const thingLine = (name: string, means: string, readers: readonly string[]) => `- ${name}. ${means}${readers.length ? ` Read with ${list(readers.map((r) => `${r}${flagWords(r)}`))}.` : ''}`;
  // A value list is printed where the model can meet the value: on an allowlisted column, or (round kind and status) in every round a read returns.
  const valueLine = (v: (typeof VALUE_LISTS)[number], withTable: boolean) => `- ${withTable ? `${v.table}.` : ''}${v.column}: ${Object.entries(v.values).map(([k, m]) => `${k} (${m})`).join('; ')}.`;
  const printable = VALUE_LISTS.filter((v) => allowed(v.table) && input.allowlist[v.table]!.columns.includes(v.column));

  const coach = [
    '# Where things are in this team\'s data',
    'This is everything you can reach. Use a read named here. If something is not here, it is not recorded or not yours to read: say so, and do not guess.',
    'The names of reads, tables and columns below are for tool calls only. Never write one in an answer, and never write a stored value such as a code or an id: say the plain words beside it ("the qualifier board", "a coach\'s pick", "did not come").',
    `How it connects: ${CONNECTIONS}`,
    '## What exists',
    ...THINGS.map((t) => thingLine(t.name, t.means, t.readers)),
    '## Which read answers which question',
    ...READER_GUIDE.map((g) => `- ${g.reader}${flagWords(g.reader)}: ${g.use}`),
    '## query_team_data: the only tables and columns it reads',
    'It is always limited to this team and its roster. A table or column not listed is refused. The words in brackets after a table are what to call it in an answer.',
    ...Object.entries(input.allowlist).map(([table, rule]) => `- ${table} (${rule.label}; by ${rule.scope}${rule.flag ? '; only when tournaments are turned on' : ''}): ${QUERY_TABLE_NOTES[table as keyof typeof QUERY_TABLE_NOTES] ?? ''} Columns: ${list(rule.columns)}.`),
    '## What the stored values mean (say the words in brackets, never the value)',
    ...printable.map((v) => valueLine(v, true)),
    '## Not recorded',
    ...NOT_RECORDED.map((l) => `- ${l}`),
    '## Recorded, but not yours to read',
    ...NOT_READABLE.map((l) => `- ${l}`),
  ].join('\n');

  const player = [
    '# What you can read about this player',
    'Every read is of this player\'s own data. If something is not here, it is not recorded or not theirs to see through you: say so, and do not guess.',
    'The names of reads below are for tool calls only. Never write one in an answer.',
    '## What exists',
    ...THINGS.filter((t) => t.player).map((t) => thingLine(t.player!.name ?? t.name, t.player!.means, t.player!.readers)),
    '## Which read answers which question',
    ...READER_GUIDE.filter((g) => g.player).map((g) => `- ${g.reader}: ${g.player}`),
    '## What the stored values mean (say the words in brackets, never the value)',
    ...VALUE_LISTS.filter((v) => v.player).map((v) => valueLine(v, false)),
    '## Not recorded',
    ...NOT_RECORDED.map((l) => `- ${l}`),
    '## Not available here',
    ...PLAYER_NOT_AVAILABLE.map((l) => `- ${l}`),
  ].join('\n');

  return { coach, player, problems };
}

/** The generated module's source. */
export function renderDataMapModule(maps: Pick<DataMaps, 'coach' | 'player'>): string {
  return `// GENERATED by scripts/coachhelm/gen-data-map.ts from src/lib/types/database.ts, team-query-allowlist.ts, registry.ts and data-map.source.ts.
// Do not edit by hand. Regenerate: npm run coachhelm:data-map
export const COACH_DATA_MAP = ${JSON.stringify(maps.coach)};

export const PLAYER_DATA_MAP = ${JSON.stringify(maps.player)};
`;
}
