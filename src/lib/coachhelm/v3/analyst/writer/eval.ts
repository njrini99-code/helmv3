/**
 * The writer's eval: flags, refusals, the cost estimate and the report. The script (`scripts/coachhelm/writer-eval.ts`)
 * is thin around this so every refusal is unit tested.
 *
 * Offline (the default) calls no model: `writeRead` runs over the synthetic players with a client that answers without
 * a read, so the run proves the wiring end to end and prints what a live run would cost, estimated from the prompt's
 * size. Live calls the model and needs ALL of: `--live`, `--max-usd`, `--target staging` with a non-production
 * Supabase URL and key, and `ANTHROPIC_API_KEY`. It stops before a player whose worst case would pass the cap.
 */
import { callCostUsd, type CallUsage, type ModelClient } from '@/lib/coachhelm/v3/chat/engine/model';
import { refusal } from '../dry-run';
import { similarity } from './checker';
import { payloadFor } from './payload';
import { factsMessage, WRITER_SYSTEM, WRITER_TOOLS } from './prompt';
import type { FactSheet, Notability, WriteResult, WriterView } from './types';
import { WRITER_PROFILE, writeRead } from './write-read';

export const WRITER_EVAL_USAGE = `writer-eval: the stage 3 writer over a set of players. Offline by default: no model is called.

  --view <coach|player>       which card to write (default coach)
  --live                      call the model (spends money; needs every flag below)
  --max-usd <dollars>         live only: stop before a player whose worst case would pass this
  --target <fixtures|staging> where the players come from (default fixtures; live requires staging)
  --url <url>                 staging only: the Supabase project to read (refused when it is production)
  --service-key-env <NAME>    staging only: the NAME of the variable holding its service key (never printed)
  --team <uuid>               staging only: the team to read
  --help                      this text

No env file is loaded. Nothing is written to any database.`;

export interface WriterEvalArgs {
  view: WriterView;
  live: boolean;
  maxUsd: number | null;
  target: 'fixtures' | 'staging';
  url: string | null;
  serviceKeyEnv: string | null;
  team: string | null;
  help: boolean;
}

export function parseWriterEvalArgs(argv: readonly string[]): WriterEvalArgs {
  const a: WriterEvalArgs = { view: 'coach', live: false, maxUsd: null, target: 'fixtures', url: null, serviceKeyEnv: null, team: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === '--help' || flag === '-h') a.help = true;
    else if (flag === '--live') a.live = true;
    else if (flag === '--view') {
      const v = next();
      if (v !== 'coach' && v !== 'player') throw new Error('--view is coach or player');
      a.view = v;
    } else if (flag === '--max-usd') {
      const v = Number(next());
      if (!Number.isFinite(v) || v <= 0) throw new Error('--max-usd must be a positive number of dollars');
      a.maxUsd = v;
    } else if (flag === '--target') {
      const v = next();
      if (v !== 'fixtures' && v !== 'staging') throw new Error('--target is fixtures or staging');
      a.target = v;
    } else if (flag === '--url') a.url = next();
    else if (flag === '--service-key-env') a.serviceKeyEnv = next();
    else if (flag === '--team') a.team = next();
    else throw new Error(`unknown argument: ${flag}`);
  }
  return a;
}

export type CheckedEvalArgs =
  | { ok: true; live: false; view: WriterView; target: 'fixtures' }
  | { ok: true; live: false; view: WriterView; target: 'staging'; url: string; key: string; team: string }
  | { ok: true; live: true; view: WriterView; target: 'staging'; url: string; key: string; team: string; maxUsd: number }
  | { ok: false; why: string };

/** The args as a run can use them, or why it must not start. A live run without every safeguard never starts. */
export function checkWriterEvalArgs(a: WriterEvalArgs, env: Record<string, string | undefined>): CheckedEvalArgs {
  if (a.live && a.maxUsd === null) return { ok: false, why: 'a live run needs --max-usd: it spends money, and the cap is the owner\'s' };
  if (a.live && a.target !== 'staging') return { ok: false, why: 'a live run needs --target staging: it runs on a staging team, never production and never unattended fixtures' };
  if (!a.live && a.maxUsd !== null) return { ok: false, why: '--max-usd only means something with --live' };
  if (a.target === 'fixtures') return { ok: true, live: false, view: a.view, target: 'fixtures' };
  if (!a.url || !a.serviceKeyEnv || !a.team) return { ok: false, why: '--target staging needs --url, --service-key-env and --team' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.team)) return { ok: false, why: '--team must be a team id (uuid)' };
  const key = env[a.serviceKeyEnv];
  const why = refusal(a.url, key);
  if (why || !key) return { ok: false, why: why ?? 'no service key' };
  if (a.live) {
    if (!env.ANTHROPIC_API_KEY?.trim()) return { ok: false, why: 'a live run needs ANTHROPIC_API_KEY in the environment' };
    return { ok: true, live: true, view: a.view, target: 'staging', url: a.url, key, team: a.team, maxUsd: a.maxUsd! };
  }
  return { ok: true, live: false, view: a.view, target: 'staging', url: a.url, key, team: a.team };
}

