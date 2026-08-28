/**
 * Producer tests for the Repair arm of `incidents/fetch.ts`.
 *
 * WHY THIS FILE EXISTS. The pure derivation layer under `incidents/` is heavily
 * tested; the module that PRODUCES its inputs is not. `deploy-proof.ts`'s own
 * header records that a real bug survived for exactly that reason — "every
 * proof test built its `IncidentDeployProof` fixtures by hand and nothing
 * exercised the function that PRODUCES them". This is the same gap one level
 * up, so these tests feed mocked GITHUB RESPONSES through the real producer
 * rather than hand-building an `IncidentRepair`.
 *
 * THE DEFECT PINNED HERE. To read CI for an open Repair PR the producer asked
 * GitHub for check-runs on a branch it GUESSED from the incident id:
 *
 *     fetchBranchChecks(owner, repo, `fix/rca-${id}`, headers)
 *
 * That guess came from the repair contract's STEP 4. But the one supported
 * worktree creator, `scripts/new-worktree.sh`, only produces `agent/<task>`
 * branches — and the first real Repair PR (#1658) was therefore on
 * `agent/repair-qualifier-closed-code` and linked to its incident through the
 * STEP 5 body link instead. So the producer could FIND the PR and then fail to
 * read its checks, degrading a green PR to "checks unknown" forever.
 *
 * GitHub PR identity should decide which commit to inspect. A branch NAME
 * should not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const INCIDENT = 'bfec4073';
const PR_NUMBER = 1658;
const HEAD_SHA = 'feb04a9117ccc2299d904318fff7c5046df6a0ac';
const AGENT_BRANCH = 'agent/repair-qualifier-closed-code';

let workLogResult: unknown;

vi.mock('@/lib/admin/github-pr-timeline', () => ({
  fetchWorkLog: vi.fn(async () => workLogResult),
}));

vi.mock('@/lib/admin/github-issues-config', () => ({
  githubIssuesToken: () => 'test-token',
  githubIssuesRepo: () => ({ owner: 'o', repo: 'r', label: 'x' }),
  githubIssuesHeaders: () => ({ authorization: 'token test-token' }),
}));

import { fetchRepairPrs } from '@/lib/admin/incidents/fetch';

/** An open Repair PR that is linked ONLY by the STEP 5 body link and lives on
 *  an `agent/*` branch — i.e. exactly the shape #1658 had. */
function openRepairEntry() {
  return {
    number: PR_NUMBER,
    html_url: `https://github.com/o/r/pull/${PR_NUMBER}`,
    title: 'fix(golf): a closed qualifier is a warning, not a Sentry error',
    state: 'open',
    authorLogin: 'someone',
    created_at: '2026-08-28T16:00:00Z',
    updated_at: '2026-08-28T16:30:00Z',
    merged_at: null,
    closed_at: null,
    parsed: { area: 'unknown' },
    repairIncidentIds: [INCIDENT],
  };
}

interface FetchCall {
  url: string;
}
let calls: FetchCall[] = [];

/**
 * Stand-in GitHub. `fix/rca-<id>` deliberately 404s, because that branch does
 * not exist for this PR — the same answer the real API gives.
 */
function installGitHub(opts: { headSha?: string | null; headStatus?: number; checksStatus?: number } = {}) {
  const headSha = opts.headSha === undefined ? HEAD_SHA : opts.headSha;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push({ url: String(url) });
      const u = String(url);

      if (u.includes(`/pulls/${PR_NUMBER}`)) {
        if (opts.headStatus && opts.headStatus >= 400) {
          return { ok: false, status: opts.headStatus, json: async () => ({}) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ head: { sha: headSha, ref: AGENT_BRANCH } }),
        };
      }

      if (u.includes(`/commits/${headSha}/check-runs`)) {
        if (opts.checksStatus && opts.checksStatus >= 400) {
          return { ok: false, status: opts.checksStatus, json: async () => ({}) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            check_runs: [
              { status: 'completed', conclusion: 'success' },
              { status: 'completed', conclusion: 'success' },
              { status: 'completed', conclusion: 'skipped' },
            ],
          }),
        };
      }

      // Anything keyed on a guessed branch name does not exist.
      return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
    }),
  );
}

beforeEach(() => {
  calls = [];
  workLogResult = { status: 'ok', data: { entries: [openRepairEntry()] } };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('fetchRepairPrs — CI checks come from the PR head, not a guessed branch', () => {
  it('A — reads checks for an open PR linked by body link on a non-standard agent/* branch', async () => {
    installGitHub();

    const result = await fetchRepairPrs(new Set([INCIDENT]));
    const pr = result.byIncident.get(INCIDENT);

    expect(result.readable).toBe(true);
    expect(pr).toBeDefined();
    expect(pr!.entry.number).toBe(PR_NUMBER);

    // THE ASSERTION THAT FAILS BEFORE THE FIX: the producer guessed
    // `fix/rca-bfec4073`, GitHub 404'd, and checks degraded to null.
    expect(pr!.checks).not.toBeNull();
    expect(pr!.checks!.failed).toBe(0);
    expect(pr!.checks!.passed).toBe(2);
    expect(pr!.checks!.pending).toBe(0);
  });

  it('A2 — never asks GitHub for a branch name derived from the incident id', async () => {
    // The behavioural half of the same fix, stated independently of the
    // outcome: a guessed branch must not appear in any request URL.
    installGitHub();
    await fetchRepairPrs(new Set([INCIDENT]));

    const guessed = calls.filter((c) => c.url.includes('fix') && c.url.includes(INCIDENT));
    expect(guessed).toEqual([]);
    expect(calls.some((c) => c.url.includes(`/pulls/${PR_NUMBER}`))).toBe(true);
  });

  it('B — a failed PR-head lookup leaves the PR visible with checks UNKNOWN, never "no repair"', async () => {
    installGitHub({ headStatus: 500 });

    const result = await fetchRepairPrs(new Set([INCIDENT]));
    const pr = result.byIncident.get(INCIDENT);

    expect(result.readable).toBe(true);
    expect(pr).toBeDefined();          // the PR still exists
    expect(pr!.checks).toBeNull();     // its CI state is unknown
  });

  it('C — a failed check-runs lookup leaves the PR visible with checks UNKNOWN', async () => {
    installGitHub({ checksStatus: 503 });

    const result = await fetchRepairPrs(new Set([INCIDENT]));
    const pr = result.byIncident.get(INCIDENT);

    expect(pr).toBeDefined();
    expect(pr!.checks).toBeNull();
  });

  it('D — a MERGED Repair PR needs no live check lookup', async () => {
    const merged = { ...openRepairEntry(), state: 'merged', merged_at: '2026-08-28T17:00:00Z' };
    workLogResult = { status: 'ok', data: { entries: [merged] } };
    installGitHub();

    const result = await fetchRepairPrs(new Set([INCIDENT]));
    expect(result.byIncident.get(INCIDENT)).toBeDefined();
    // The merge settled CI; no PR-head or check-runs request should be made.
    expect(calls).toEqual([]);
  });

  it('G — an unreadable work log is UNKNOWN, not "no repair exists"', async () => {
    workLogResult = { status: 'error', error: 'GitHub unavailable', data: null };
    installGitHub();

    const result = await fetchRepairPrs(new Set([INCIDENT]));
    expect(result.readable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.byIncident.size).toBe(0);
  });
});
