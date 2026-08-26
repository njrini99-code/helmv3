/**
 * Helm Bridge — in-app root-cause analysis.
 *
 * Turns an already-assembled incident (the Copy-for-Claude report this repo
 * already builds — see @/lib/admin/incident-report — plus raw stacks and the
 * derived incident classification) into a structured guess at "what broke and
 * where", using the repo's own model provider instead of a manual
 * copy/paste-into-Claude round trip.
 *
 * Server-only and deliberately narrow: this module does no auth, no DB
 * access, and no orchestration — @/app/admin/actions/analyze-error.ts owns
 * gathering context, calling `runRcaAnalysis`, and persisting the result. That
 * split keeps the model-calling code testable without a database double and
 * the action thin enough to read as "assemble, call, persist".
 */
import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';
import { resolveModelProvider } from '@/lib/ai/model-provider';
import { describeError } from '@/lib/utils/describe-error';
import type { IncidentReportDeploy } from '@/lib/admin/incident-report';

/** Structured root-cause analysis for one incident fingerprint. */
export interface RcaAnalysis {
  probableCause: string;
  suspectFiles: Array<{ path: string; line?: number; reason: string }>;
  suggestedFix: string;
  confidence: 'high' | 'medium' | 'low';
  relatedFingerprints: string[];
  model: string;
  generatedAt: string;
}

export type RcaResult =
  | { status: 'ok'; analysis: RcaAnalysis }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string };

/**
 * Context the caller assembles before asking for an analysis. Every field is
 * plain data — no DB handles, no Supabase client — so `runRcaAnalysis` stays
 * unit-testable with nothing more than a mocked `generateObject`.
 */
export interface RcaSourceContext {
  fingerprint: string;
  /** buildIncidentReport() / buildFingerprintIncidentReport() output. */
  incidentReport: string;
  /** Most-recent-first; only the first 3 are used. */
  rawStacks: string[];
  /** Derived IncidentClass (@/lib/admin/incident-classification), if known. */
  classificationKind: string | null;
  /** Resolved file path from the feature registry (resolveActionFilePath), if known. */
  sourceFilePath: string | null;
  /** Deploys bracketing the incident's lifetime (selectNearbyDeploys' output),
   *  if the caller already computed them. */
  nearbyDeploys?: IncidentReportDeploy[];
}

/** The engine-generated half of `RcaAnalysis` — everything the model
 *  actually produces. `model`/`generatedAt` are stamped on by this module
 *  afterward, never asked of the model. */
const suspectFileSchema = z.object({
  path: z
    .string()
    .describe(
      'Repo-relative file path most likely responsible, e.g. "src/lib/golf/foo.ts". Use only paths that actually appear in the provided stack traces or the source-file hint — never invent one.',
    ),
  line: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Line number, only if a stack trace frame actually names one for this file.'),
  reason: z.string().describe('Why this file is suspected, in one sentence.'),
});

