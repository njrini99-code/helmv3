import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { roundExclusionReason } from '@/lib/golf/round-countable';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import type { CoachChatContext } from '../../context';
import type { ChatSurface, PlayerChatContext } from '../../engine/tool';
import { toolsFor } from '../../registry';
import { TEAM_QUERY_TABLES } from '../../team-query-allowlist';
import { dataMapBlock } from '../data-map';
import { parseChecks, parseSchema, renderDataMapModule, renderDataMaps, type AllowRule, type DataMapInput } from '../data-map-build';
import { COACH_DATA_MAP, PLAYER_DATA_MAP } from '../data-map.generated';
import { ABSENT_COLUMNS, FLAGGED_READERS, NOT_DATA_READERS, READER_GUIDE, THINGS, VALUE_LISTS } from '../data-map.source';

vi.mock('server-only', () => ({}));
const flags = vi.hoisted(() => ({ tournaments: false }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (name: string) => name === 'golf_tournaments_v1' && flags.tournaments }));

const root = process.cwd();
const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };
const player: PlayerChatContext = { ...coach, player_id: 'p1' };
const reads = (surface: ChatSurface, who: CoachChatContext | PlayerChatContext) => toolsFor(surface, who).filter((t) => t.kind === 'read').map((t) => t.name);
const schema = parseSchema(readFileSync(resolve(root, 'src/lib/types/database.ts'), 'utf8'));
const allowlist = TEAM_QUERY_TABLES as unknown as Record<string, AllowRule>;
const input = (): DataMapInput => ({ schema, allowlist, tools: { coach: [...new Set([...reads('ask', coach), ...reads('quick_chat', coach), ...reads('practice_helper', coach)])], player: reads('player', player) } });
const schemaDir = resolve(root, 'supabase/schemas/golf');
const checks = parseChecks(readdirSync(schemaDir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(resolve(schemaDir, f), 'utf8')).join('\n'));
const tokens = (text: string) => Math.round(text.length / 4);

