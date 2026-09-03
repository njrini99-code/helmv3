'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Sparkles, GitPullRequest, CloudOff, CheckCheck, ChevronRight, FlaskConical } from 'lucide-react';
import { Button, Sparkline } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  LIFECYCLE_LABEL,
  LIFECYCLE_TONE,
  INCIDENT_SOURCE_LABEL,
  SOURCE_HEALTH_LABEL,
  type UnifiedIncident,
  type IncidentSourceEvidence,
  type IncidentLifecycleState,
  type LifecycleReasonLine,
} from '@/lib/admin/incidents/types';
import { FEATURE_REGISTRY } from '@/lib/admin/feature-registry';
import { INCIDENT_CLASS_LABEL } from '@/lib/admin/incident-classification';
import { RCA_CATEGORY_LABEL } from '@/lib/admin/rca-category';
import { describeErrorCode } from '@/lib/admin/error-code-hint';
import { deriveIncidentFlow, FLOW_STAGE_TITLE } from '@/lib/admin/selfheal-flow';
import type { IncidentPresentation } from '@/lib/admin/incidents/present';
import type { IncidentGenome } from '@/lib/admin/incidents/genome';
import type { ReleaseRelationshipVerdict } from '@/lib/admin/incidents/release-context';
import { SourceConfidenceRing, ReleaseRelationshipLabel, EpisodeTimelineStrip } from '@/components/admin/premium';
import { routeLabel } from './IncidentCard';
import { LocalTime } from './LocalTime';
import { CopyReportButton } from './CopyReportButton';
import { ProofDots } from './ProofDots';
import { RailRow, RowHead, FactLine, RowPath, RowFoot, StateChip } from './Row';

/**
 * ONE incident, from the unified read model — the single card every Bridge
 * lens (`IncidentLensRail`) now renders, replacing the split where Errors and
 * Reliability each drew their own row for what was sometimes the same fault.
 * `src/lib/admin/incidents/types.ts` carries the full case for why that split
 * existed and why it had to go; this file is the one place that reconciled
 * shape actually reaches a screen.
 *
 * This is `IncidentCard.tsx` upgraded, not replaced — every decision that
 * card recorded still holds and is repeated here rather than re-argued:
 *
 *   1. TITLE FIRST. Severity is a rail, never a leading pill — see
 *      `RailRow`/`Row.tsx`'s own header for the measurement behind that.
 *   2. THE ROW IDENTIFIES ITSELF via a quiet mono `FactLine`, not a run-on
 *      sentence and not a wall of attribute chips.
 *   3. THE ROUTE RENDERS AS A PATH — `routeLabel` is imported from
 *      `IncidentCard`, not copied, so the origin-stripping logic has exactly
 *      one definition.
 *   4. CHIPS ARE FOR STATE ONLY, never attributes, and colour never carries a
 *      claim alone — every chip here also carries a word.
 *
 * What is actually new, because the unified model carries more than a
 * `TriageItem` did:
 *
 *   A. A LIFECYCLE CHIP, not a scattered `substatus`/`klass` pair. One state,
 *      one label, one tone — `LIFECYCLE_LABEL` / `LIFECYCLE_TONE` are the
 *      shared vocabulary so this card and the detail drawer cannot describe
 *      the same incident two different ways.
 *   B. THE STATE ROW IS ITS OWN LINE, separate from the footer controls. The
 *      old card grew its chip strip inside `RowFoot`, which is also where the
 *      resolve/copy controls live; once a corroboration chip, an RCA door and
 *      a PR chip are all real possibilities at once, chips start competing
 *      with the click targets next to them. Given its own line, capped at 5,
 *      highest-value first — a card that could grow twelve badges reads as
 *      confetti, not hierarchy, so the rest defer to the detail route.
 *   C. THE PROOF-GAP LINE. `deployProof`/`resolution` alone cannot say WHY an
 *      incident that looks fixed is still open — "iOS calls since deploy: 4"
 *      is the actual answer, and burying it behind a click loses the one
 *      detail that makes the in-between states legible. It renders verbatim,
 *      never truncated to its category label.
 *   D. GREEN IS EARNED. `LIFECYCLE_TONE.resolved` is the only `success` tone
 *      in the whole union, precisely so `merged` / `awaiting-*` — which only
 *      mean the process ran, not that the fault stopped — cannot borrow it.
 *      `Row.tsx`'s `StateChip` has no `success` tone (by design: "colour
 *      means severity," and until this card nothing needed to say "verified
 *      true"). Row.tsx is read-only for this card, so `LifecycleChip` below
 *      renders that one missing case itself, using the exact class shape
 *      `StateChip` already uses and the `fw-success` token pairing
 *      `Row.tsx`'s own `RAIL`/`SEVERITY_INK` tables reserve for verified-good
 *      semantics — one extra branch, not a second implementation of the row
 *      language.
 *
 * And, since 2026-09-01, three things an operator asked for by name:
 *
 *   E. A FEATURE TAG that reads as a product area, not a registry key. The
 *      key was already in the fact line as `round_tracking`; the tag says
 *      "Round Tracking" and says "untagged" out loud when the error was
 *      logged without one, because an untagged error counts against no
 *      feature's health and that is worth seeing on the row.
 *   F. THE LIFECYCLE HEADLINE — the one sentence `lifecycle.ts` writes to
 *      explain the chip ("Seen recently — Diagnose has not had a chance to
 *      analyse it yet."). It rendered only on the detail page; a chip an
 *      operator cannot interrogate is a chip they stop believing.
 *   G. A DETAILS DISCLOSURE, closed by default, with what the row already
 *      knows and did not show: first and last seen, every source and its
 *      health, the error code with a plain-language hint, the analysis, the
 *      repair, and the ordered checks behind the lifecycle state. The scan
 *      stays dense; the detail is one tap away instead of one page away.
 */

