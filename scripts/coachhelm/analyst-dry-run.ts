/**
 * analyst-dry-run.ts: READ-ONLY run of the CoachHelm analyst's first two parts (fact sheet, notability) for one team.
 *
 * For every active player it builds the fact sheet and the candidates, then prints a JSON summary and a short table:
 * per player how many candidates and which rule fired, "N players share candidate X", how many distinct candidate
 * kinds the team has and what share of players share the most common one.
 *
 * The target comes from explicit flags. No env file is loaded (every local env file points at production), and the
 * run REFUSES when the URL or the key belongs to the production project. The only database calls are SELECTs
 * (src/lib/coachhelm/v3/analyst/supabase-sources.ts). No model is called. No names are read: ids only.
 *
 * Usage (the hook stubs `server-only` outside Next):
 *   STAGING_SERVICE_KEY=... node --import tsx/esm --import ./scripts/coachhelm/server-only-hook.mjs \
 *     scripts/coachhelm/analyst-dry-run.ts --url https://<project>.supabase.co \
 *     --service-key-env STAGING_SERVICE_KEY --team <team uuid> [--out report.json] [--as-of 2026-11-10]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DRY_RUN_USAGE, checkDryRunArgs, parseDryRunArgs, reportTable, runAnalystDryRun } from '@/lib/coachhelm/v3/analyst/dry-run';
import { supabaseAnalystSources } from '@/lib/coachhelm/v3/analyst/supabase-sources';
import type { Database } from '@/lib/types/database';

async function main(): Promise<number> {
  let args;
  try {
    args = parseDryRunArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${DRY_RUN_USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(DRY_RUN_USAGE);
    return 0;
  }
  const checked = checkDryRunArgs(args, process.env);
  if (!checked.ok) {
    console.error(`Refused: ${checked.why}.\n\n${DRY_RUN_USAGE}`);
    return 2;
  }

  const sb = createClient<Database>(checked.url, checked.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { report, players } = await runAnalystDryRun(supabaseAnalystSources(sb), { teamId: checked.team, now: checked.now });

  if (checked.out) {
    const path = resolve(process.cwd(), checked.out);
    writeFileSync(path, `${JSON.stringify({ report, players }, null, 2)}\n`);
    console.error(`Full JSON (every sheet and its candidates) written to ${path}`);
  }
  console.log(JSON.stringify(report, null, 2));
  console.log('');
  console.log(reportTable(report));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`analyst-dry-run failed: ${(e as Error).message}`);
    process.exit(1);
  },
);