// ── The cost estimate ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * An ESTIMATE, not a measurement. Prompt tokens are the prompt's characters over four (a rough English rate; the real
 * count is `messages.count_tokens` or a live run's usage). Output tokens per attempt are an assumption for adaptive
 * thinking at medium effort plus a four-paragraph tool call. Priced with the chat's own table (`callCostUsd`), which
 * holds Claude Sonnet 5.5 at $2 input and $10 output per million tokens, a cache read at a tenth of input (the
 * claude-api skill's model table, cached 2026-11-03). Measure on staging before quoting it.
 */
export const ASSUMED_OUTPUT_TOKENS_PER_ATTEMPT = 2_500;
export const CHARS_PER_TOKEN = 4;

export interface CostEstimate {
  prompt_tokens: number;
  /** First draft passes, no cache. */
  one_attempt_usd: number;
  /** Draft and repair: the repair re-sends the prompt plus the first reply. */
  two_attempts_usd: number;
}

export function estimateCost(sheet: FactSheet, notability: Notability, view: WriterView): CostEstimate | null {
  const payload = payloadFor(sheet, notability, view);
  if (!payload) return null;
  const chars = WRITER_SYSTEM.length + JSON.stringify(WRITER_TOOLS).length + factsMessage(payload).length;
  const prompt = Math.ceil(chars / CHARS_PER_TOKEN);
  const call = (input: number, cacheRead = 0): CallUsage => ({ model: WRITER_PROFILE.modelId, kind: 'message', input, output: ASSUMED_OUTPUT_TOKENS_PER_ATTEMPT, cache_read: cacheRead, cache_write_5m: 0, cache_write_1h: 0, dropped_thinking: 0 });
  const first = callCostUsd(call(prompt));
  return {
    prompt_tokens: prompt,
    one_attempt_usd: first,
    two_attempts_usd: first + callCostUsd(call(prompt + ASSUMED_OUTPUT_TOKENS_PER_ATTEMPT + 300)),
  };
}

/** An offline client: answers every request with a plain sentence and no read. Nothing leaves the machine. */
export function offlineClient(): ModelClient & { calls: number } {
  const client = {
    calls: 0,
    stream() {
      client.calls += 1;
      const message = { id: `offline-${client.calls}`, type: 'message', role: 'assistant', model: WRITER_PROFILE.modelId, stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: 'offline: no model was called' }], usage: { input_tokens: 0, output_tokens: 0 } };
      return {
        [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true as const, value: undefined }) }),
        finalMessage: async () => message,
      } as never;
    },
  };
  return client;
}

// ── The run ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EvalPlayer {
  id: string;
  sheet: FactSheet;
  notability: Notability;
}

export interface EvalRow {
  player: string;
  priority: string | null;
  estimate: CostEstimate | null;
  result: Pick<WriteResult, 'attempts' | 'cost_usd'> & { written: boolean; rejected_for: string[] };
}

export interface EvalReport {
  live: boolean;
  view: WriterView;
  model: string;
  rows: EvalRow[];
  skipped_for_budget: string[];
  written: number;
  spent_usd: number;
  estimated_usd_per_player: { one_attempt: number; two_attempts: number } | null;
  /** The largest word-trigram overlap between two players' written texts (1 is identical). Null with fewer than two. */
  max_pairwise_similarity: number | null;
  rejection_counts: Record<string, number>;
}

export async function runWriterEval(players: readonly EvalPlayer[], opts: { view: WriterView; client: ModelClient; live: boolean; maxUsd: number | null; now: () => Date }): Promise<EvalReport> {
  const rows: EvalRow[] = [];
  const skipped: string[] = [];
  const texts: string[] = [];
  const counts: Record<string, number> = {};
  let spent = 0;
  for (const p of players) {
    const estimate = estimateCost(p.sheet, p.notability, opts.view);
    if (opts.maxUsd !== null && estimate && spent + estimate.two_attempts_usd > opts.maxUsd) {
      skipped.push(p.id);
      continue;
    }
    const out = await writeRead({ view: opts.view, sheet: p.sheet, notability: p.notability, others: texts }, { client: opts.client, now: opts.now });
    spent += out.cost_usd;
    for (const r of out.rejections.flatMap((x) => x.reasons)) counts[r.rule] = (counts[r.rule] ?? 0) + 1;
    if (out.written) texts.push([out.written.what, out.written.rules_in_out, out.written.this_week, out.written.watch].join(' '));
    rows.push({
      player: p.id,
      priority: p.notability.priority?.label ?? null,
      estimate,
      result: { attempts: out.attempts, cost_usd: out.cost_usd, written: out.written !== null, rejected_for: [...new Set(out.rejections.flatMap((x) => x.reasons.map((r) => r.rule)))] },
    });
  }
  let maxSim: number | null = null;
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) maxSim = Math.max(maxSim ?? 0, similarity(texts[i]!, texts[j]!));
  const estimates = rows.map((r) => r.estimate).filter((e): e is CostEstimate => e !== null);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    live: opts.live,
    view: opts.view,
    model: WRITER_PROFILE.modelId,
    rows,
    skipped_for_budget: skipped,
    written: rows.filter((r) => r.result.written).length,
    spent_usd: spent,
    estimated_usd_per_player: estimates.length > 0 ? { one_attempt: mean(estimates.map((e) => e.one_attempt_usd)), two_attempts: mean(estimates.map((e) => e.two_attempts_usd)) } : null,
    max_pairwise_similarity: maxSim,
    rejection_counts: counts,
  };
}