/**
 * `Row.tsx`'s `StateChip` intentionally has no `success` tone. Only
 * `resolved` needs one — every other `LIFECYCLE_TONE` value is a tone
 * `StateChip` already renders, so those are handed straight through.
 */
function LifecycleChip({ state }: { state: IncidentLifecycleState }) {
  const tone = LIFECYCLE_TONE[state];
  if (tone === 'success') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-fw-success-bg px-1.5 py-0.5 text-eyebrow uppercase leading-4 text-fw-success-ink">
        {LIFECYCLE_LABEL[state]}
      </span>
    );
  }
  return <StateChip tone={tone}>{LIFECYCLE_LABEL[state]}</StateChip>;
}

/**
 * The one source this row names inline. `app` leads when present because it
 * is this application's own witness; otherwise the first source that could
 * actually be read this refresh, so a blind source never gets credited with
 * having "seen" anything. The remaining sources aren't dropped — the
 * corroboration chip and the source-coverage surfaces elsewhere carry them —
 * this just stops the same fault being named four times on one line.
 */
function primarySource(sources: readonly IncidentSourceEvidence[]): IncidentSourceEvidence | undefined {
  return sources.find((s) => s.source === 'app') ?? sources.find((s) => s.health !== 'blind') ?? sources[0];
}

/**
 * `affectedUsers === 0` means "no KNOWN identity" for app-origin incidents —
 * often a pre-auth failure, not an unaffected one — which is exactly what
 * `affectedUsersKnown` already encodes on the unified model. Unlike
 * `IncidentCard`'s `affectedUsersLabel`, there is no `origin` to re-derive
 * this from here; the flag travels with the incident instead.
 */
function affectedUsersLabel(incident: Pick<UnifiedIncident, 'affectedUsers' | 'affectedUsersKnown'>): string {
  if (!incident.affectedUsersKnown) return 'unknown user';
  const n = incident.affectedUsers;
  return `${n} user${n === 1 ? '' : 's'}`;
}

/** Registry key -> label, built once. A key the registry does not know
 *  renders as itself, dashed — visible, not laundered into a real label. */
const FEATURE_LABEL: ReadonlyMap<string, string> = new Map(FEATURE_REGISTRY.map((f) => [f.key, f.label]));

const SPORT_LABEL: Readonly<Record<NonNullable<UnifiedIncident['sport']>, string>> = {
  golf: 'Golf',
  baseball: 'Baseball',
  shared: 'Shared',
};

