// =============================================================================
// src/lib/admin/deploy-freshness.ts
//
// "Is production actually running the code we think it is?"
//
// WHY THIS EXISTS. On 2026-07-30 four Sentry issues were filed as live
// production defects (#1130 Stripe webhook 500s, #1131 Inngest 404, #1132 RLS
// refuses conversation INSERT, #1133 AI Gateway plan gate). Three of the four
// were already fixed on `main` and regression-tested:
//
//   #1130  fixed by #1116, merged 2026-07-29T23:45Z
//   #1132  fixed 2026-07-26T16:59Z — 16h AFTER its single Sentry event
//   #1133  classified honestly by #1106 on 2026-07-29T22:04Z
//
// The production deployment serving traffic was built 2026-07-29T18:30Z — five
// hours before #1116 and eleven commits behind `main`. So the errors were real,
// but the bugs were not: they were shipped code that had already been repaired
// in a `main` nobody had deployed.
//
// That is a systemic blind spot, not four bugs. `main` deliberately does not
// auto-deploy (`git.deploymentEnabled {"*": false}` since #789 — production is
// promoted on purpose), which is a sound policy that silently accrues a gap
// between "fixed" and "shipped". Nothing measured that gap, so triage kept
// re-discovering repaired bugs and burning attention on them.
//
// This module measures it and hands the briefing one sentence.
//
// SPLIT ON PURPOSE: `classifyDeployFreshness` is pure and fully unit-tested;
// the network read lives in `fetchDeployFreshness` and fails soft to `unknown`.
// =============================================================================

export interface DeployFreshnessInput {
  /** Sha production is serving. `undefined` when it cannot be determined. */
  deployedSha: string | undefined;
  /** Commits on `main` that production does not have. `null` when unknown. */
  behindBy: number | null;
  /** When the running deployment's commit was authored. `null` when unknown. */
  deployedAt: string | null;
  /** Injected so the classifier stays pure and testable. */
  now: Date;
}

export interface DeployFreshness {
  /**
   * - `unknown` — we could not establish it. NEVER conflate with `current`.
   * - `current` — production has everything on `main`.
   * - `behind`  — production is missing commits, but not alarmingly.
   * - `stale`   — production is missing commits AND has been for long enough,
   *               or by enough, that unshipped fixes are the likely story.
   */
  state: 'unknown' | 'current' | 'behind' | 'stale';
  /** One line for the briefing body. */
  summary: string;
  /** Present only for `stale` — the briefing puts this in its red list. */
  red: string | null;
  ageHours: number | null;
}

/**
 * Escalation thresholds.
 *
 * Being a commit or two behind is the normal resting state of a repo that
 * promotes production deliberately, so `behindBy > 0` alone must NOT turn the
 * briefing red — a briefing that is red every single morning is one nobody
 * reads by week two. (That failure mode is not hypothetical: leaving an
 * unscheduled cron in `CRON_REGISTRY` would have done exactly this, caught in
 * #1139.)
 *
 * Either threshold alone is enough to be worth a founder's attention:
 *   - 24h+ behind: long enough that a same-day hotfix is provably unshipped.
 *   - 10+ commits: the 2026-07-30 case was 11 commits at 18h, which the hours
 *     test alone would have missed.
 */
export const STALE_AFTER_HOURS = 24;
export const STALE_AFTER_COMMITS = 10;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function classifyDeployFreshness(input: DeployFreshnessInput): DeployFreshness {
  const { deployedSha, behindBy, deployedAt, now } = input;

  if (!deployedSha || behindBy === null) {
    return {
      state: 'unknown',
      summary: 'Production release could not be determined, so drift from main is unknown.',
      red: null,
      ageHours: null,
    };
  }

  const ageHours =
    deployedAt === null ? null : Math.max(0, (now.getTime() - new Date(deployedAt).getTime()) / 3_600_000);
  const short = deployedSha.slice(0, 7);

  if (behindBy <= 0) {
    return {
      state: 'current',
      summary: `Production is running ${short}, level with main.`,
      red: null,
      ageHours,
    };
  }

  const agePhrase = ageHours === null ? '' : `, deployed ${plural(Math.round(ageHours), 'hour')} ago`;
  const isStale =
    (ageHours !== null && ageHours >= STALE_AFTER_HOURS) || behindBy >= STALE_AFTER_COMMITS;

  if (!isStale) {
    return {
      state: 'behind',
      summary: `Production is running ${short}, ${plural(behindBy, 'commit')} behind main${agePhrase}.`,
      red: null,
      ageHours,
    };
  }

  return {
    state: 'stale',
    summary: `Production is running ${short}, ${plural(behindBy, 'commit')} behind main${agePhrase}.`,
    // Named as an action, and it says why it matters: this is the sentence that
    // should stop someone from triaging an already-fixed bug as a live one.
    red: `Production is ${plural(behindBy, 'commit')} behind main${agePhrase} — a merged fix may not be live yet`,
    ageHours,
  };
}

/**
 * Resolve freshness against GitHub. FAIL-SOFT: every failure path returns the
 * `unknown` state rather than asserting `current`, because "we could not check"
 * and "production is up to date" must never render as the same sentence.
 *
 * `VERCEL_GIT_COMMIT_SHA` is the sha of the running deployment, and this runs
 * inside that deployment, so it needs no API token to know what production is.
 */
export async function fetchDeployFreshness(now: Date = new Date()): Promise<DeployFreshness> {
  const deployedSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!deployedSha) {
    return classifyDeployFreshness({ deployedSha: undefined, behindBy: null, deployedAt: null, now });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/njrini99-code/helmv3/compare/${deployedSha}...main`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      return classifyDeployFreshness({ deployedSha: undefined, behindBy: null, deployedAt: null, now });
    }
    const json = (await res.json()) as {
      ahead_by?: unknown;
      base_commit?: { commit?: { committer?: { date?: unknown } } };
    };
    // `ahead_by` on `base...head` counts commits HEAD (main) has that base
    // (production) lacks — i.e. exactly how far behind production is.
    const behindBy = typeof json.ahead_by === 'number' ? json.ahead_by : null;
    const rawDate = json.base_commit?.commit?.committer?.date;
    const deployedAt = typeof rawDate === 'string' ? rawDate : null;
    return classifyDeployFreshness({ deployedSha, behindBy, deployedAt, now });
  } catch {
    return classifyDeployFreshness({ deployedSha: undefined, behindBy: null, deployedAt: null, now });
  }
}
