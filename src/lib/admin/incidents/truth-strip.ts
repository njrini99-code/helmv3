/**
 * The System Truth Strip — five cells that answer "can I trust this screen?"
 * before the screen says anything else.
 *
 * WHY IT IS A SEPARATE, PURE MODULE. Every cell states a value, a state, and a
 * FRESHNESS, and the freshness is the part that keeps getting dropped. A KPI
 * without an age is a claim about the present made from data of unknown
 * vintage — which is how a Bridge with a three-hour-old collector and a
 * live Sentry pull came to render both as equally current. Building the cells
 * here, from already-fetched inputs, means the rule is enforced by the type
 * rather than by whoever writes the next panel: a cell CANNOT be constructed
 * without saying how old it is and where it came from.
 *
 * Pure on purpose. Every input is data another module already fetched, so the
 * strip is unit-testable against a blind Sentry, a dead loop and an unreadable
 * deploy without a database, a network, or a clock.
 */

import type { DeployFreshness } from '@/lib/admin/deploy-freshness';
import type { CoverageSummary } from './sources';
import type { StateTone, UnifiedIncident } from './types';

/**
 * One cell. `state` is the word that renders next to the colour — colour is
 * never the only channel — and `freshness` is mandatory, not optional. A cell
 * that genuinely has no age says so in words ("age unknown") rather than
 * omitting the line, because a missing freshness reads as "current".
 */
export interface TruthCell {
  id: 'production' | 'incidents' | 'self-heal' | 'observation' | 'repair';
  /** Column heading — short, uppercase at render time. */
  label: string;
  /** The number or short string that leads the cell. */
  value: string;
  /** The qualifying state word. Never a colour alone. */
  state: string;
  tone: StateTone;
  /** How old the evidence behind `value` is, in words. Never omitted. */
  freshness: string;
  /** Where the value came from, so a reader can go check it. */
  source: string;
  /** Where tapping the cell goes. Null when there is nowhere useful. */
  href: string | null;
  /** Longer explanation for the disclosure. */
  detail: string;
}

export interface TruthStripInput {
  incidents: readonly UnifiedIncident[];
  coverage: CoverageSummary;
  deploy: DeployFreshness;
  /** Deploy id, when the Vercel read produced one. */
  deploymentId: string | null;
  /** Self-heal loop verdict — runtime and capability folded to one word. */
  loop: { tone: 'ok' | 'warning' | 'danger' | 'unknown'; label: string; detail: string } | null;
  /** Age of the self-heal reading in ms, or null when unknown. */
  loopAgeMs: number | null;
  computedAt: string;
  now: number;
}

