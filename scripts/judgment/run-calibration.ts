/**
 * Calibration report for the Helm Judgment Layer.
 *
 *   npm run judgment:calibrate            # every use case with fixtures
 *   npm run judgment:calibrate -- --use-case shot_trace
 *
 * Runs each labelled fixture through its judge in dry-run shadow mode (no
 * persistence, no telemetry), compares the disposition to the label, and
 * writes artifacts/judgment/calibration.{json,md}. Nothing here touches a
 * database; hard-invariant cases are decided by code before Jev and
 * reported separately so the provider's own accuracy is not inflated.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { JUDGMENT_DISPOSITIONS, type JudgmentDisposition, type JudgmentResult } from '@/lib/ai/judgment/types';

interface Fixture {
  fixtureVersion: number;
  useCase: 'shot_trace' | 'bug_triage';
  name: string;
  input: Record<string, unknown>;
  expected: { disposition: JudgmentDisposition; reasonCodes?: string[]; alsoAccept?: JudgmentDisposition[] };
  source: string;
  notes?: string;
}

interface CaseReport {
  useCase: string;
  name: string;
  expected: JudgmentDisposition;
  actual: JudgmentDisposition;
  match: 'exact' | 'acceptable' | 'wrong';
  deterministic: boolean;
  providerErrorCode: string | null;
  durationMs: number;
  reasonCodes: string[];
  expectedReasonsPresent: boolean;
}

const ROOT = path.resolve(process.cwd(), 'evals/judgment');
const DIRS: Record<string, string> = { shot_trace: 'shot-trace', bug_triage: 'bug-triage' };
const onlyUseCase = process.argv.includes('--use-case') ? process.argv[process.argv.indexOf('--use-case') + 1] : null;

function loadFixtures(useCase: string): Fixture[] {
  const dir = path.join(ROOT, DIRS[useCase]!);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Fixture);
}

async function judge(fixture: Fixture): Promise<JudgmentResult> {
  const opts = { dryRun: true, modeOverride: 'shadow' as const };
  if (fixture.useCase === 'shot_trace') {
    const { judgeShotTrace } = await import('@/lib/ai/judgment/use-cases/shot-trace');
    return (await judgeShotTrace(fixture.input as unknown as Parameters<typeof judgeShotTrace>[0], opts)).result;
  }
  const { judgeTriageGroup } = await import('@/lib/ai/judgment/use-cases/bug-triage');
  return judgeTriageGroup(fixture.input as unknown as Parameters<typeof judgeTriageGroup>[0], {}, opts);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null;
}

function summarise(useCase: string, cases: CaseReport[]) {
  const provider = cases.filter((c) => !c.deterministic);
  const matrix: Record<string, Record<string, number>> = {};
  for (const d of JUDGMENT_DISPOSITIONS) matrix[d] = Object.fromEntries(JUDGMENT_DISPOSITIONS.map((x) => [x, 0]));
  for (const c of cases) matrix[c.expected]![c.actual]! += 1;
  const escalating = (d: JudgmentDisposition) => d === 'escalate' || d === 'block';
  const tp = cases.filter((c) => escalating(c.expected) && escalating(c.actual)).length;
  const fp = cases.filter((c) => !escalating(c.expected) && escalating(c.actual)).length;
  const fn = cases.filter((c) => escalating(c.expected) && !escalating(c.actual)).length;
  const latencies = provider.filter((c) => !c.providerErrorCode).map((c) => c.durationMs);
  return {
    useCase,
    samples: cases.length,
    deterministic: cases.length - provider.length,
    exact: cases.filter((c) => c.match === 'exact').length,
    acceptable: cases.filter((c) => c.match === 'acceptable').length,
    wrong: cases.filter((c) => c.match === 'wrong').length,
    escalation: {
      precision: tp + fp === 0 ? null : tp / (tp + fp),
      recall: tp + fn === 0 ? null : tp / (tp + fn),
      falsePositives: fp,
      falseNegatives: fn,
      falseNegativeCases: cases.filter((c) => escalating(c.expected) && !escalating(c.actual)).map((c) => c.name),
    },
    providerFailures: provider.filter((c) => c.providerErrorCode).length,
    latencyMs: { median: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    confusion: matrix,
  };
}

async function main(): Promise<void> {
  const useCases = Object.keys(DIRS).filter((u) => !onlyUseCase || u === onlyUseCase);
  const reports: CaseReport[] = [];
  for (const useCase of useCases) {
    for (const fixture of loadFixtures(useCase)) {
      const result = await judge(fixture);
      const deterministic = result.reasonCodes[0] === 'hard_invariant_failed';
      const match: CaseReport['match'] = result.disposition === fixture.expected.disposition
        ? 'exact'
        : (fixture.expected.alsoAccept ?? []).includes(result.disposition)
          ? 'acceptable'
          : 'wrong';
      reports.push({
        useCase,
        name: fixture.name,
        expected: fixture.expected.disposition,
        actual: result.disposition,
        match,
        deterministic,
        providerErrorCode: result.providerErrorCode,
        durationMs: result.durationMs,
        reasonCodes: result.reasonCodes,
        expectedReasonsPresent: (fixture.expected.reasonCodes ?? []).every((r) => result.reasonCodes.includes(r)),
      });
      const mark = match === 'exact' ? 'ok ' : match === 'acceptable' ? '~  ' : 'XX ';
      console.log(`${mark} ${useCase.padEnd(11)} ${fixture.name.padEnd(40)} expected ${fixture.expected.disposition.padEnd(22)} got ${result.disposition.padEnd(22)} ${result.durationMs}ms ${deterministic ? '[code]' : ''} ${result.providerErrorCode ?? ''}`);
    }
  }
  const summaries = useCases.map((u) => summarise(u, reports.filter((r) => r.useCase === u)));
  const outDir = path.resolve(process.cwd(), 'artifacts/judgment');
  mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  writeFileSync(path.join(outDir, 'calibration.json'), JSON.stringify({ generatedAt, summaries, cases: reports }, null, 2));
  const md = [
    `# Judgment calibration — ${generatedAt}`,
    '',
    ...summaries.flatMap((s) => [
      `## ${s.useCase}`,
      '',
      `- samples: ${s.samples} (${s.deterministic} decided by code before Jev)`,
      `- exact ${s.exact} · acceptable ${s.acceptable} · wrong ${s.wrong}`,
      `- escalation precision ${fmt(s.escalation.precision)} · recall ${fmt(s.escalation.recall)} · FP ${s.escalation.falsePositives} · FN ${s.escalation.falseNegatives}${s.escalation.falseNegativeCases.length ? ` (${s.escalation.falseNegativeCases.join(', ')})` : ''}`,
      `- provider failures ${s.providerFailures} · latency median ${s.latencyMs.median ?? '—'} ms · p95 ${s.latencyMs.p95 ?? '—'} ms`,
      '',
      '| expected \\ actual | ' + JUDGMENT_DISPOSITIONS.join(' | ') + ' |',
      '|---|' + JUDGMENT_DISPOSITIONS.map(() => '---').join('|') + '|',
      ...JUDGMENT_DISPOSITIONS.map((e) => `| ${e} | ${JUDGMENT_DISPOSITIONS.map((a) => s.confusion[e]![a]).join(' | ')} |`),
      '',
    ]),
    '## Cases',
    '',
    '| use case | fixture | expected | actual | match | reasons |',
    '|---|---|---|---|---|---|',
    ...reports.map((c) => `| ${c.useCase} | ${c.name} | ${c.expected} | ${c.actual} | ${c.match}${c.deterministic ? ' (code)' : ''} | ${c.reasonCodes.join(', ')} |`),
    '',
  ].join('\n');
  writeFileSync(path.join(outDir, 'calibration.md'), md);
  const wrong = reports.filter((r) => r.match === 'wrong');
  console.log(`\n${reports.length} cases · wrong ${wrong.length} · report: artifacts/judgment/calibration.md`);
  if (process.argv.includes('--strict') && wrong.length > 0) process.exit(1);
}

function fmt(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
