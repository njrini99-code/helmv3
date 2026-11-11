/**
 * Writes `src/lib/coachhelm/v3/chat/knowledge/data-map.generated.ts`: the "where things are" block of CoachHelm chat's
 * prompt, from `src/lib/types/database.ts`, the `query_team_data` allowlist, the tool registry and the hand-written
 * meanings in `knowledge/data-map.source.ts`.
 *
 *   npm run coachhelm:data-map              write the module
 *   npm run coachhelm:data-map -- --check   exit 1 when it is out of date
 *
 * It refuses to write a map that names a table, column or read that does not exist, and prints what is wrong.
 * `knowledge/__tests__/data-map.test.ts` recomputes the map, so a schema, allowlist or registry change without a
 * regenerate fails CI. Reads files only: no database, no network.
 *
 * The registry imports modules that import `server-only`, so the npm script preloads `server-only-hook.mjs`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSchema, renderDataMapModule, renderDataMaps, type AllowRule } from '../../src/lib/coachhelm/v3/chat/knowledge/data-map-build';
import { toolsFor } from '../../src/lib/coachhelm/v3/chat/registry';
import { TEAM_QUERY_TABLES } from '../../src/lib/coachhelm/v3/chat/team-query-allowlist';

const root = process.cwd();
const outPath = resolve(root, 'src/lib/coachhelm/v3/chat/knowledge/data-map.generated.ts');

const coach = { coach_id: 'c', user_id: 'u', team_id: 't', team_name: 'T', timezone: 'America/New_York', roster: [] };
const reads = (surface: 'ask' | 'quick_chat' | 'practice_helper' | 'player', who: object) =>
  toolsFor(surface, who as never)
    .filter((t) => t.kind === 'read')
    .map((t) => t.name);

const maps = renderDataMaps({
  schema: parseSchema(readFileSync(resolve(root, 'src/lib/types/database.ts'), 'utf8')),
  allowlist: TEAM_QUERY_TABLES as unknown as Record<string, AllowRule>,
  tools: { coach: [...new Set([...reads('ask', coach), ...reads('quick_chat', coach), ...reads('practice_helper', coach)])], player: reads('player', { ...coach, player_id: 'p' }) },
});
if (maps.problems.length) {
  console.error(`The data map would say something untrue:\n${maps.problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}

const next = renderDataMapModule(maps);
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outPath, 'utf8');
  } catch {
    /* missing counts as out of date */
  }
  if (current !== next) {
    console.error('data-map.generated.ts is out of date: run npm run coachhelm:data-map');
    process.exit(1);
  }
  console.log('data-map.generated.ts is up to date');
} else {
  writeFileSync(outPath, next);
  console.log(`wrote ${outPath} (coach ${Math.round(maps.coach.length / 4)} tokens, player ${Math.round(maps.player.length / 4)} tokens, by characters / 4)`);
}