describe('the data map: generated, and true', () => {
  it('reads the schema: a real table with its columns', () => {
    expect(Object.keys(schema).length).toBeGreaterThan(150);
    expect(schema.golf_rounds).toContain('round_date');
    expect(schema.golf_rounds).toContain('strokes_gained_putting');
    expect(schema.golf_holes).toEqual(expect.arrayContaining(['par', 'score', 'putts', 'fairway_hit', 'gir', 'penalty_strokes']));
  });

  it('is in sync with database.ts, the allowlist, the registry and the meanings (run: npm run coachhelm:data-map)', () => {
    const maps = renderDataMaps(input());
    expect(maps.problems).toEqual([]);
    expect(COACH_DATA_MAP).toBe(maps.coach);
    expect(PLAYER_DATA_MAP).toBe(maps.player);
    expect(readFileSync(resolve(root, 'src/lib/coachhelm/v3/chat/knowledge/data-map.generated.ts'), 'utf8')).toBe(renderDataMapModule(maps));
  });

  it('is the same bytes with the tournaments flag on or off, so the cached prefix does not move with a flag', () => {
    const off = renderDataMaps(input());
    flags.tournaments = true;
    const on = renderDataMaps(input());
    flags.tournaments = false;
    expect(on.problems).toEqual([]);
    expect(on.coach).toBe(off.coach);
    expect(on.player).toBe(off.player);
    for (const name of Object.keys(FLAGGED_READERS)) expect(off.coach).toContain(`${name} (${FLAGGED_READERS[name]})`);
  });

  it('refuses to render when a table, a column or a read it names is gone', () => {
    const base = input();
    const { golf_holes: _gone, ...withoutHoles } = base.schema;
    expect(renderDataMaps({ ...base, schema: withoutHoles }).problems).toContain('holes: table golf_holes is not in database.ts');
    const renamed = { ...base.schema, golf_rounds: base.schema.golf_rounds!.filter((c) => c !== 'round_type') };
    expect(renderDataMaps({ ...base, schema: renamed }).problems).toEqual(expect.arrayContaining(['allowlist: golf_rounds.round_type is not in database.ts', 'values: golf_rounds.round_type is not in database.ts']));
    expect(renderDataMaps({ ...base, tools: { ...base.tools, coach: base.tools.coach.filter((n) => n !== 'get_qualifiers') } }).problems.join('\n')).toMatch(/read get_qualifiers is not offered to a coach/);
    expect(renderDataMaps({ ...base, tools: { ...base.tools, coach: [...base.tools.coach, 'get_something_new'] } }).problems).toContain('reader guide: the registry offers get_something_new and the map does not say what it answers');
    expect(renderDataMaps({ ...base, allowlist: { ...base.allowlist, golf_shots: { label: 'shots', scope: 'player', columns: ['id'] } } }).problems).toContain('allowlist: golf_shots has no line in QUERY_TABLE_NOTES');
  });

  it('every status value it explains is one the schema or the code allows', () => {
    for (const v of VALUE_LISTS) {
      expect(schema[v.table], `${v.table}`).toContain(v.column);
      if (v.check !== 'schema') continue;
      const allowed = checks[`${v.table}.${v.column}`];
      expect(allowed, `${v.table}.${v.column} has a CHECK list in supabase/schemas/golf`).toBeTruthy();
      for (const value of Object.keys(v.values)) expect(allowed, `${v.table}.${v.column} = ${value}`).toContain(value);
    }
    // The two lists the schema does not constrain are fixed by code.
    const kinds = VALUE_LISTS.find((v) => v.table === 'golf_rounds' && v.column === 'round_type')!;
    for (const kind of Object.keys(kinds.values)) expect(roundTypeFromDb(kind)).toBe(kind);
    const round = { holes_played: 18, total_score: 74, front_nine: 37, back_nine: 37, total_putts: 31 };
    expect(roundExclusionReason({ ...round, status: 'completed' })).toBeNull();
    expect(roundExclusionReason({ ...round, status: 'in_progress' })).toBe('not_completed');
    expect(readFileSync(resolve(schemaDir, '10_tables.sql'), 'utf8')).toMatch(/"status" "text" DEFAULT 'in_progress'::"text"/);
  });

  it('what it calls not recorded has no column on any golf table', () => {
    const golfColumns = Object.entries(schema).filter(([t]) => t.startsWith('golf_')).flatMap(([t, cols]) => cols.map((c) => `${t}.${c}`));
    for (const absent of ABSENT_COLUMNS) expect(golfColumns.filter((c) => c.endsWith(`.${absent}`))).toEqual([]);
    // A shot's club is one of three kinds, as the map says.
    expect(checks['golf_shots.club_type']).toEqual(['driver', 'non_driver', 'putter']);
    expect(schema.golf_rounds).toContain('weather_conditions');
  });
});

describe('the data map: bounded by what the agent can reach', () => {
  const allowTables = Object.keys(allowlist);

  it('names no table outside the query_team_data allowlist', () => {
    const named = [...new Set(COACH_DATA_MAP.match(/\b(?:golf|baseball|helm_lifting)_[a-z0-9_]+\b/g) ?? [])];
    expect(named.filter((t) => !allowTables.includes(t))).toEqual([]);
    expect(named.sort()).toEqual([...allowTables].sort());
    expect(COACH_DATA_MAP).not.toMatch(/golf_players|golf_messages|golf_recruits|golf_documents|golf_player_classes|auth\./);
  });

  it('lists for each table exactly the allowlisted columns: none added, none dropped', () => {
    for (const [table, rule] of Object.entries(allowlist)) {
      const line = COACH_DATA_MAP.split('\n').find((l) => l.startsWith(`- ${table} (`));
      expect(line, table).toBeTruthy();
      const columns = line!.slice(line!.lastIndexOf('Columns: ') + 'Columns: '.length).replace(/\.$/, '').split(', ');
      expect(columns).toEqual([...rule.columns]);
    }
  });

  it('names only reads the coach is offered, and says what every data read answers', () => {
    const offered = new Set([...input().tools.coach, ...Object.keys(FLAGGED_READERS)]);
    const named = [...new Set(COACH_DATA_MAP.match(/\b(?:get|query|find|summarise|show|draft|write|create|save|remove)_[a-z_]+\b/g) ?? [])];
    expect(named.filter((n) => !offered.has(n) && n !== 'summarise_data')).toEqual([]);
    for (const name of input().tools.coach) if (!NOT_DATA_READERS.includes(name)) expect(READER_GUIDE.map((g) => g.reader), name).toContain(name);
    for (const t of THINGS) expect(t.readers.length, t.id).toBeGreaterThan(0);
  });
});

