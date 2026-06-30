import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const generatedDir = join(process.cwd(), 'docs/operations/generated');
const draftsDir = join(process.cwd(), 'docs/operations/revealed-bugs/production-readiness');
mkdirSync(generatedDir, { recursive: true });
mkdirSync(draftsDir, { recursive: true });
for (const file of readdirSync(draftsDir)) {
  if (file.endsWith('.md')) unlinkSync(join(draftsDir, file));
}

const inputs = [
  'semgrep.json',
  'dependency-cruiser.json',
  'knip.json',
  'jscpd/jscpd-report.json',
  'route-duplicate-findings.json',
  'route-stale-link-findings.json',
  'route-boundary-findings.json',
  'route-coverage-findings.json',
  'route-dead-candidate-findings.json',
  'prod-db-audit-findings.json',
  'gitleaks.json',
  'osv.json',
  'stryker-golf-stats.json',
  'stryker-coachhelm.json',
];

function readOptionalJson(relativePath) {
  const fullPath = join(generatedDir, relativePath);
  if (!existsSync(fullPath)) return null;
  try {
    return JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch (error) {
    return { parse_error: error instanceof Error ? error.message : String(error) };
  }
}

const sources = inputs.map((input) => ({ input, data: readOptionalJson(input) }));
const findings = [];

for (const source of sources) {
  const data = source.data;
  if (!data) continue;
  if (source.input === 'gitleaks.json' && Array.isArray(data)) {
    findings.push({
      source: source.input,
      id: `GITLEAKS-${data.length}-REDACTED-FINDINGS`,
      severity: 'P0',
      confidence: 'high',
      title: `Gitleaks reported ${data.length} redacted secret findings`,
      evidence: ['See ignored generated gitleaks report locally; do not commit raw secret output.'],
    });
  } else if (Array.isArray(data.findings)) {
    for (const finding of data.findings) findings.push({ source: source.input, ...finding });
  } else if (source.input === 'osv.json' && Array.isArray(data.results)) {
    findings.push({
      source: source.input,
      id: `OSV-${data.results.length}-VULN-FINDINGS`,
      severity: 'P1',
      confidence: 'medium',
      title: `OSV reported ${data.results.length} vulnerability result groups`,
      evidence: ['Review generated OSV JSON and triage reachability before blocking merge.'],
    });
  } else if (data.finding_count > 0 && Array.isArray(data.findings)) {
    for (const finding of data.findings) findings.push({ source: source.input, ...finding });
  } else if (data.parse_error) {
    findings.push({
      source: source.input,
      id: `AUDITOR-PARSE-${source.input}`,
      severity: 'P2',
      confidence: 'high',
      title: `Could not parse ${source.input}`,
      evidence: [data.parse_error],
    });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  input_count: inputs.length,
  available_inputs: sources.filter((source) => source.data).map((source) => source.input),
  finding_count: findings.length,
  findings,
};

writeFileSync(join(generatedDir, 'helm-audit-findings.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(
  join(generatedDir, 'helm-audit-report.md'),
  [
    '# Helm Production Readiness Auditor',
    '',
    `Generated: ${report.generated_at}`,
    '',
    `Available inputs: ${report.available_inputs.length}/${inputs.length}`,
    `Findings: ${findings.length}`,
    '',
    ...findings.map((finding) => `- **${finding.severity ?? 'P3'}** ${finding.id ?? 'UNKEYED'} (${finding.source}): ${finding.title ?? finding.message ?? 'Review finding'}`),
    '',
  ].join('\n'),
);

for (const finding of findings.filter((finding) => ['P0', 'P1'].includes(finding.severity))) {
  const id = String(finding.id ?? 'finding').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  writeFileSync(
    join(draftsDir, `${id}.md`),
    [
      `# ${finding.title ?? finding.id}`,
      '',
      `Severity: ${finding.severity}`,
      `Confidence: ${finding.confidence ?? 'medium'}`,
      `Source: ${finding.source}`,
      '',
      '## Evidence',
      '',
      ...(finding.evidence ?? finding.evidenceFiles ?? []).map((item) => `- ${item}`),
      '',
      '## Suggested Fix',
      '',
      finding.suggestedFix ?? 'Investigate and fix the production-readiness finding.',
      '',
    ].join('\n'),
  );
}

console.log(`Helm auditor complete: ${findings.length} findings from ${report.available_inputs.length} available inputs.`);
