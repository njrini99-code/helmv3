'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Sparkles, GitPullRequest, CloudOff, CheckCheck } from 'lucide-react';
import { Button, Sparkline } from '@/components/fairway';
import {
  LIFECYCLE_LABEL,
  LIFECYCLE_TONE,
  INCIDENT_SOURCE_LABEL,
  type UnifiedIncident,
  type IncidentSourceEvidence,
  type IncidentLifecycleState,
} from '@/lib/admin/incidents/types';
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

export function UnifiedIncidentCard({
  incident,
  series,
  onResolve,
  error,
}: {
  incident: UnifiedIncident;
  series: number[] | null;
  onResolve?: (incident: UnifiedIncident) => void;
  error?: string;
}) {
  const path = routeLabel(incident.route);
  const primary = primarySource(incident.sources);
  const anyBlind = incident.sources.some((s) => s.health === 'blind');

  // Priority order, highest-value first — see the header for why this is
  // capped rather than open-ended.
  const chips: Array<{ key: string; node: ReactNode }> = [];

  chips.push({ key: 'lifecycle', node: <LifecycleChip state={incident.lifecycle.state} /> });

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
            {incident.description}
          </Link>
        ) : (
          incident.description
        )}
      </RowHead>

      <FactLine
        items={[incident.errorCode, incident.featureId, incident.actionName, primary ? INCIDENT_SOURCE_LABEL[primary.source] : null]}
        emphasizeFirst={Boolean(incident.errorCode)}
      />

      {path ? <RowPath>{path}</RowPath> : null}

      {visibleChips.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {visibleChips.map((c) => (
            <span key={c.key} data-testid="unified-incident-chip">
              {c.node}
            </span>
          ))}
        </div>
      ) : null}

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

      {/* The single most useful line on the redesigned card — see header
          point C. Never the gap's category label; always its own detail. */}
      {firstGap ? <p className="mt-1 break-words text-caption leading-5 text-warm-500">{firstGap.detail}</p> : null}

      {error ? <p className="mt-1 text-caption text-fw-danger-ink">Resolve failed — {error}</p> : null}
    </RailRow>
  );
}