/** Milliseconds → the shortest honest phrase. `null` is a WORD, not a blank. */
export function ageWords(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return 'age unknown';
  if (ms < 0) return 'age unknown';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const LOOP_TONE_TO_STATE: Readonly<Record<'ok' | 'warning' | 'danger' | 'unknown', StateTone>> = {
  ok: 'success',
  warning: 'warning',
  danger: 'danger',
  unknown: 'neutral',
};

const DEPLOY_TONE: Readonly<Record<DeployFreshness['state'], StateTone>> = {
  // `current` is the one genuinely verified-good state here: production has
  // everything on main and we could establish that. `behind` is the normal
  // resting state of a repo that promotes deliberately — warning, not danger,
  // because a strip that is red every morning is one nobody reads by week two.
  current: 'success',
  behind: 'warning',
  stale: 'danger',
  unknown: 'neutral',
};

/**
 * Build the five cells.
 *
 * The counting rules here are the ones the whole redesign turns on:
 *
 *   INCIDENTS counts what the Incidents tab LISTS by default — actionable and
 *   not closed. A number in permanent chrome that disagrees with the screen it
 *   links to is worse than no number at all, which is the failure
 *   `incident-count-agreement.test.ts` exists to pin.
 *
 *   REPAIR counts work, not rows: repairable incidents with nobody on them,
 *   open repair PRs, and fixes that shipped but are not yet proven. Those three
 *   are different asks of an operator and the cell says all three rather than
 *   summing them into one meaningless total.
 *
 *   OBSERVATION never renders an all-clear while a source is blind.
 */
export function buildTruthStrip(input: TruthStripInput): TruthCell[] {
  const { incidents, coverage, deploy, loop, now } = input;

  const actionable = incidents.filter(
    (i) => i.actionable && i.lifecycle.state !== 'resolved' && i.lifecycle.state !== 'not-a-defect',
  );
  const regressions = incidents.filter((i) => i.lifecycle.state === 'regressed');
  const critical = actionable.filter((i) => i.severity === 'critical');

  const repairable = incidents.filter((i) => i.lifecycle.state === 'repairable');
  const prsOpen = new Set(
    incidents
      .filter((i) => i.repair?.status === 'pr-open' || i.repair?.status === 'pr-failed')
      .map((i) => i.repair?.prNumber)
      .filter((n): n is number => typeof n === 'number'),
  );
  const awaitingProof = incidents.filter(
    (i) => i.lifecycle.state === 'awaiting-proof' || i.lifecycle.state === 'awaiting-deploy',
  );
  const repairUnknown = incidents.some((i) => i.repair?.status === 'unknown');

  const boardAge = now - Date.parse(input.computedAt);

  const production: TruthCell = {
    id: 'production',
    label: 'Production',
    value: deploy.summary.match(/running ([0-9a-f]{7,40})/i)?.[1] ?? 'unknown',
    state:
      deploy.state === 'current'
        ? 'LEVEL WITH MAIN'
        : deploy.state === 'unknown'
          ? 'UNKNOWN'
          : deploy.state.toUpperCase(),
    tone: DEPLOY_TONE[deploy.state],
    freshness:
      deploy.ageHours === null ? 'age unknown' : ageWords(deploy.ageHours * 3_600_000),
    source: input.deploymentId ? `Vercel · ${input.deploymentId.slice(0, 12)}` : 'Vercel',
    href: '/admin/deploys',
    detail: deploy.summary,
  };

  const incidentsCell: TruthCell = {
    id: 'incidents',
    label: 'Incidents',
    value: `${actionable.length}`,
    state:
      critical.length > 0
        ? 'CRITICAL OPEN'
        : regressions.length > 0
          ? 'REGRESSION'
          : actionable.length === 0
            ? // Not "ALL CLEAR". A zero under a blind source is a claim the
              // system is not entitled to make — see `canClaimAllClear`.
              coverage.anyBlind
              ? 'NONE IN READABLE SOURCES'
              : 'ALL CLEAR'
            : 'ACTIONABLE',
    tone:
      critical.length > 0 || regressions.length > 0
        ? 'danger'
        : actionable.length === 0
          ? coverage.anyBlind
            ? 'warning'
            : 'success'
          : 'warning',
    freshness: ageWords(Number.isFinite(boardAge) ? boardAge : null),
    source: 'App + Sentry + Reliability',
    href: '/admin/errors',
    detail:
      `${actionable.length} actionable · ${regressions.length} regression${regressions.length === 1 ? '' : 's'}` +
      ` · ${critical.length} critical` +
      (coverage.anyBlind
        ? ` — counted from readable sources only; ${coverage.blindSources.join(', ')} could not be read.`
        : ''),
  };

  const selfHeal: TruthCell = loop
    ? {
        id: 'self-heal',
        label: 'Self-heal',
        value: loop.label,
        state: loop.tone === 'ok' ? 'PROVEN' : loop.tone.toUpperCase(),
        tone: LOOP_TONE_TO_STATE[loop.tone],
        freshness: ageWords(input.loopAgeMs),
        source: 'background_job_logs',
        href: '/admin/self-heal',
        detail: loop.detail,
      }
    : {
        id: 'self-heal',
        label: 'Self-heal',
        value: 'unknown',
        state: 'UNREADABLE',
        tone: 'neutral',
        freshness: 'age unknown',
        source: 'background_job_logs',
        href: '/admin/self-heal',
        detail: 'The self-healing stage heartbeats could not be read, so the loop cannot be judged.',
      };

  const observation: TruthCell = {
    id: 'observation',
    label: 'Observation',
    value: `${coverage.reading}/${coverage.total}`,
    state:
      coverage.total === 0
        ? 'UNKNOWN'
        : coverage.anyBlind
          ? 'BLIND SOURCE'
          : coverage.partial > 0
            ? 'PARTIAL'
            : coverage.unknown > 0
              ? 'INCOMPLETE'
              : 'READING',
    tone:
      coverage.total === 0
        ? 'neutral'
        : coverage.anyBlind
          ? 'danger'
          : coverage.partial > 0 || coverage.unknown > 0
            ? 'warning'
            : 'success',
    freshness: ageWords(coverage.oldestAgeMs),
    source: 'Sentry · Supabase · Vercel · App',
    href: '/admin/reliability',
    detail: coverage.anyBlind
      ? `Blind: ${coverage.blindSources.join(', ')}. Counts on this page are from readable sources only.`
      : `${coverage.reading} reading, ${coverage.partial} partial, ${coverage.unknown} unknown.`,
  };

  const repair: TruthCell = {
    id: 'repair',
    label: 'Repair queue',
    value: `${repairable.length}`,
    // A repair lookup that FAILED is not an empty queue. Saying "0 ready" when
    // GitHub was unreachable is the move that re-queues work already in a
    // branch.
    state: repairUnknown
      ? 'LOOKUP FAILED'
      : repairable.length === 0 && prsOpen.size === 0
        ? 'IDLE'
        : 'READY',
    tone: repairUnknown ? 'neutral' : repairable.length > 0 ? 'accent' : 'neutral',
    freshness: ageWords(Number.isFinite(boardAge) ? boardAge : null),
    source: 'GitHub pull requests',
    href: '/admin/errors?lens=repairable',
    detail:
      `${repairable.length} repairable · ${prsOpen.size} PR${prsOpen.size === 1 ? '' : 's'} open · ` +
      `${awaitingProof.length} awaiting proof` +
      (repairUnknown ? ' — the pull-request lookup failed, so repair state is incomplete.' : ''),
  };

  return [production, incidentsCell, selfHeal, observation, repair];
}
