#!/usr/bin/env node
/**
 * scripts/regen-resolve.mjs — resolve merge or rebase conflicts in GENERATED files by regenerating them.
 *
 *   npm run regen:resolve            # during a conflicted merge, rebase or cherry-pick
 *   npm run regen:resolve -- --dry   # say what it would do, change nothing
 *
 * A generated file never needs a hand merge: either side is thrown away and the generator rebuilds it
 * from the merged sources. On 2026-10-21 these files (WORLD_MODEL.json, component-catalog.json, the
 * Clubhouse bridge map and status, the flag registry) conflicted on nearly every merge of parallel
 * branches, and each one was resolved by hand. This takes one side of each conflicted generated file,
 * runs the generators that own them, and stages the result. Conflicts in any other file are left for
 * you and listed.
 *
 * The generators read the merged sources in the working tree, so resolve the hand-written conflicts
 * first when a generator reads one of them (config/clubhouse/bridge-contracts.json feeds the Clubhouse
 * docs); the script refuses to run a generator while one of its sources is still conflicted.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Each generated output, the command that rebuilds it, and the hand-written inputs it reads that must be resolved first. */
export const GENERATED = [
  { match: (p) => p === 'src/lib/flags/registry.generated.ts', cmd: ['node', 'scripts/flags/generate-flags.mjs'], inputs: ['config/feature-flags.yml'] },
  { match: (p) => p === 'src/clubhouse/preview/component-catalog.json', cmd: ['node', 'scripts/clubhouse/component-catalog.mjs'], inputs: [] },
  {
    match: (p) => p.startsWith('docs/clubhouse/generated/'),
    cmd: ['node', 'scripts/clubhouse/registry.mjs', 'sync'],
    inputs: ['config/clubhouse/bridge-contracts.json'],
  },
  { match: (p) => p === 'src/lib/admin/slo/golden-paths.generated.ts', cmd: ['node', 'scripts/knowledge/gen-golden-paths.mjs'], inputs: [] },
  { match: (p) => p === 'src/lib/admin/replay/coverage-index.generated.ts', cmd: ['node', 'replay/runners/gen-coverage-index.mjs'], inputs: [] },
  { match: (p) => p === 'docs/generated/WORLD_MODEL.json' || p === 'docs/generated/WORLD_MODEL.md', cmd: ['node', 'scripts/knowledge/world-model.mjs'], inputs: [] },
  { match: (p) => p === 'docs/generated/HELM_FEATURE_MAP.md', cmd: ['npx', 'tsx', 'scripts/knowledge/gen-feature-map.ts'], inputs: [] },
  // The document inventory counts the other generated docs, so it runs last.
  { match: (p) => p === 'docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md', cmd: ['node', 'scripts/knowledge/document-inventory.mjs'], inputs: [] },
];

/**
 * Split conflicted paths into a plan: `{ generated, generators, blocked, other }`. `generators` keeps
 * GENERATED's order and lists each once; `blocked` names a generator whose input is still conflicted.
 */
export function planResolve(conflicted) {
  const list = [...new Set(conflicted)];
  const generated = list.filter((p) => GENERATED.some((g) => g.match(p)));
  const other = list.filter((p) => !generated.includes(p));
  const generators = GENERATED.filter((g) => generated.some((p) => g.match(p)));
  const blocked = generators.flatMap((g) => g.inputs.filter((i) => other.includes(i)).map((i) => ({ cmd: g.cmd.join(' '), input: i })));
  return { generated, generators, blocked, other };
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: r.status === 0 && !r.error, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

function main(argv) {
  const dry = argv.includes('--dry');
  const top = run('git', ['rev-parse', '--show-toplevel']);
  if (!top.ok) {
    process.stderr.write('regen:resolve: not in a git checkout\n');
    return 1;
  }
  process.chdir(top.stdout);
  const conflicted = run('git', ['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').filter(Boolean);
  if (!conflicted.length) {
    process.stdout.write('regen:resolve: no conflicted files\n');
    return 0;
  }
  const plan = planResolve(conflicted);
  if (!plan.generated.length) {
    process.stdout.write(`regen:resolve: no generated file is conflicted; resolve by hand: ${plan.other.join(', ')}\n`);
    return 1;
  }
  if (plan.blocked.length) {
    for (const b of plan.blocked) process.stderr.write(`regen:resolve: resolve ${b.input} first; \`${b.cmd}\` reads it\n`);
    return 1;
  }
  process.stdout.write(`regen:resolve: regenerating ${plan.generated.length} conflicted generated file(s) with ${plan.generators.length} generator(s)\n`);
  if (dry) {
    for (const g of plan.generators) process.stdout.write(`  would run: ${g.cmd.join(' ')}\n`);
    return 0;
  }
  // Either side will do: the generator overwrites it. `--ours` also works for a path one side deleted.
  for (const p of plan.generated) {
    const took = run('git', ['checkout', '--ours', '--', p]);
    if (!took.ok) run('git', ['rm', '--quiet', '--cached', '--', p]);
  }
  for (const g of plan.generators) {
    process.stdout.write(`  ${g.cmd.join(' ')}\n`);
    const r = run(g.cmd[0], g.cmd.slice(1));
    if (!r.ok) {
      process.stderr.write(`regen:resolve: \`${g.cmd.join(' ')}\` failed:\n${r.stderr || r.stdout}\n`);
      return 1;
    }
  }
  const staged = run('git', ['add', '--', ...plan.generated]);
  if (!staged.ok) {
    process.stderr.write(`regen:resolve: git add failed: ${staged.stderr}\n`);
    return 1;
  }
  // A generator can rewrite more than the conflicted files (registry sync also rewrites the CONTRACT tables): show the rest.
  const extra = run('git', ['diff', '--name-only']).stdout.split('\n').filter(Boolean);
  if (extra.length) process.stdout.write(`regen:resolve: the generators also changed (review and stage): ${extra.join(', ')}\n`);
  if (plan.other.length) process.stdout.write(`regen:resolve: still conflicted, resolve by hand: ${plan.other.join(', ')}\n`);
  else process.stdout.write('regen:resolve: every conflict is resolved; review, then continue the merge or rebase\n');
  return plan.other.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
