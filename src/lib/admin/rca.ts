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
import { recordAi } from '@/lib/observability/metrics';
import { classifyProviderFault } from '@/lib/admin/provider-fault';
import { RCA_CANONICAL_PREFIX, deriveRcaCategory, type RcaCategory } from '@/lib/admin/rca-category';

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
  suggestedFix: z
    .string()
    .describe(
      'A concrete suggested fix or next debugging step. For FIX HERE name the file and the change; for ALREADY FIXED name the commit or PR; for NOT A DEFECT name the control flow or noise source; for NEEDS MORE EVIDENCE name exactly what is missing.',
    ),
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

/** The four verdicts an analysis can carry — `rca-category.ts` owns the
 *  vocabulary; this is the same set minus `uncategorized`, which a model is
 *  never allowed to choose. */
const RCA_VERDICTS = ['fix-here', 'already-fixed', 'not-a-defect', 'needs-more-evidence'] as const;
type RcaVerdict = (typeof RCA_VERDICTS)[number];

/**
 * What the MODEL is asked for: the stored engine shape plus an explicit
 * verdict. The verdict is a separate enum field rather than a hoped-for
 * opening phrase in `suggestedFix` because the phrase alone was never
 * produced: every one of the 184 analyses the Vercel cron wrote between
 * 2026-09-03 and 2026-09-09 opened with free prose, derived to
 * `uncategorized`, and so was invisible to Close (`isAutoResolvable`) and
 * unranked for Repair — the whole loop ran and moved nothing. The enum is
 * validated at the SDK layer (the model retries on mismatch), and
 * `withCanonicalPrefix` turns it into the exact opening
 * `deriveRcaCategory()` reads, so a stored analysis can no longer be
 * off-contract by phrasing. The stored shape is unchanged: the verdict is
 * folded into `suggestedFix`, never persisted as its own field, so every
 * analysis already in `admin_events` still parses.
 */
const rcaModelSchema = rcaEngineSchema.extend({
  category: z
    .enum(RCA_VERDICTS)
    .describe(
      'Your verdict. fix-here: a code change in this repo would stop it (name it in suggestedFix). already-fixed: a commit or PR you can name from the provided context already fixed it. not-a-defect: expected control flow, third-party noise, a bot, or a client abort — name why. needs-more-evidence: the provided context cannot support any of the other three — name exactly what is missing.',
    ),
});

/**
 * Open `suggestedFix` with the canonical phrase for `category`, unless the
 * model already wrote one (any of the four — a model that writes
 * "ALREADY FIXED …" while picking `already-fixed` must not be doubled, and one
 * whose prose already derives to a category keeps its own words). Pure and
 * exported for tests.
 */
export function withCanonicalPrefix(category: RcaVerdict, suggestedFix: string): string {
  const derived: RcaCategory = deriveRcaCategory(suggestedFix);
  if (derived !== 'uncategorized') return suggestedFix;
  const body = suggestedFix.trim();
  return body ? `${RCA_CANONICAL_PREFIX[category]} — ${body}` : RCA_CANONICAL_PREFIX[category];
}

const RCA_SYSTEM_PROMPT = `You are assisting a solo engineer doing root-cause analysis on a production incident in a Next.js + Supabase TypeScript monorepo (Helm Sports Labs — BaseballHelm/GolfHelm/CoachHelm). You will be given an incident report (title, message, classification, occurrence history, nearby deploys), a resolved source-file hint from the feature registry when one exists, and up to three raw stack traces.

Ground every claim in what is actually shown. Never invent a file path, function name, or line number that does not appear in the provided context — if the context does not name a specific file, leave suspectFiles empty rather than guessing. Prefer a lower confidence rating over an unsupported claim.

Every analysis carries exactly one verdict in the category field, and suggestedFix must justify that verdict: fix-here names the file and the change; already-fixed names the commit or PR that fixed it (only if the provided context names one — never guess a SHA); not-a-defect names the expected control flow, noise source, or client behaviour; needs-more-evidence names exactly what is missing and what would produce it. Reserve not-a-defect and already-fixed for cases the context actually proves — when unsure, choose needs-more-evidence.`;

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

  const startedAt = Date.now();
  try {
    // `instructions` + `prompt`, not a `messages` array with a system-role
    // entry: the installed AI SDK (^7) gates system-role messages inside
    // `messages` behind `allowSystemInMessages` (default `false`) and would
    // reject the shape this file used before — `instructions` is exactly the
    // field the SDK's own `Prompt` type provides for this.
    const { object, usage } = await generateObject({
      model: resolveModelProvider(RCA_MODEL),
      schema: rcaModelSchema,
      instructions: RCA_SYSTEM_PROMPT,
      prompt: buildRcaContextText(context),
      // Sentry AI observability opt-in (Phase A finding, §(a)): the prompt
      // here is the incident report + up to 3 raw stack traces — already
      // redacted once on the way into error_logs/admin_events, but stack
      // traces can still echo row-level values a redaction pass would not
      // catch (spans.ts's own documented Postgres-error concern). No prompt
      // or model output belongs in Sentry from this call.
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'admin.rca',
        recordInputs: false,
        recordOutputs: false,
      },
    });

    recordAi({
      feature: 'admin_rca',
      action: 'admin.rca.analyze',
      model: RCA_MODEL,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    });

    const { category, ...engine } = object;
    const analysis: RcaAnalysis = {
      ...engine,
      suggestedFix: withCanonicalPrefix(category, engine.suggestedFix),
      model: RCA_MODEL,
      generatedAt: new Date().toISOString(),
    };
    return { status: 'ok', analysis };
  } catch (error) {
    recordAi({
      feature: 'admin_rca',
      action: 'admin.rca.analyze',
      model: RCA_MODEL,
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      errorCode: classifyProviderFault(error)?.code,
      runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    });
    return { status: 'error', message: describeError(error) };
  }
}

/* ==========================================================================
 * The repair vocabulary lives in `rca-category.ts` — it is pure and must stay
 * importable from client components, which this `server-only` module is not.
 * Re-exported here so server-side callers have a single import site.
 * ========================================================================== */
export {
  RCA_CATEGORIES,
  RCA_CANONICAL_PREFIX,
  RCA_CATEGORY_LABEL,
  deriveRcaCategory,
  isRepairCandidate,
  isAutoResolvable,
  type RcaCategory,
} from '@/lib/admin/rca-category';
