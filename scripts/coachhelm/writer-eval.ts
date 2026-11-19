/**
 * writer-eval.ts: the CoachHelm stage 3 writer over a set of players.
 *
 * OFFLINE BY DEFAULT: no model is called. `writeRead` runs over the synthetic players (built by the analyst's own
 * fixture builder) with a client that answers without a read, which proves the wiring and prints what a live run would
 * cost, ESTIMATED from the prompt's size at Claude Sonnet 5.5's published rates.
 *
 * LIVE spends money and needs the owner's yes. It refuses unless every one of these is given: --live, --max-usd,
 * --target staging with a non-production --url and key (the analyst dry run's refusal), and ANTHROPIC_API_KEY. It reads
 * the staging team with SELECTs only and stops before a player whose worst case would pass --max-usd.
 *
 *   node --import tsx/esm --import ./scripts/coachhelm/server-only-hook.mjs scripts/coachhelm/writer-eval.ts [--view player]
 *
 * No env file is loaded. Nothing is written to any database. No names are read.
 */
import { createClient } from '@supabase/supabase-js';
import { anthropicModelClient } from '@/lib/coachhelm/v3/chat/engine/model';
import { buildTeamFactSheets } from '@/lib/coachhelm/v3/analyst/fact-sheet';
import { findNotable } from '@/lib/coachhelm/v3/analyst/notability';
import { supabaseAnalystSources } from '@/lib/coachhelm/v3/analyst/supabase-sources';
import { ASSUMED_OUTPUT_TOKENS_PER_ATTEMPT, checkWriterEvalArgs, offlineClient, parseWriterEvalArgs, runWriterEval, WRITER_EVAL_USAGE, type EvalPlayer } from '@/lib/coachhelm/v3/analyst/writer/eval';
import { syntheticPlayers } from '@/lib/coachhelm/v3/analyst/writer/__tests__/fixtures';
import type { Database } from '@/lib/types/database';

async function main(): Promise<number> {
  let args;
  try {
    args = parseWriterEvalArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${WRITER_EVAL_USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(WRITER_EVAL_USAGE);
    return 0;
  }
  const checked = checkWriterEvalArgs(args, process.env);
  if (!checked.ok) {
    console.error(`Refused: ${checked.why}.\n\n${WRITER_EVAL_USAGE}`);
    return 2;
  }

  let players: EvalPlayer[];
  if (checked.target === 'staging') {
    const sb = createClient<Database>(checked.url, checked.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const sheets = await buildTeamFactSheets(supabaseAnalystSources(sb), { teamId: checked.team, now: new Date() });
    players = sheets.map((sheet) => ({ id: sheet.player_id, sheet, notability: findNotable(sheet) }));
  } else {
    players = syntheticPlayers().map((p) => ({ id: p.id, sheet: p.sheet, notability: p.notability }));
  }

  const offline = offlineClient();
  const client = checked.live ? anthropicModelClient() : offline;
  const report = await runWriterEval(players, { view: checked.view, client, live: checked.live, maxUsd: checked.live ? checked.maxUsd : null, now: () => new Date() });

  console.log(JSON.stringify(report, null, 2));
  if (!checked.live) {
    const e = report.estimated_usd_per_player;
    console.log('');
    console.log(`Offline: ${offline.calls} calls answered locally, none sent. Every result is null by design (the offline client returns no read).`);
    if (e) console.log(`Estimated live cost per player (prompt chars / 4, ${ASSUMED_OUTPUT_TOKENS_PER_ATTEMPT.toLocaleString('en-US')} output tokens per attempt assumed): $${e.one_attempt.toFixed(4)} if the first draft passes, $${e.two_attempts.toFixed(4)} with a repair. Measure on staging.`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`writer-eval failed: ${(e as Error).message}`);
    process.exit(1);
  },
);