/**
 * A labelled attribute tag. NOT a `StateChip`: chips are for state and are
 * capped at five; this is the row saying which product area it belongs to,
 * at the lowest weight that still reads as a tag. Lowercase, rounded-full,
 * no colour — everything a state chip is not.
 */
function Tag({
  label,
  value,
  title,
  muted = false,
}: {
  label: string;
  value: string;
  title?: string;
  muted?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption leading-4',
        muted ? 'border border-dashed border-warm-300 text-warm-500' : 'bg-warm-100 text-warm-700',
      )}
    >
      <span className="text-warm-500">{label}</span>
      <span className={cn(!muted && 'font-medium')}>{value}</span>
    </span>
  );
}

const REASON_INK: Readonly<Record<LifecycleReasonLine['status'], string>> = {
  met: 'text-fw-success-ink',
  pending: 'text-fw-warning-ink',
  failed: 'text-fw-danger-ink',
};

const REASON_WORD: Readonly<Record<LifecycleReasonLine['status'], string>> = {
  met: 'met',
  pending: 'pending',
  failed: 'failed',
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-eyebrow uppercase tracking-wide text-warm-500">{label}</dt>
      <dd className="break-words text-caption leading-5 text-warm-800 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/**
 * Everything the row already carries and did not show, one tap away.
 *
 * A native `<details>`, so it works with no JavaScript, costs nothing while
 * closed, and does not turn a list of thirty rows into thirty controlled
 * components. Nothing in here is fetched — every field is already on the
 * `UnifiedIncident` the card was handed.
 *
 * ONLY WHAT THE ROW DOES NOT ALREADY SAY. The route, the action, the event
 * count and the user count are on the row above this; repeating them here
 * would make the disclosure read as a summary rather than as depth, and
 * doubles every string a test or a screen reader has to disambiguate.
 */
function IncidentDetails({ incident }: { incident: UnifiedIncident }) {
  const codeHint = describeErrorCode(incident.errorCode);
  const analysis = incident.analysis;
  const repair = incident.repair;

  return (
    <details className="group mt-1.5">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-caption text-accent-700 hover:underline [&::-webkit-details-marker]:hidden">
        <ChevronRight size={12} aria-hidden className="transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        Details
      </summary>
      <div className="mt-2 space-y-3 rounded-fw-md bg-surface-sunken p-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Fact label="First seen">
            <LocalTime iso={incident.firstSeen} variant="datetime" />
          </Fact>
          <Fact label="Last seen">
            <LocalTime iso={incident.lastSeen} variant="datetime" />
          </Fact>
          <Fact label="Error code">
            {incident.errorCode ? (
              <>
                <span className="font-fw-mono">{incident.errorCode}</span>
                {codeHint ? <span className="text-warm-600"> · {codeHint}</span> : null}
              </>
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="Kind">
            {INCIDENT_CLASS_LABEL[incident.klass]}
            <span className="text-warm-600"> · {incident.klassReason}</span>
          </Fact>
          <Fact label="Seen by">
            {incident.sources.length === 0
              ? '—'
              : incident.sources.map((s, i) => (
                  <span key={s.source}>
                    {i > 0 ? ', ' : ''}
                    {s.permalink ? (
                      <a href={s.permalink} target="_blank" rel="noreferrer" className="underline">
                        {INCIDENT_SOURCE_LABEL[s.source]}
                      </a>
                    ) : (
                      INCIDENT_SOURCE_LABEL[s.source]
                    )}
                    <span className="text-warm-500"> ({SOURCE_HEALTH_LABEL[s.health].toLowerCase()})</span>
                  </span>
                ))}
          </Fact>
        </dl>

        {analysis ? (
          <div>
            <p className="text-eyebrow uppercase tracking-wide text-warm-500">Analysis</p>
            <p className="mt-0.5 text-caption leading-5 text-warm-800">
              <span className="font-medium">{RCA_CATEGORY_LABEL[analysis.category]}</span>
              <span className="text-warm-600">
                {' '}
                · confidence {analysis.confidence} · {analysis.model} ·{' '}
                <LocalTime iso={analysis.generatedAt} variant="datetime" />
              </span>
            </p>
            <p className="mt-1 break-words text-caption leading-5 text-warm-700 [overflow-wrap:anywhere]">
              {analysis.probableCause}
            </p>
            <p className="mt-1 break-words font-fw-mono text-caption leading-5 text-warm-600 [overflow-wrap:anywhere]">
              {analysis.suggestedFix}
            </p>
          </div>
        ) : null}

        {repair && repair.status !== 'none' ? (
          <div>
            <p className="text-eyebrow uppercase tracking-wide text-warm-500">Repair</p>
            <p className="mt-0.5 text-caption leading-5 text-warm-800">
              {repair.prUrl && repair.prNumber ? (
                <a href={repair.prUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                  PR #{repair.prNumber}
                </a>
              ) : (
                <span className="font-medium">{repair.prNumber ? `PR #${repair.prNumber}` : 'No PR yet'}</span>
              )}
              <span className="text-warm-600"> · {repair.status}</span>
              {repair.checks ? (
                <span className="text-warm-600">
                  {' '}
                  · checks {repair.checks.passed} passed, {repair.checks.failed} failed, {repair.checks.pending} pending
                </span>
              ) : (
                <span className="text-warm-600"> · checks could not be read</span>
              )}
              {repair.note ? <span className="text-warm-600"> · {repair.note}</span> : null}
            </p>
          </div>
        ) : null}

        <div>
          <p className="text-eyebrow uppercase tracking-wide text-warm-500">
            Why &ldquo;{LIFECYCLE_LABEL[incident.lifecycle.state]}&rdquo;
          </p>
          <ul className="mt-1 space-y-1">
            {incident.lifecycle.because.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-caption leading-5 text-warm-700">
                <span className={cn('w-14 shrink-0 font-fw-mono font-semibold uppercase', REASON_INK[line.status])}>
                  {REASON_WORD[line.status]}
                </span>
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{line.text}</span>
              </li>
            ))}
            {incident.lifecycle.because.length === 0 ? (
              <li className="text-caption text-warm-500">No checks were recorded for this state.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </details>
  );
}

export function UnifiedIncidentCard({
  incident,
  series,
  onResolve,
  error,
  /**
   * Phase 0's plain-English projection (`present.ts`) for THIS incident,
   * when the caller has already resolved it — the board computes one per
   * incident (`IncidentBoard.presentations`), so this is always available
   * from `UnifiedIncidentQueue` in practice. Optional so this card keeps
   * working, unchanged, for a caller that has not been updated yet: without
   * it, the row falls straight back to `incident.description`, exactly the
   * pre-Phase-1 behavior.
   */
  presentation,
  /** Phase 1's per-incident Genome (`genome.ts`) — evidence coverage and the
   *  episode timeline. Optional for the same reason as `presentation`. */
  genome,
  /** This incident's relationship to the current production release
   *  (`release-watch.ts`), when a Release Watch could be computed. `null`
   *  when release data was unavailable — rendered as its own hatched
   *  "release relationship unknown" state, never silently omitted, so an
   *  operator can tell "no release context yet" apart from "not shown". */
  releaseRelationship,
}: {
  incident: UnifiedIncident;
  series: number[] | null;
  onResolve?: (incident: UnifiedIncident) => void;
  error?: string;
  presentation?: IncidentPresentation;
  genome?: IncidentGenome;
  releaseRelationship?: ReleaseRelationshipVerdict | null;
}) {
  const path = routeLabel(incident.route);
  const primary = primarySource(incident.sources);
  const anyBlind = incident.sources.some((s) => s.health === 'blind');
  // Against the board's own clock, not `Date.now()`: this is a client
  // component, and a stall verdict that flips between server and client
  // render is a hydration mismatch wearing a warning chip. `computedAt` is
  // the instant every other fact on this card was true at.
  const flow = deriveIncidentFlow(incident, Date.parse(incident.computedAt));

  const featureLabel = incident.featureId ? (FEATURE_LABEL.get(incident.featureId) ?? null) : null;

  // Priority order, highest-value first — see the header for why this is
  // capped rather than open-ended.
  const chips: Array<{ key: string; node: ReactNode }> = [];

  chips.push({ key: 'lifecycle', node: <LifecycleChip state={incident.lifecycle.state} /> });

  // Second, ahead of everything below: a seeded QA fixture round changes how
  // every other fact on this card should be read — occurrences, affected
  // users, the lifecycle state itself — so it leads, not trails. See
  // src/lib/admin/qa-fixture-rounds.ts (catalogued defect (h)).
  if (incident.isFixture) {
    chips.push({
      key: 'fixture',
      node: (
        <StateChip tone="neutral" title="This incident traces to a seeded QA fixture round, not a production defect">
          <FlaskConical size={10} aria-hidden />
          FIXTURE
        </StateChip>
      ),
    });
  }

  // Third, ahead of corroboration: the lifecycle chip says WHERE the
  // incident is, this one says the loop has had its chances there and not
  // moved it — the fact that changes what an operator does next.
  if (flow.stalled && flow.stageId !== null) {
    chips.push({
      key: 'stalled',
      node: (
        <StateChip tone="warning" title={flow.why}>
          {`STALLED · ${FLOW_STAGE_TITLE[flow.stageId].toUpperCase()}`}
        </StateChip>
      ),
    });
  }

  if (incident.corroboration >= 2) {
    chips.push({
      key: 'corroboration',
      node: (
        <StateChip tone="neutral" title="Independent sources that witnessed this incident">
          {`${incident.corroboration} SOURCES`}
        </StateChip>
      ),
    });
  }

  if (incident.analysis) {
    const rca = (
      <StateChip tone="accent">
        <Sparkles size={10} aria-hidden />
        RCA
      </StateChip>
    );
    chips.push({
      key: 'rca',
      node: incident.linkTarget ? (
        <Link
          href={`${incident.linkTarget}#rca`}
          title="A root-cause analysis exists for this incident — open it"
          className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          {rca}
        </Link>
      ) : (
        rca
      ),
    });
  }

  if (incident.repair?.prNumber) {
    const pr = (
      <StateChip tone="accent">
        <GitPullRequest size={10} aria-hidden />
        {`PR #${incident.repair.prNumber}`}
      </StateChip>
    );
    chips.push({
      key: 'pr',
      node: incident.repair.prUrl ? (
        <a
          href={incident.repair.prUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          {pr}
        </a>
      ) : (
        pr
      ),
    });
  }

  if (anyBlind) {
    chips.push({
      key: 'blind',
      node: (
        <StateChip tone="danger" title="A source could not be read this refresh">
          <CloudOff size={10} aria-hidden />
          SOURCE BLIND
        </StateChip>
      ),
    });
  }

  const visibleChips = chips.slice(0, 5);
  const firstGap = incident.proofGaps[0] ?? null;

  return (
    <RailRow severity={incident.severity}>
      <RowHead
        value={incident.occurrences}
        valueLabel={`${incident.occurrences} ${incident.occurrences === 1 ? 'event' : 'events'}`}
      >
        {incident.linkTarget ? (
          <Link href={incident.linkTarget} className="hover:underline">
            {presentation?.title ?? incident.description}
          </Link>
        ) : (
          (presentation?.title ?? incident.description)
        )}
      </RowHead>

      {/* Phase 0's "feature > operation" line — the resolver's own words for
          where this happened, ahead of the raw fact line below. */}
      {presentation?.operationContext ? (
        <p className="mt-0.5 text-caption leading-4 text-warm-600">{presentation.operationContext}</p>
      ) : null}

      <FactLine
        items={[incident.errorCode, incident.actionName, primary ? INCIDENT_SOURCE_LABEL[primary.source] : null]}
        emphasizeFirst={Boolean(incident.errorCode)}
      />

      {/* Muted-mono technical signature — brief §7: demoted detail, never
          the title. Only rendered once a presentation was actually
          resolved, so a card with no presentation prop looks identical to
          the pre-Phase-1 card rather than showing a redundant line. */}
      {presentation ? (
        <p className="mt-0.5 break-words font-fw-mono text-caption leading-4 text-warm-500 [overflow-wrap:anywhere]">
          {presentation.technicalSignature}
        </p>
      ) : null}

      {path ? <RowPath>{path}</RowPath> : null}

      {/* Release relationship — brief §9. `undefined` means "no Release
          Watch was computed for this render" (omit entirely, same as
          `presentation`); `null` means "computed, but this incident has no
          answer" and still renders, hatched. */}
      {releaseRelationship !== undefined ? (
        <div className="mt-1.5">
          {releaseRelationship ? (
            <ReleaseRelationshipLabel verdict={releaseRelationship} size="sm" />
          ) : (
            <ReleaseRelationshipLabel
              verdict={{ relationship: 'unknown', confidence: 0, evidenceFor: [], evidenceAgainst: ['Release watch could not be computed this refresh.'] }}
              size="sm"
            />
          )}
        </div>
      ) : null}

      {/* Regressions shown as episodes — only when there is more than one,
          i.e. an actual regression exists; a single-episode incident stays
          silent here rather than adding chrome for the common case. */}
      {genome && genome.episodes.episodes.length > 1 ? (
        <div className="mt-1.5">
          <EpisodeTimelineStrip episodes={genome.episodes.episodes} incomplete={genome.episodes.timelineIncomplete} size="sm" />
        </div>
      ) : null}

      {/* The feature tag — a product area in words, or "untagged" out loud. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="unified-incident-tags">
        {incident.featureId ? (
          <Tag
            label="Feature"
            value={featureLabel ?? incident.featureId}
            muted={featureLabel === null}
            title={
              featureLabel === null
                ? `"${incident.featureId}" is not a key in the feature registry — it counts against no feature's health and cannot be filtered on`
                : `Tagged to the ${featureLabel} feature`
            }
          />
        ) : (
          <Tag
            label="Feature"
            value="untagged"
            muted
            title="Logged without a featureArea — this error counts against no feature's health"
          />
        )}
        {incident.sport ? <Tag label="Sport" value={SPORT_LABEL[incident.sport]} /> : null}
      </div>

      {visibleChips.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {visibleChips.map((c) => (
            <span key={c.key} data-testid="unified-incident-chip">
              {c.node}
            </span>
          ))}
        </div>
      ) : null}

      {/* What the lifecycle chip MEANS, in the one sentence lifecycle.ts
          wrote for it. Header point F. */}
      <p className="mt-1.5 break-words text-caption leading-5 text-warm-700 [overflow-wrap:anywhere]">
        {incident.lifecycle.headline}
      </p>

      {/* Why it is stalled, in the flow model's own words — which stage,
          how many of its cycles have passed, what it did not do. */}
      {flow.stalled ? (
        <p className="mt-1 break-words text-caption leading-5 text-fw-warning-ink [overflow-wrap:anywhere]">{flow.why}</p>
      ) : null}

      {/* The single most useful line on the redesigned card — see header
          point C. Never the gap's category label; always its own detail. */}
      {firstGap ? <p className="mt-1 break-words text-caption leading-5 text-warm-500 [overflow-wrap:anywhere]">{firstGap.detail}</p> : null}

      <RowFoot
        meta={
          <>
            {affectedUsersLabel(incident)} · <LocalTime iso={incident.lastSeen} />
          </>
        }
      >
        {series ? (
          <Sparkline
            data={series}
            goodDirection="down"
            label={`${primary ? INCIDENT_SOURCE_LABEL[primary.source] : 'Incident'} events, last 24h`}
            width={44}
            height={14}
            showEndDot={false}
            className="mr-1 shrink-0"
          />
        ) : null}

        <ProofDots proof={incident.proof} size="sm" />

        {genome ? <SourceConfidenceRing coverage={genome.evidenceCoverage} size={22} className="shrink-0" /> : null}

        <CopyReportButton variant="icon" report={incident.report} label={`Copy incident report: ${incident.title}`} />

        {onResolve ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Resolve incident"
            onClick={() => onResolve(incident)}
          >
            <CheckCheck size={13} aria-hidden />
          </Button>
        ) : null}
      </RowFoot>

      <IncidentDetails incident={incident} />

      {error ? <p className="mt-1 text-caption text-fw-danger-ink">Resolve failed — {error}</p> : null}
    </RailRow>
  );
}
