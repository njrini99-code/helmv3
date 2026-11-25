#!/usr/bin/env node
/**
 * Report the workspace count against HELM_MAX_MUTATION_WORKTREES, as a CLI.
 *
 * Nothing on the creation path shells out to this: scripts/lib/create-workspace.mjs
 * imports `inspectWorkspaces` (git worktree list -> classified rows) from here
 * and applies the budget itself. The count is advisory unless
 * HELM_MAX_MUTATION_WORKTREES is set; see docs/operations/WORKSPACES.md.
 * Run directly it prints whether the budget has room. It never touches the
 * network, so it is cheap to run anywhere.
 *
 * Exit 0 = budget available, or over it with no explicit cap (advisory).
 * Exit 1 = over an explicit HELM_MAX_MUTATION_WORKTREES cap. Exit 2 = usage error.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyWorkspaceKind,
  mutationBudgetDecision,
  DEFAULT_MUTATION_BUDGET,
} from './lib/worktree-lifecycle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/** Same rule as the lifecycle reporter: act on the repo the caller stands in. */
function resolveRepo() {
  return git(['rev-parse', '--show-toplevel'], process.cwd()) ?? resolve(HERE, '..');
}

export function inspectWorkspaces(repo, canonicalRoot) {
  const raw = git(['worktree', 'list', '--porcelain'], repo) ?? '';
  const entries = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) entries.push(cur);
      cur = { path: line.slice(9), detached: false };
    } else if (line === 'detached' && cur) {
      cur.detached = true;
    }
  }
  if (cur) entries.push(cur);

  return entries.map((e) => {
    const readable = existsSync(e.path);
    let declaredKind = null;
    const decl = resolve(e.path, '.helm/workspace.json');
    if (readable && existsSync(decl)) {
      try {
        declaredKind = JSON.parse(readFileSync(decl, 'utf-8')).kind ?? null;
      } catch {
        declaredKind = null;
      }
    }
    const verdict = classifyWorkspaceKind({
      isCanonical: canonicalRoot !== null && resolve(e.path) === resolve(canonicalRoot),
      detached: e.detached,
      declaredKind,
      readable,
    });
    return { path: e.path, ...verdict };
  });
}

function canonicalRoot(repo) {
  const id = resolve(repo, '.claude/hooks/lib/workspace-identity.mjs');
  if (!existsSync(id)) return null;
  try {
    return execFileSync('node', [id, '--canonical-root'], {
      cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim() || null;
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = resolveRepo();
  const budget = Number(process.env.HELM_MAX_MUTATION_WORKTREES ?? DEFAULT_MUTATION_BUDGET);
  const spaces = inspectWorkspaces(repo, canonicalRoot(repo));
  const decision = mutationBudgetDecision(spaces, budget);
  const enforced = process.env.HELM_MAX_MUTATION_WORKTREES !== undefined;

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ repo, budget, enforced, decision, spaces }, null, 2));
    process.exit(decision.ok || !enforced ? 0 : 1);
  }

  if (decision.ok) {
    console.log(`mutation budget: ${decision.used}/${decision.budget} in use`);
    process.exit(0);
  }

  if (!enforced) {
    console.log(`workspace count advisory: ${decision.reason}; no explicit cap is set`);
    process.exit(0);
  }
  console.error(`refusing: ${decision.reason}.`);
  console.error('');
  console.error('Already in use:');
  for (const b of spaces.filter((s) => s.counts)) {
    console.error(`  ${b.path}`);
    console.error(`    ${b.kind} — ${b.reason}`);
  }
  console.error('');
  console.error(`Budget is ${decision.budget} mutation workspace(s) at a time. Finish or park one:`);
  console.error('');
  console.error('  npm run worktrees          # report');
  console.error('  npm run worktrees:park     # remove a disposable checkout, KEEP its branch');
  console.error('  npm run worktrees:retire   # park + delete branches proven merged');
  console.error('');
  console.error('Override deliberately: HELM_MAX_MUTATION_WORKTREES=<n>.');
  process.exit(1);
}
