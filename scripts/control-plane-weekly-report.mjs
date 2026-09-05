#!/usr/bin/env node
/**
 * Weekly control-plane report — the logic behind
 * .github/workflows/control-plane-weekly.yml.
 *
 * FOUR HARD CHECKS. Any failure exits this script 1, which the workflow
 * turns into a failed job:
 *
 *   1. secret-scanning-alerts-zero    open secret-scanning alerts must be 0
 *   2. dependabot-high-severity       open Dependabot alerts at severity
 *                                     high/critical <= config/
 *                                     release-policy.yml's
 *                                     security.max_open_high_dependabot
 *   3. gitleaks-full-history          `gitleaks git . --log-opts=--all
 *                                     --config .gitleaks.toml` finds nothing
 *                                     — ALL refs, not just the current
 *                                     branch's history (review-gate.yml's
 *                                     per-PR gitleaks step only ever sees
 *                                     one branch's diff)
 *   4. control-plane-verify-static    `node scripts/control-plane-verify.mjs
 *                                     --static` exits 0
 *
 * ONE SOFT LISTING, printed but never a reason to fail: remote branches with
 * no PR ever (open, closed, or merged) whose tip is older than 30 days —
 * candidates nobody has looked at, not necessarily branches to delete.
 *
 * Prints a Markdown report to stdout; the workflow posts it as the body of
 * ONE GitHub issue titled "Control plane weekly" (found by title, updated in
 * place — see the workflow for that half; this script only decides pass/fail
 * and writes the text).
 *
 * `HELM_CP_GH` and `HELM_CP_GITLEAKS` override the `gh` and `gitleaks`
 * binaries for tests, the same pattern control-plane-verify.mjs already
 * uses — a check that decides whether a control holds has to be provably
 * able to see it NOT hold, and the only honest way to prove that is to hand
 * it a fake failing answer.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const GH = process.env.HELM_CP_GH || 'gh';
const GITLEAKS_BIN = process.env.HELM_CP_GITLEAKS || 'gitleaks';
const BRANCH_LIST_CAP = 500;
const STALE_DAYS = 30;

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', ...opts });
}

export function repoSlug(env = process.env, root = ROOT) {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf-8' }).trim();
    const m = url.replace(/\.git$/, '').match(/[/:]([^/:]+\/[^/]+)$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Pure: which of a set of Dependabot alerts are open + high/critical, against a ceiling. */
export function evaluateDependabot(alerts, maxAllowed) {
  const high = (alerts ?? []).filter(
    (a) => a.state === 'open' && ['high', 'critical'].includes(a.security_advisory?.severity ?? a.severity),
  );
  return { count: high.length, maxAllowed, ok: high.length <= maxAllowed, alerts: high };
}

/** Pure: branches with no PR ever (any state) whose tip predates the cutoff. */
export function evaluateStaleNoPrBranches(branches, prHeadNames, { now = new Date(), staleDays = STALE_DAYS } = {}) {
  const cutoff = now.getTime() - staleDays * 24 * 60 * 60 * 1000;
  return (branches ?? [])
    .filter((b) => !prHeadNames.has(b.name))
    .filter((b) => b.committedDate && new Date(b.committedDate).getTime() < cutoff)
    .map((b) => ({ name: b.name, committedDate: b.committedDate }));
}

function checkSecretScanning(repo, add) {
  const r = sh(GH, ['api', `repos/${repo}/secret-scanning/alerts`, '--paginate', '--jq', '.[] | select(.state=="open") | .number']);
  if (r.status !== 0) {
    add('secret-scanning-alerts-zero', false, `could not read secret-scanning alerts (gh exit ${r.status}): ${(r.stderr || '').trim().slice(0, 300)}`);
    return;
  }
  const open = (r.stdout ?? '').trim().split('\n').filter(Boolean);
  add('secret-scanning-alerts-zero', open.length === 0,
    open.length === 0 ? 'no open secret-scanning alerts' : `${open.length} open alert(s): ${open.map((n) => '#' + n).join(', ')}`);
}

function checkDependabot(repo, add) {
  const policy = YAML.parse(readFileSync(resolve(ROOT, 'config/release-policy.yml'), 'utf-8'));
  const maxAllowed = policy?.security?.max_open_high_dependabot;
  if (typeof maxAllowed !== 'number') {
    add('dependabot-high-severity', false, 'config/release-policy.yml has no security.max_open_high_dependabot');
    return;
  }
  // --slurp wraps a paginated array-endpoint response as an array OF PAGES
  // (each page itself an array), not one flattened array — `gh api --help`
  // is explicit about this. `.flat()` is the flatten step.
  //
  // The query string is embedded in the URL, NOT passed as `-f state=open`.
  // `-f`/`-F` default `gh api` to a POST-shaped request, and the Dependabot
  // alerts endpoint only accepts GET — `-f` here produces a 404 that looks
  // exactly like "the token can't reach this endpoint" and does not, which
  // cost real debugging time building this check. Verified live: `-f
  // state=open` -> 404; `?state=open` in the URL -> 200 with real data.
  const r = sh(GH, ['api', `repos/${repo}/dependabot/alerts?state=open`, '--paginate', '--slurp']);
  if (r.status !== 0) {
    add('dependabot-high-severity', false, `could not read Dependabot alerts (gh exit ${r.status}): ${(r.stderr || '').trim().slice(0, 300)}`);
    return;
  }
  let alerts;
  try {
    const pages = JSON.parse(r.stdout);
    alerts = Array.isArray(pages) ? pages.flat() : [];
  } catch {
    alerts = [];
  }
  const evaluated = evaluateDependabot(alerts, maxAllowed);
  add('dependabot-high-severity', evaluated.ok,
    `${evaluated.count} open high/critical alert(s), ceiling ${maxAllowed}` +
      (evaluated.count ? `: ${evaluated.alerts.map((a) => '#' + a.number).join(', ')}` : ''));
}

