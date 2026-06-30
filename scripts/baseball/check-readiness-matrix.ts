#!/usr/bin/env tsx
// =============================================================================
// scripts/baseball/check-readiness-matrix.ts
//
// Validates docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md:
//   1. Every route cited in the Route(s) column resolves to a real
//      page.tsx/route.ts under src/app/baseball/** (always checked, no
//      network access required).
//   2. Every GitHub issue URL cited in the Owner Issue column is open and
//      actually exists — ONLY when a GITHUB_TOKEN is available. Without a
//      token, this check is skipped entirely (route validation still runs).
//
// Exits non-zero with a line-referenced report on any failure. Exits 0
// (silently) on a full pass. Wired into the advisory CI job in
// .github/workflows/baseball-readiness-matrix.yml via `npm run
// check:readiness-matrix` — never a hard merge gate per issue #376.
// =============================================================================

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { routeExists, extractBaseballRoutesFromMarkdown, extractOwnerIssueUrls } from './resolve-route';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..', '..');
const APP_DIR = join(REPO_ROOT, 'src', 'app');
const MATRIX_FILE = join(
  REPO_ROOT,
  'docs',
  'operations',
  'BASEBALLHELM_FEATURE_READINESS_MATRIX.md',
);

interface IssueUrlParts {
  owner: string;
  repo: string;
  number: string;
}

function parseIssueUrl(url: string): IssueUrlParts | null {
  const m = /github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/.exec(url);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, number: m[3]! };
}

async function checkIssueState(url: string): Promise<string | null> {
  const parts = parseIssueUrl(url);
  if (!parts) return `${url} — could not parse as a GitHub issue URL`;

  const apiUrl = `https://api.github.com/repos/${parts.owner}/${parts.repo}/issues/${parts.number}`;
  const token = process.env.GITHUB_TOKEN;

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'helmv3-readiness-matrix-check',
      },
    });
  } catch (err) {
    return `${url} — network error while checking issue state: ${String(err)}`;
  }

  if (res.status === 404) {
    return `${url} — issue not found (404). Remove or replace this owner-issue link.`;
  }
  if (!res.ok) {
    return `${url} — GitHub API returned HTTP ${res.status} while checking issue state.`;
  }

  const body = (await res.json()) as { state?: string; state_reason?: string; pull_request?: unknown };
  if (body.pull_request) {
    return `${url} — this URL points to a pull request, not an issue.`;
  }
  if (body.state === 'closed') {
    return `${url} — issue is closed. Per the matrix's Maintenance section, resolved owner issues must be removed or replaced, not left linked.`;
  }
  return null;
}

async function main(): Promise<void> {
  const failures: string[] = [];

  if (!existsSync(MATRIX_FILE)) {
    console.error(`FAIL: matrix file not found at ${MATRIX_FILE}`);
    process.exitCode = 1;
    return;
  }

  const source = readFileSync(MATRIX_FILE, 'utf8');

  // --- 1. Route validation (always runs, no network access required) -------
  const routes = extractBaseballRoutesFromMarkdown(source);
  for (const route of routes) {
    if (!routeExists(route, APP_DIR)) {
      failures.push(`route ${route} does not resolve to a real page.tsx/route.ts under src/app/baseball/**`);
    }
  }

  // --- 2. Owner-issue validation (only with a GITHUB_TOKEN) -----------------
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log(
      'No GITHUB_TOKEN set — skipping owner-issue open/closed validation (route validation still ran).',
    );
  } else {
    const issueUrls = extractOwnerIssueUrls(source);
    const results = await Promise.all(issueUrls.map((url) => checkIssueState(url)));
    for (const failure of results) {
      if (failure) failures.push(failure);
    }
  }

  if (failures.length > 0) {
    console.error(`\n❌ BASEBALLHELM_FEATURE_READINESS_MATRIX.md validation failed (${failures.length} issue(s)):\n`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    console.error(`\nFile: docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md`);
    process.exitCode = 1;
    return;
  }

  console.log('✅ BASEBALLHELM_FEATURE_READINESS_MATRIX.md routes (and owner issues, if token present) all valid.');
}

main().catch((err) => {
  console.error('check-readiness-matrix crashed:', err);
  process.exitCode = 1;
});
