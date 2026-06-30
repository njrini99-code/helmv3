import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ensureRevealedBugsDir,
  readJson,
  REPO_ROOT,
  writeMarkdown,
} from './route-utils.mjs';

function loadFindings(name) {
  const data = readJson(name, { findings: [] });
  return data.findings ?? [];
}

function severityRank(s) {
  return { P0: 0, P1: 1, P2: 2, P3: 3, none: 4 }[s] ?? 5;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function issueDraft(finding) {
  return `# [Route Hygiene]: ${finding.canonicalPath ?? finding.href ?? finding.id}

## Severity
${finding.severity ?? 'P3'}

## Confidence
${finding.confidence ?? 'medium'}

## Finding type
${finding.type ?? 'unknown'}

## Evidence
- Source file: ${finding.file ?? finding.sourcePath ?? 'n/a'}
- Canonical route: ${finding.canonicalPath ?? 'n/a'}
- Referenced route: ${finding.href ?? finding.dynamicPath ?? 'n/a'}
- Detected by: ${finding.detectedBy ?? 'routes:report'}

## Why it matters
${finding.evidence ?? 'Route hygiene finding requires review before launch.'}

## Suggested resolution
- ${finding.suggestedResolution ?? finding.classification ?? 'needs-decision'}

## Verification
\`\`\`bash
npm run routes:check
npm run routes:crawl
npm run e2e:critical
npm run typecheck
\`\`\`
`;
}

const inventory = readJson('route-inventory.json', { routes: [] });
const allFindings = [
  ...loadFindings('route-duplicate-findings.json'),
  ...loadFindings('route-stale-link-findings.json'),
  ...loadFindings('route-boundary-findings.json'),
  ...loadFindings('route-coverage-report.json'),
  ...loadFindings('route-dead-candidate-findings.json'),
].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

const blockers = allFindings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
const p2 = allFindings.filter((f) => f.severity === 'P2');
const dead = allFindings.filter((f) => f.type === 'candidate-dead');
const duplicates = allFindings.filter((f) => f.type === 'duplicate-canonical');
const stale = allFindings.filter((f) => f.type === 'stale-link' || f.type === 'route-group-leak');
const boundaries = allFindings.filter((f) => f.type === 'product-boundary');
const coverage = allFindings.filter((f) => f.type?.includes('coverage') || f.type === 'dynamic-needs-sample');
const coachhelm = allFindings.filter((f) => f.type === 'coachhelm-surface');

const lines = [
  '# Route Hygiene Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Summary',
  '',
  `- Routes inventoried: ${inventory.route_count ?? inventory.routes?.length ?? 0}`,
  `- Total findings: ${allFindings.length}`,
  `- P0/P1 blockers: ${blockers.length}`,
  `- P2 findings: ${p2.length}`,
  '',
];

function section(title, items, formatter) {
  lines.push(`## ${title}`, '');
  if (items.length === 0) {
    lines.push('_None detected._', '');
    return;
  }
  for (const item of items) {
    lines.push(formatter(item), '');
  }
}

section('P0/P1 blockers', blockers, (f) => {
  return `### ${f.severity}: ${f.canonicalPath ?? f.href ?? f.id}\n\n**Type:** ${f.type}\n**Confidence:** ${f.confidence ?? 'medium'}\n**Source file:** \`${f.file ?? f.sourcePath ?? 'n/a'}\`\n**Detected by:** ${f.detectedBy}\n**Evidence:** ${f.evidence}`;
});

section('Duplicate canonical routes', duplicates, (f) => `- \`${f.canonicalPath}\` ← ${f.sourcePaths?.join(', ') ?? ''}`);
section('Stale links', stale, (f) => `- \`${f.href}\` in \`${f.file}\` (${f.severity})`);
section('Wrong product links', boundaries, (f) => `- \`${f.href ?? f.pattern}\` in \`${f.file}\` (${f.product})`);
section('Dead route candidates', dead, (f) => `- \`${f.canonicalPath}\` (\`${f.sourcePath}\`)`);
section('Missing route coverage', coverage, (f) => `- \`${f.canonicalPath}\` — ${f.evidence}`);
section('CoachHelm duplicate surfaces', coachhelm, (f) => `- \`${f.canonicalPath}\` — ${f.classification ?? 'needs-decision'}`);

lines.push('## Recommended issue drafts', '');
lines.push(`Issue drafts written to \`docs/operations/revealed-bugs/routes/\` for P1+ and representative P2 findings.`, '');

writeMarkdown('route-hygiene-report.md', lines.join('\n'));

ensureRevealedBugsDir();
const draftTargets = allFindings.filter(
  (f) =>
    f.severity === 'P0' ||
    f.severity === 'P1' ||
    (f.severity === 'P2' && f.type === 'candidate-dead') ||
    (f.severity === 'P2' && f.type === 'stale-link' && f.file?.includes('mobile-bottom-nav')),
);
for (const finding of draftTargets.slice(0, 25)) {
  const slug = slugify(finding.canonicalPath ?? finding.href ?? finding.id);
  writeFileSync(
    join(REPO_ROOT, 'docs/operations/revealed-bugs/routes', `${finding.severity ?? 'P2'}-${slug}.md`),
    issueDraft(finding),
  );
}

console.log(`Route hygiene report written (${allFindings.length} findings, ${draftTargets.length} issue drafts).`);
