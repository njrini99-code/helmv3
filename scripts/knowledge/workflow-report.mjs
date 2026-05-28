#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRegistry, mapFilesToFeatures, fileExists } from './lib/registry.mjs';

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const changedFiles = await readChangedFiles(args.changedFiles);
const registry = await loadRegistry(repoRoot);
const impactedFeatures = mapFilesToFeatures(registry, changedFiles);
const unmappedFiles = changedFiles.filter(
  (file) =>
    !file.startsWith('docs/') &&
    !file.startsWith('memory/') &&
    !impactedFeatures.some((feature) => feature.matchedFiles.includes(file)),
);
const missingDocs = [];

for (const feature of impactedFeatures) {
  for (const doc of feature.docs) {
    if (!fileExists(repoRoot, doc)) missingDocs.push({ feature: feature.id, doc });
  }
}

await mkdir(args.outputDir, { recursive: true });

await writeFile(
  join(args.outputDir, 'feature-map.json'),
  `${JSON.stringify({ changedFiles, impactedFeatures, unmappedFiles, missingDocs }, null, 2)}\n`,
  'utf8',
);

await writeFile(
  join(args.outputDir, 'summary.md'),
  renderSummary({ changedFiles, impactedFeatures, unmappedFiles, missingDocs }),
  'utf8',
);

await writeFile(
  join(args.outputDir, 'context-pack.md'),
  await renderContextPack({ repoRoot, changedFiles, impactedFeatures, maxDocChars: args.maxDocChars }),
  'utf8',
);

console.log(`Wrote feature-awareness report to ${args.outputDir}`);
if (unmappedFiles.length > 0) {
  console.warn(`Unmapped non-doc files: ${unmappedFiles.length}`);
}
if (missingDocs.length > 0) {
  console.warn(`Missing mapped docs: ${missingDocs.length}`);
}

function parseArgs(argv) {
  const parsed = {
    changedFiles: 'changed-files.txt',
    outputDir: 'feature-awareness-report',
    maxDocChars: 2500,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--changed-files') parsed.changedFiles = argv[++i];
    else if (arg === '--output-dir') parsed.outputDir = argv[++i];
    else if (arg === '--max-doc-chars') parsed.maxDocChars = Number(argv[++i]);
  }
  return parsed;
}

async function readChangedFiles(path) {
  const text = await readFile(path, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function renderSummary({ changedFiles, impactedFeatures, unmappedFiles, missingDocs }) {
  return [
    '# Feature Awareness Report',
    '',
    '## Changed Files',
    '',
    renderList(changedFiles),
    '',
    '## Impacted Features',
    '',
    impactedFeatures.length === 0
      ? '- No mapped features found.'
      : impactedFeatures
          .map((feature) =>
            [
              `### ${feature.name}`,
              '',
              `- id: \`${feature.id}\``,
              `- criticality: ${feature.criticality}`,
              '- matched files:',
              feature.matchedFiles.map((file) => `  - \`${file}\``).join('\n'),
              '- suggested checks:',
              feature.requiredChecks.length > 0
                ? feature.requiredChecks.map((check) => `  - \`${check}\``).join('\n')
                : '  - none mapped',
            ].join('\n'),
          )
          .join('\n\n'),
    '',
    '## Unmapped Non-Doc Files',
    '',
    renderList(unmappedFiles),
    '',
    '## Missing Mapped Docs',
    '',
    missingDocs.length === 0
      ? '- None.'
      : missingDocs.map((item) => `- ${item.feature}: \`${item.doc}\``).join('\n'),
    '',
  ].join('\n');
}

async function renderContextPack({ repoRoot, changedFiles, impactedFeatures, maxDocChars }) {
  const docPaths = [
    'AGENTS.md',
    'CLAUDE.md',
    'memory/registry.yml',
    ...impactedFeatures.flatMap((feature) => feature.docs),
  ];
  const uniqueDocPaths = [...new Set(docPaths)];
  const sections = [
    '# Helmv3 PR Context Pack',
    '## Changed Files',
    '',
    renderList(changedFiles),
    '',
    '## Impacted Features',
    '',
    impactedFeatures.length === 0
      ? '- No mapped features found.'
      : impactedFeatures.map((feature) => `- ${feature.name} (\`${feature.id}\`)`).join('\n'),
  ];

  for (const docPath of uniqueDocPaths) {
    if (!fileExists(repoRoot, docPath)) {
      sections.push('', '---', '', `## Missing Doc: ${docPath}`, '', 'This mapped document does not exist yet.');
      continue;
    }
    const text = await readFile(join(repoRoot, docPath), 'utf8');
    sections.push('', '---', '', `## ${docPath}`, '', truncate(text, maxDocChars));
  }

  return `${sections.join('\n')}\n`;
}

function renderList(items) {
  if (items.length === 0) return '- None.';
  return items.map((item) => `- \`${item}\``).join('\n');
}

function truncate(text, maxChars) {
  if (text.length <= maxChars) return text.trim();
  return `${text.slice(0, maxChars).trim()}\n\n[Truncated to ${maxChars} chars for context-pack size.]`;
}
