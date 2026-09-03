import { Eyebrow, Surface } from '@/components/fairway';
import { fetchOverviewSnapshot } from '@/lib/admin/data/overview';
import { cachedIncidentBoard } from '@/lib/admin/incidents/fetch';
import { DEFAULT_INCIDENT_WINDOW_HOURS } from '@/lib/admin/data/incident-feed';
import { cachedSelfHealBoard } from '@/lib/admin/data/selfheal';
import { cachedBriefing } from '@/lib/admin/data/briefing';
import { cachedDeployFreshness } from '@/lib/admin/deploy-freshness';
import { getProductionDeployAt } from '@/lib/admin/auto-resolve';
import { selectAttention, type AttentionInput } from '@/lib/admin/incidents/attention';
import { canClaimAllClear } from '@/lib/admin/incidents/sources';
import { summarizeFlow } from '@/lib/admin/selfheal-flow';
import { fetchHeldMigrations } from '@/lib/admin/command-deck/held-migrations';
import { derivePostureSentence } from '@/lib/admin/command-deck/posture';
import { buildSystemOrbit } from '@/lib/admin/command-deck/orbit';
import { buildCircuitSummary } from '@/lib/admin/command-deck/selfheal-circuit';
import { buildReleaseWake } from '@/lib/admin/command-deck/release-wake';
import { buildDecisionInbox } from '@/lib/admin/command-deck/decisions';
import { PostureSentenceBanner } from './PostureSentence';
import { SystemOrbit } from './SystemOrbit';
import { AttentionStack, type AttentionStackImpact } from './AttentionStack';
import { DecisionInboxSummary } from './DecisionInboxSummary';
import { ReleaseWakeRibbon } from './ReleaseWakeRibbon';
import { SelfHealCircuitSummary } from './SelfHealCircuitSummary';

const ATTENTION_STACK_LIMIT = 5;

/**
 * HELM COMMAND DECK (brief §10) — the upper 40-50% of `/admin`.
 *
 * A single composition, not six independently-fetching panels. Every
 * upstream read this deck uses (`cachedIncidentBoard`, `cachedSelfHealBoard`,
 * `cachedBriefing`, `cachedDeployFreshness`, `getProductionDeployAt`,
 * `fetchHeldMigrations`) is already fail-soft at the data layer — none of
 * them throw; a source that could not be read resolves to an honest
 * `'unknown'`/`null`/`blind` value, which is exactly what every read model in
 * `src/lib/admin/command-deck/*` is built to degrade on (see each file's own
 * header for its "unknown never healthy" contract). "One provider failure
 * never blanks the page" therefore holds at the data layer, not by splitting
 * this into per-panel Suspense boundaries — which would buy nothing here
 * anyway, since every visual reads from the SAME shared fetch and none of
 * them can resolve independently of the others. The page still wraps this
 * whole component in one `PanelBoundary` (render-time errors), matching how
 * `MissionTruthStrip` below it is wrapped.
 *
 * `fetchOverviewSnapshot` (only for its `kpis.activeUsersToday`, feeding the
 * orbit's Users node) is the one upstream call here NOT independently
 * verified fail-soft by this task — it is `page.tsx`'s existing KPI-strip
 * fetch, called unguarded there today, so the risk profile is identical to
 * what already ships; this deck's own `PanelBoundary` is the same safety net
 * `page.tsx`'s panels already rely on if it ever does throw.
 *
 * All five of `cachedIncidentBoard`/`cachedSelfHealBoard`/`cachedBriefing`/
 * `cachedDeployFreshness`/`fetchOverviewSnapshot` are React `cache()`-memoised
 * per request, so calling them here costs nothing extra against `page.tsx`'s
 * other panels that call the same functions — including avoiding a second
 * live GitHub-API round trip and a second 11-Supabase-read/Vercel/Sentry
 * sweep beyond what `page.tsx` already triggers.
 */
