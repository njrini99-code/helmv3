#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRegistry, mapFilesToFeatures, fileExists } from './lib/registry.mjs';

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const registry = await loadRegistry(repoRoot);
const impactedFeatures = mapFilesToFeatures(registry, args.files);
const docPaths = [
  'AGENTS.md',
  'CLAUDE.md',
  'memory/registry.yml',
  ...impactedFeatures.flatMap((feature) => feature.docs),
];
const uniqueDocPaths = [...new Set(docPaths)];

const sections = [];
sections.push(`# Helmv3 Context Pack`);
sections.push(`## Task\n\n${args.task || 'No task provided.'}`);
sections.push(`## Changed Files\n\n${renderList(args.files)}`);
sections.push(`## Impacted Features\n\n${renderFeatures(impactedFeatures)}`);

for (const docPath of uniqueDocPaths) {
  if (!fileExists(repoRoot, docPath)) {
    sections.push(`## Missing Doc: ${docPath}\n\nThis mapped document does not exist yet.`);
    continue;
  }
  const text = await readFile(join(repoRoot, docPath), 'utf8');
  sections.push(`## ${docPath}\n\n${truncate(text, args.maxDocChars)}`);
}

sections.push(`## Open Questions\n\n- Confirm whether any unmapped changed files should be added to \`memory/registry.yml\`.`);

const output = sections.join('\n\n---\n\n');
await writeFile(args.output, `${output}\n`, 'utf8');
console.log(`Wrote ${args.output}`);

function parseArgs(argv) {
  const parsed = {
    files: [],
    output: '/tmp/helmv3-context-pack.md',
    task: '',
    maxDocChars: 5000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--files') {
      i += 1;
      while (i < argv.length && !argv[i].startsWith('--')) {
        parsed.files.push(argv[i]);
        i += 1;
      }
      i -= 1;
    } else if (arg === '--output') {
      parsed.output = argv[++i];
    } else if (arg === '--task') {
      parsed.task = argv[++i];
    } else if (arg === '--max-doc-chars') {
      parsed.maxDocChars = Number(argv[++i]);
    } else if (!arg.startsWith('--')) {
      parsed.files.push(arg);
    }
  }
  return parsed;
}

function renderFeatures(features) {
  if (features.length === 0) return '- No mapped features found.';
  return features
    .map((feature) => {
      const checks = Array.isArray(feature.requiredChecks)
        ? feature.requiredChecks.map((check) => `  - ${check}`).join('\n')
        : '';
      return [
        `### ${feature.name}`,
        '',
        `- id: \`${feature.id}\``,
        `- criticality: ${feature.criticality}`,
        `- matched files:`,
        feature.matchedFiles.map((file) => `  - \`${file}\``).join('\n'),
        checks ? `- suggested checks:\n${checks}` : '- suggested checks: none mapped',
      ].join('\n');
    })
    .join('\n\n');
}

function renderList(items) {
  if (items.length === 0) return '- No files provided.';
  return items.map((item) => `- \`${item}\``).join('\n');
}

function truncate(text, maxChars) {
  if (text.length <= maxChars) return text.trim();
  return `${text.slice(0, maxChars).trim()}\n\n[Truncated to ${maxChars} chars for context-pack size.]`;
}