const rcaEngineSchema = z.object({
  probableCause: z
    .string()
    .describe(
      'The most likely root cause in 1-3 sentences, grounded in the report and stack traces provided — do not speculate beyond the evidence given.',
    ),
  suspectFiles: z
    .array(suspectFileSchema)
    .describe('Files most likely responsible, most likely first. Empty array if none can be identified from the context.'),
  suggestedFix: z.string().describe('A concrete suggested fix or next debugging step.'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('Confidence in this analysis, given how much of the context was actually available.'),
  relatedFingerprints: z
    .array(z.string())
    .describe(
      'Other fingerprint ids EXPLICITLY named in the provided context that look like the same root cause. Empty array if none are mentioned — never guess one.',
    ),
});

/** Full stored shape (adds the two fields this module stamps on after the
 *  model call) — exported so callers reading a persisted analysis back out
 *  of `admin_events.metadata` can validate it instead of trusting an
 *  unknown JSON blob. */
export const rcaAnalysisSchema = rcaEngineSchema.extend({
  model: z.string(),
  generatedAt: z.string(),
});

const RCA_SYSTEM_PROMPT = `You are assisting a solo engineer doing root-cause analysis on a production incident in a Next.js + Supabase TypeScript monorepo (Helm Sports Labs — BaseballHelm/GolfHelm/CoachHelm). You will be given an incident report (title, message, classification, occurrence history, nearby deploys), a resolved source-file hint from the feature registry when one exists, and up to three raw stack traces.

Ground every claim in what is actually shown. Never invent a file path, function name, or line number that does not appear in the provided context — if the context does not name a specific file, leave suspectFiles empty rather than guessing. Prefer a lower confidence rating over an unsupported claim.`;

/** Env var this feature requires. Named explicitly in the unconfigured
 *  message so an operator knows exactly what to set. */
const RCA_ENV_VAR = 'ANTHROPIC_API_KEY';

/** Model id this runs on. Passed through resolveModelProvider exactly like
 *  every other LLM call site in this repo (see @/lib/ai/model-provider) —
 *  this file never picks a provider itself. */
const RCA_MODEL = process.env.RCA_MODEL?.trim() || 'anthropic/claude-sonnet-5';

/** Caps the assembled context so one enormous incident report (a fingerprint
 *  with hundreds of occurrences, or a multi-KB stack trace) can't blow past a
 *  reasonable request size. */
const MAX_CONTEXT_CHARS = 20_000;

/**
 * Trimmed, not just truthy — mirrors resolveModelProvider's own guard. A
 * `vercel env pull` can leave a blank-but-present value for a sensitive var,
 * and that must read as "not configured", not as configured-with-an-empty-key.
 *
 * Deliberately requires the direct ANTHROPIC_API_KEY rather than silently
 * falling through to the bare gateway id. @/lib/ai/model-provider's own doc
 * comment records that the gateway account has, more than once, answered a
 * bare `'anthropic/...'` id with "Free tier users do not have access to this
 * model" for every call on a given path — this is a new, admin-only,
 * on-demand feature, and it should tell the operator plainly that a key is
 * missing rather than quietly attempt a path this codebase has already
 * documented as unreliable.
 */
function isRcaModelConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * Assemble the model's input text from a `RcaSourceContext`. Pure and
 * exported for unit testing without a mocked model call.
 */
export function buildRcaContextText(context: RcaSourceContext): string {
  const sections: string[] = [`Fingerprint: ${context.fingerprint}`];

  if (context.classificationKind) {
    sections.push(`Incident classification: ${context.classificationKind}`);
  }
  if (context.sourceFilePath) {
    sections.push(`Source file (resolved from the feature registry): ${context.sourceFilePath}`);
  }
  if (context.nearbyDeploys && context.nearbyDeploys.length > 0) {
    const deployLines = context.nearbyDeploys
      .map((d) => `- ${d.time}${d.sha ? ` sha=${d.sha}` : ''}`)
      .join('\n');
    sections.push(`Nearby deploys (most recent first):\n${deployLines}`);
  }

  sections.push(`--- Incident report ---\n${context.incidentReport}`);

  const stacks = context.rawStacks.slice(0, 3);
  if (stacks.length > 0) {
    const stackText = stacks.map((stack, i) => `Stack trace ${i + 1}:\n${stack}`).join('\n\n');
    sections.push(`--- Raw stack traces ---\n${stackText}`);
  }

  const full = sections.join('\n\n');
  if (full.length <= MAX_CONTEXT_CHARS) return full;
  // Truncate from the end: the header lines (fingerprint, classification,
  // source file, deploys) are written first and always survive; the report
  // and stack traces are the bulk of the size and are what gets cut.
  return `${full.slice(0, MAX_CONTEXT_CHARS)}\n\n[context truncated at ${MAX_CONTEXT_CHARS} chars]`;
}

/**
 * Run root-cause analysis for one incident. Never throws — every failure
 * mode (missing config, model/schema error) comes back as a typed `RcaResult`
 * so the calling action can persist on `'ok'` and surface the rest as-is.
 */
export async function runRcaAnalysis(context: RcaSourceContext): Promise<RcaResult> {
  if (!isRcaModelConfigured()) {
    return {
      status: 'unconfigured',
      message: `Root-cause analysis needs ${RCA_ENV_VAR} configured — set it and retry.`,
    };
  }

  try {
    // `instructions` + `prompt`, not a `messages` array with a system-role
    // entry: the installed AI SDK (^7) gates system-role messages inside
    // `messages` behind `allowSystemInMessages` (default `false`) and would
    // reject the shape this file used before — `instructions` is exactly the
    // field the SDK's own `Prompt` type provides for this.
    const { object } = await generateObject({
      model: resolveModelProvider(RCA_MODEL),
      schema: rcaEngineSchema,
      instructions: RCA_SYSTEM_PROMPT,
      prompt: buildRcaContextText(context),
    });

    const analysis: RcaAnalysis = {
      ...object,
      model: RCA_MODEL,
      generatedAt: new Date().toISOString(),
    };
    return { status: 'ok', analysis };
  } catch (error) {
    return { status: 'error', message: describeError(error) };
  }
}