export async function CommandDeck() {
  const now = Date.now();
  const [board, selfHeal, briefing, deploy, productionDeploy, heldMigrations, overview] = await Promise.all([
    cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS),
    cachedSelfHealBoard(),
    cachedBriefing(),
    cachedDeployFreshness(),
    getProductionDeployAt(now),
    fetchHeldMigrations(),
    // `fetchOverviewSnapshot` is ALSO React `cache()`-memoised per request
    // (`data/overview.ts`) — calling it here does not re-run its 11 parallel
    // Supabase reads + Vercel API + Sentry sweep, it returns the same
    // memoised result `page.tsx`'s KPI strip already triggered on this
    // request. This is what lets the Users orbit node show a real count
    // instead of a permanent 'unknown'.
    fetchOverviewSnapshot(),
  ]);

  const selfHealData = selfHeal.status === 'ok' ? selfHeal.data : null;
  const selfHealReadable = selfHealData !== null;
  const flow = summarizeFlow(board.incidents, now);
  const selfHealFlowing = flow.stages.some((s) => s.state === 'flowing');
  const selfHealStalled = flow.stalled > 0;

  const attentionInput: AttentionInput = {
    incidents: board.incidents,
    stages: selfHealData?.stages ?? [],
    coverage: board.coverage,
    now,
    briefing: briefing.items,
  };
  const attentionAll = selectAttention(attentionInput, Number.MAX_SAFE_INTEGER);
  const attentionTop = attentionAll.slice(0, ATTENTION_STACK_LIMIT);
  // "All clear" is a claim this deck makes about THREE independent sources —
  // incident coverage, the platform briefing, AND the self-heal board.
  // `stages: []` above means an unreadable self-heal board can never
  // contribute a `stage-dead` row (we genuinely don't know if a stage is
  // dead), which would otherwise let an empty `attentionAll` slip through
  // as "nothing needs attention" even though a whole evidence source was
  // never read. Gating on `selfHealReadable` here is what stops that —
  // the Attention Stack falls back to "could not fully compute" instead.
  const allClear = canClaimAllClear(board.coverage) && briefing.degradedChecks.length === 0 && selfHealReadable;

  const impactByKey = new Map<string, AttentionStackImpact>(
    board.incidents.map((i) => [i.id, { affectedUsers: i.affectedUsers, affectedUsersKnown: i.affectedUsersKnown }]),
  );

  const decisionInbox = buildDecisionInbox({ attentionRows: attentionAll, heldMigrations, now });

  // Excludes `isFixture` incidents the same way `release-wake.ts`'s own
  // `active` filter does — a demo/fixture row's analysis timestamp is not a
  // real self-heal action and must never inflate this count.
  const selfHealActionsSinceDeploy =
    productionDeploy.deployAt === null
      ? 0
      : board.incidents.filter(
          (i) =>
            !i.isFixture &&
            i.analysis !== null &&
            Date.parse(i.analysis.generatedAt) >= (productionDeploy.deployAt as number),
        ).length;

  // Computed before the posture sentence so both surfaces agree on the same
  // release-watch verdict from the same evidence, rather than deriving it
  // twice and risking two different opinions on one page.
  const wake = buildReleaseWake({
    incidents: board.incidents,
    releaseSha: productionDeploy.deploySha,
    deployedAtMs: productionDeploy.deployAt,
    sourceCoverageBlind: board.coverage.anyBlind,
    now,
    selfHealActionsSinceDeploy,
  });

  const posture = derivePostureSentence({
    topAttention: attentionAll[0] ?? null,
    attentionTotal: attentionAll.length,
    canClaimAllClear: allClear,
    evidenceBlind: board.coverage.anyBlind,
    blindSources: board.coverage.blindSources,
    selfHealActing: selfHealReadable ? selfHealFlowing : null,
    releaseWatch: wake.watchState,
    releaseSha: productionDeploy.deploySha,
    decisionCount: decisionInbox.readable ? decisionInbox.total : null,
    now,
  });

  const orbit = buildSystemOrbit({
    incidents: board.incidents,
    freshness: board.freshness,
    deployFreshness: deploy,
    activeUsersToday: overview.kpis.activeUsersToday,
    selfHealFlowing,
    selfHealStalled,
    selfHealReadable,
    now,
  });

  const circuit = buildCircuitSummary({
    incidents: board.incidents,
    flow,
    stageDetails: selfHealData?.stages ?? null,
    verdict: selfHealData?.verdict ?? null,
    now,
  });

  return (
    <div className="space-y-4">
      <PostureSentenceBanner posture={posture} />

      <Surface as="section" padding="sm" aria-label="Helm System Orbit">
        <Eyebrow as="h2" tone="secondary" className="mb-2">
          Helm System Orbit
        </Eyebrow>
        <SystemOrbit snapshot={orbit} />
      </Surface>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface as="section" padding="sm" aria-label="Attention stack">
          <Eyebrow as="h2" tone="tertiary" className="mb-2">
            Attention Stack
          </Eyebrow>
          <AttentionStack
            rows={attentionTop}
            total={attentionAll.length}
            checkedAt={board.computedAt}
            canClaimAllClear={allClear}
            impactByKey={impactByKey}
          />
        </Surface>
        <Surface as="section" padding="sm" aria-label="Decision inbox">
          <Eyebrow as="h2" tone="tertiary" className="mb-2">
            Decision Inbox
          </Eyebrow>
          <DecisionInboxSummary summary={decisionInbox} checkedAt={board.computedAt} />
        </Surface>
      </div>

      <Surface as="section" padding="sm" aria-label="Release wake">
        <Eyebrow as="h2" tone="tertiary" className="mb-2">
          Release Wake
        </Eyebrow>
        <ReleaseWakeRibbon wake={wake} />
      </Surface>

      <Surface as="section" padding="sm" aria-label="Self-heal circuit">
        <Eyebrow as="h2" tone="tertiary" className="mb-2">
          Self-Heal Circuit
        </Eyebrow>
        <SelfHealCircuitSummary summary={circuit} />
      </Surface>
    </div>
  );
}

