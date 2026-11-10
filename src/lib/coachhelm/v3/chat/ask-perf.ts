import type { LanguageModelUsage } from 'ai';

/**
 * Where an Ask turn's time and tokens go, per phase and per model call.
 *
 * Off unless a development request sends `x-ask-perf: 1`: then the stream route ends the turn with one transient `data-ask-perf` part that the
 * measurement harness reads (`scripts/coachhelm/ask-perf.mjs`). Nothing here is persisted, logged or sent in production, and it holds no
 * names, ids or values: only milliseconds, token counts and tool-free labels.
 */
export function askPerfEnabled(req: Request): boolean {
  const v = req.headers?.get('x-ask-perf');
  return process.env.NODE_ENV !== 'production' && (v === '1' || v === 'capture');
}

interface ModelCallEnd {
  usage: LanguageModelUsage;
  finishReason: string;
  performance: { responseTimeMs: number; timeToFirstOutputMs: number | undefined; outputTokensPerSecond: number | undefined };
}

export class AskPerf {
  private readonly t0 = performance.now();
  private readonly marks: Array<[string, number]> = [];
  private readonly calls: Array<Record<string, number | string | undefined>> = [];
  private lastRequest: unknown = null;

  constructor(
    readonly enabled: boolean,
    /** `x-ask-perf: capture` also keeps the last model request (prompt and tool definitions) so the harness can replay it against the API. */
    readonly capture = false,
  ) {}

  /** The request about to go to the model; kept only when capturing. */
  modelRequest(e: { tools?: unknown; messages?: unknown; system?: unknown; instructions?: unknown; prompt?: unknown }): void {
    if (this.enabled && this.capture) this.lastRequest = { tools: e.tools, messages: e.messages, system: e.system, instructions: e.instructions, prompt: e.prompt };
  }

  /** A named point on the turn's clock (ms since the request reached the route). */
  mark(name: string): void {
    if (this.enabled) this.marks.push([name, Math.round(performance.now() - this.t0)]);
  }

  /** One finished model call (one step of the agent loop). */
  modelCall(e: ModelCallEnd): void {
    if (!this.enabled) return;
    const d = e.usage.inputTokenDetails;
    this.calls.push({
      endedAt: Math.round(performance.now() - this.t0),
      responseMs: Math.round(e.performance.responseTimeMs),
      ttftMs: e.performance.timeToFirstOutputMs === undefined ? undefined : Math.round(e.performance.timeToFirstOutputMs),
      outTps: e.performance.outputTokensPerSecond === undefined ? undefined : Math.round(e.performance.outputTokensPerSecond),
      finish: e.finishReason,
      input: e.usage.inputTokens,
      fresh: d?.noCacheTokens,
      cacheRead: d?.cacheReadTokens,
      cacheWrite: d?.cacheWriteTokens,
      output: e.usage.outputTokens,
      reasoning: e.usage.outputTokenDetails?.reasoningTokens,
    });
  }

  snapshot(): { marks: Array<[string, number]>; calls: Array<Record<string, number | string | undefined>>; totalMs: number; request?: unknown } {
    return { marks: this.marks, calls: this.calls, totalMs: Math.round(performance.now() - this.t0), ...(this.capture ? { request: this.lastRequest } : {}) };
  }
}

/** Development only, with the trace on: `x-ask-effort: low|medium|high` picks the model's effort, to compare them on the same questions (thinking cannot be disabled on claude-sonnet-5-5). */
export function askPerfProviderOptions(req: Request): { anthropic: Record<string, unknown> } | undefined {
  if (!askPerfEnabled(req)) return undefined;
  const v = req.headers?.get('x-ask-effort');
  if (v === 'low' || v === 'medium' || v === 'high') return { anthropic: { effort: v } };
  return undefined;
}