describe('the player\'s data map', () => {
  const mine = new Set(reads('player', player));

  it('names no table, no column list and no reader a player is not offered', () => {
    expect(PLAYER_DATA_MAP).not.toMatch(/\b(?:golf|baseball|helm_lifting)_[a-z0-9_]+\b/);
    expect(PLAYER_DATA_MAP).not.toMatch(/Columns:|query_team_data/);
    const named = [...new Set(PLAYER_DATA_MAP.match(/\b(?:get|query|find|summarise|show|draft|write|create|save|remove)_[a-z_]+\b/g) ?? [])];
    expect(named.filter((n) => !mine.has(n))).toEqual([]);
    for (const coachOnly of ['get_team_stats', 'get_rounds', 'get_qualifiers', 'get_tournaments', 'get_practice']) expect(PLAYER_DATA_MAP).not.toContain(coachOnly);
  });

  it('offers nothing about the team or a teammate: every mention of them is a refusal', () => {
    const lines = PLAYER_DATA_MAP.split('\n');
    const about = lines.filter((l) => /teammate|team average|ranking|roster|lineup|qualifier board|tasks|documents|messages/i.test(l));
    const refusals = lines.slice(lines.indexOf('## Not available here') + 1);
    for (const l of about) expect(refusals, l).toContain(l);
    expect(PLAYER_DATA_MAP).not.toMatch(/players compared|where a player trails the team|every player ranked|each player's reply|who is in class/);
    expect(PLAYER_DATA_MAP).toMatch(/you can read only this player's own data/);
  });

  it('says what each of the player\'s data reads answers', () => {
    for (const name of mine) if (!NOT_DATA_READERS.includes(name)) expect(PLAYER_DATA_MAP, name).toContain(`- ${name}: `);
  });
});

describe('the data map block', () => {
  it('is the same bytes on every call, one text for every coach surface, and holds no date, count or team name', () => {
    expect(dataMapBlock('ask')).toBe(COACH_DATA_MAP);
    expect(dataMapBlock('quick_chat')).toBe(dataMapBlock('ask'));
    expect(dataMapBlock('practice_helper')).toBe(dataMapBlock('ask'));
    expect(dataMapBlock('player')).toBe(PLAYER_DATA_MAP);
    for (const text of [COACH_DATA_MAP, PLAYER_DATA_MAP]) {
      expect(text).not.toMatch(/\b(19|20)\d\d\b/);
      expect(text).not.toMatch(/Rini|University/);
      expect(text).not.toMatch(/\d[.,]\d|\d\s*%/);
    }
  });

  it('is about the size planned (characters / 4)', () => {
    console.info(`data map: coach ${tokens(COACH_DATA_MAP)} tokens, player ${tokens(PLAYER_DATA_MAP)} tokens (characters / 4)`);
    expect(tokens(COACH_DATA_MAP)).toBeLessThan(3_900);
    expect(tokens(PLAYER_DATA_MAP)).toBeLessThan(900);
  });
});