/**
 * Pure: turn a gitleaks JSON report (an array of findings) into a summary
 * with NO secret material — rule id and file only, counted, never the
 * `Secret`/`Match` fields the raw report carries. A report of "how many
 * leaks, of what kind, in which files" is exactly what a triage issue needs
 * and is safe to post publicly; the report itself is not.
 */
export function summarizeGitleaksFindings(findings) {
  const byRule = {};
  const byFile = {};
  for (const f of findings ?? []) {
    byRule[f.RuleID] = (byRule[f.RuleID] ?? 0) + 1;
    byFile[f.File] = (byFile[f.File] ?? 0) + 1;
  }
  return {
    count: (findings ?? []).length,
    distinctFiles: Object.keys(byFile).length,
    byRule,
  };
}

function checkGitleaks(add) {
  // A tmpdir scratch path, deliberately OUTSIDE the repo — never a file this
  // scan itself, or `git status`, could ever see.
  const reportPath = join(tmpdir(), `helmv3-gitleaks-weekly-report-${process.pid}.json`);
  try {
    const r = sh(GITLEAKS_BIN, ['git', '.', '--log-opts=--all', '--config', '.gitleaks.toml', '--report-format', 'json', '--report-path', reportPath, '--no-banner']);
    if (r.error) {
      add('gitleaks-full-history', false, `gitleaks could not run: ${r.error.message}`);
      return;
    }
    if (r.status === 0) {
      add('gitleaks-full-history', true, 'no leaks found across full history (--log-opts=--all)');
      return;
    }
    let findings = [];
    try {
      findings = JSON.parse(readFileSync(reportPath, 'utf-8'));
    } catch {
      /* fall through with an empty summary — the exit code alone still fails the check */
    }
    const summary = summarizeGitleaksFindings(findings);
    const rules = Object.entries(summary.byRule).map(([id, n]) => `${id}=${n}`).join(', ');
    add('gitleaks-full-history', false,
      `${summary.count} finding(s) across ${summary.distinctFiles} file(s) in full git history: ${rules || 'gitleaks exited non-zero with no parsable report'}`);
  } finally {
    try {
      rmSync(reportPath, { force: true });
    } catch {
      /* best-effort cleanup of the scratch report file */
    }
  }
}

function checkControlPlaneVerify(add) {
  const r = sh('node', ['scripts/control-plane-verify.mjs', '--static']);
  const failLines = (r.stdout ?? '').split('\n').filter((l) => /FAIL |DRIFT|STALE|BLOCKED/.test(l)).map((l) => l.trim());
  add('control-plane-verify-static', r.status === 0, r.status === 0 ? 'clean' : (failLines.join('; ') || `exit ${r.status}`));
}

function staleNoPrBranchesSection(repo) {
  const prAll = sh(GH, ['pr', 'list', '--state', 'all', '--limit', String(BRANCH_LIST_CAP), '--json', 'headRefName']);
  const branchesR = sh(GH, ['api', `repos/${repo}/branches`, '--paginate', '--jq', '.[] | "\\(.name)\\t\\(.commit.sha)"']);
  if (prAll.status !== 0 || branchesR.status !== 0) {
    return '_could not compute (gh unavailable)_';
  }
  let prHeadNames;
  try {
    prHeadNames = new Set(JSON.parse(prAll.stdout).map((p) => p.headRefName));
  } catch {
    return '_could not compute (unparsable PR list)_';
  }
  const cappedNote = (JSON.parse(prAll.stdout || '[]').length >= BRANCH_LIST_CAP)
    ? `\n\n_(PR list capped at ${BRANCH_LIST_CAP} — a repo with more history than that may undercount "no PR ever")_`
    : '';
  const branchLines = (branchesR.stdout ?? '').trim().split('\n').filter(Boolean);
  const branches = [];
  for (const line of branchLines) {
    const [name, sha] = line.split('\t');
    if (!name || !sha) continue;
    const dateR = sh(GH, ['api', `repos/${repo}/commits/${sha}`, '--jq', '.commit.committer.date']);
    branches.push({ name, committedDate: dateR.status === 0 ? (dateR.stdout ?? '').trim() : null });
  }
  const stale = evaluateStaleNoPrBranches(branches, prHeadNames);
  if (stale.length === 0) return `_none_${cappedNote}`;
  return stale.map((b) => `- \`${b.name}\` — last commit ${b.committedDate ?? 'unknown'}`).join('\n') + cappedNote;
}

async function main() {
  const repo = repoSlug();
  if (!repo) {
    process.stderr.write('control-plane-weekly-report: could not determine owner/repo\n');
    process.exit(2);
  }

  const results = [];
  const add = (id, ok, detail) => results.push({ id, ok, detail });

  checkSecretScanning(repo, add);
  checkDependabot(repo, add);
  checkGitleaks(add);
  checkControlPlaneVerify(add);
  const staleSection = staleNoPrBranchesSection(repo);

  const lines = [
    '# Control plane weekly',
    '',
    `Run: ${new Date().toISOString()}`,
    '',
    '## Hard checks',
    ...results.map((r) => `- ${r.ok ? '✅' : '❌'} **${r.id}** — ${r.detail}`),
    '',
    `## Soft listing — remote branches with no PR ever, tip older than ${STALE_DAYS} days`,
    staleSection,
  ];

  process.stdout.write(lines.join('\n') + '\n');
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
