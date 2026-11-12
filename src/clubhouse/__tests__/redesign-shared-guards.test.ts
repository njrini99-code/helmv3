import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const yml = readFileSync(resolve(ROOT, 'config/feature-flags.yml'), 'utf8');

/** Every flag the redesign lanes used, all retired: the redesign is the only version of each page. */
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

/** The redesign replaced the old pages (owner decision, 2026-11-07): these flags are retired, so no flag entry and no read of one may come back. */
describe('the retired redesign flags are gone', () => {
  const walkAll = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules' && name !== '.next') walkAll(p, out);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.generated.ts')) out.push(p);
    }
    return out;
  };

  it.each(LANE_FLAGS)('%s has no entry in feature-flags.yml', (flag) => {
    expect(yml, flag).not.toContain(`- feature_id: ${flag}\n`);
  });

  it('no source file reads a retired flag by id', () => {
    // `golf_practice_plans` is also a table name, so only a flag read (a call or a `_FLAG =` constant) counts.
    const reads = LANE_FLAGS.map((f) => new RegExp(`(?:isFlagEnabled|evaluateFlag|_FLAG\\s*=)\\s*\\(?\\s*['"]${f}['"]`));
    const hits = walkAll(resolve(ROOT, 'src')).filter((f) => {
      const src = readFileSync(f, 'utf8');
      return reads.some((r) => r.test(src));
    });
    expect(hits).toEqual([]);
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
