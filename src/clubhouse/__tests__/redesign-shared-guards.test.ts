import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const yml = readFileSync(resolve(ROOT, 'config/feature-flags.yml'), 'utf8');

/** Every lane's flag: START_HERE section 4 and the wiring sections. */
const LANE_FLAGS = [
  'clubhouse_refresh_v1',
  'clubhouse_stats_redesign_v1',
  'clubhouse_classes_roster_home_v1',
  'golf_messages_redesign_v1',
  'coachhelm_read_v1',
  'coachhelm_ask_v2',
  'coachhelm_player_ask_v1',
  'coachhelm_quick_chat_v1',
  'coachhelm_player_file_v1',
  'coachhelm_team_board_v1',
  'coachhelm_practice_plans_v1',
  'golf_practice_plans',
  'golf_documents_library',
] as const;

const entryOf = (flag: string) => {
  const at = yml.indexOf(`- feature_id: ${flag}\n`);
  expect(at, `${flag} is registered`).toBeGreaterThan(-1);
  const end = yml.indexOf('- feature_id:', at + 1);
  return yml.slice(at, end < 0 ? undefined : end);
};

/** SHARED-8. A flag that isn't off everywhere can't promise "flag off renders today's screens" anywhere. */
describe('every lane’s flag is a release flag, off in every environment', () => {
  it.each(LANE_FLAGS)('%s', (flag) => {
    const e = entryOf(flag);
    expect(e).toMatch(/default: false/);
    expect(e).toMatch(/production: false/);
    expect(e).toMatch(/preview: false/);
    expect(e).toMatch(/development: false/);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const CAPTURE_AND_SAVE = ['src/hooks/golf/use-shot-tracking.ts'];
const LANE_DIRS = ['src/clubhouse/screens/stats', 'src/clubhouse/screens/home', 'src/clubhouse/screens/messages', 'src/clubhouse/screens/coachhelm', 'src/clubhouse/shell/quick-chat', 'src/lib/coachhelm/delivery', 'src/lib/coachhelm/v3/team-board', 'src/lib/coachhelm/v3/practice-plan'];
const LANE_FILES = ['src/clubhouse/data/stats-player.ts', 'src/clubhouse/data/stats-team.ts', 'src/clubhouse/data/coachhelm-read-view.ts', 'src/clubhouse/data/coachhelm-team.ts', 'src/clubhouse/data/coachhelm-file.ts', 'src/clubhouse/data/practice-plan.ts', 'src/app/golf/actions/practice-plans.ts', 'src/app/golf/actions/practice-publish.ts', 'src/app/golf/actions/coachhelm-practice-plans.ts'];

/** SHARED-10, W-READ-20, W-TEAM-18, W-PP-17, W-ASK-28. The zero-diff half is a git check for the PR; this holds the wall between them in the tree. */
describe('shot tracking is out of reach of the lanes', () => {
  it('the capture code reads no lane’s flag', () => {
    for (const f of CAPTURE_AND_SAVE) {
      const p = resolve(ROOT, f);
      expect(existsSync(p), f).toBe(true);
      const src = readFileSync(p, 'utf8');
      for (const flag of LANE_FLAGS) expect(src, `${f} names ${flag}`).not.toContain(flag);
    }
  });

  it('no lane file writes a round, a hole or a shot', () => {
    const write = /\.from\(\s*['"`]golf_(?:rounds|holes|shots)['"`]\s*\)\s*\.\s*(?:insert|update|upsert|delete)\b/;
    const rpc = /\.rpc\(\s*['"`](?:submit_round_atomic|save_round_partial)/;
    const files = [...LANE_DIRS.flatMap((d) => walk(resolve(ROOT, d))), ...LANE_FILES.map((f) => resolve(ROOT, f))];
    expect(files.length).toBeGreaterThan(100);
    const hits = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return write.test(src) || rpc.test(src);
    });
    expect(hits).toEqual([]);
  });

  it('no client module in a lane’s screens imports shot capture', () => {
    const files = ['src/clubhouse/screens/stats', 'src/clubhouse/screens/messages', 'src/clubhouse/screens/coachhelm', 'src/clubhouse/shell/quick-chat'].flatMap((d) => walk(resolve(ROOT, d)));
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/use-shot-tracking/);
  });
});
