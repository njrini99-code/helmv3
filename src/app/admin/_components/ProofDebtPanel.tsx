import Link from 'next/link';
import { PROOF_GAP_LABEL, type ProofGapKind, type UnifiedIncident } from '@/lib/admin/incidents/types';
import { RailRow, RowFoot, RowHead, RowPath, StateChip } from './Row';
import { PanelAllClear, PanelNoData } from './PanelStates';

/**
 * PROOF DEBT — work that looks solved but still lacks the evidence to say so.
 *
 * WHY THIS IS A PANEL AND NOT A FILTER. The open/resolved axis cannot express
 * it. An incident whose fix is merged, deployed, and simply has not seen
 * traffic since is neither open nor closed: it drops off the triage queue
 * because nothing is wrong with it, and it never reaches the archive because
 * nothing has proved it fixed. It disappears from both lists, and the only
 * thing that brings it back is the fault recurring — which is precisely the
 * outcome the proof was meant to pre-empt.
 *
 * So the panel answers a question no other surface asks: what do we believe,
 * and what part of that belief is still unevidenced?
 *
 * The DETAIL is the useful half of every row. "Waiting for post-deploy
 * traffic" is a category; "live 2h, no iOS heartbeat since" is the thing that
 * tells an operator whether to wait or to go looking. The category is the
 * lead-in; the detail is never truncated away.
 */

/**
 * Worst first. An operator reads this top-down, and the ordering is by what
 * they can DO about it: a blind source and a failed-looking CI are theirs to
 * act on now, while waiting for traffic is a clock nobody can hurry.
 */
const GAP_PRIORITY: readonly ProofGapKind[] = [
  'source-blind',
  'awaiting-ci',
  'awaiting-owner',
  'awaiting-repair',
  'awaiting-evidence',
  'awaiting-deploy',
  'awaiting-traffic',
];

const GAP_TONE: Readonly<Record<ProofGapKind, 'neutral' | 'danger' | 'warning' | 'accent'>> = {
  'source-blind': 'danger',
  'awaiting-ci': 'warning',
  // The one an owner can clear right now — accent, because it is an
  // affordance rather than a problem.
  'awaiting-owner': 'accent',
  'awaiting-repair': 'accent',
  'awaiting-evidence': 'warning',
  'awaiting-deploy': 'warning',
  'awaiting-traffic': 'neutral',
};

function rank(kind: ProofGapKind): number {
  const i = GAP_PRIORITY.indexOf(kind);
  return i === -1 ? GAP_PRIORITY.length : i;
}

export interface ProofDebtRow {
  incidentId: string;
  linkTarget: string | null;
  title: string;
  kind: ProofGapKind;
  detail: string;
}

/**
 * One row per INCIDENT, carrying its most actionable gap — not one row per
 * gap. An incident with three outstanding gaps is still one piece of work,
 * and listing it three times would make the panel's count disagree with the
 * number of things an operator actually has to deal with.
 */
export function selectProofDebt(incidents: readonly UnifiedIncident[]): ProofDebtRow[] {
  const rows: ProofDebtRow[] = [];
  for (const incident of incidents) {
    if (incident.proofGaps.length === 0) continue;
    const worst = [...incident.proofGaps].sort((a, b) => rank(a.kind) - rank(b.kind))[0]!;
    rows.push({
      incidentId: incident.id,
      linkTarget: incident.linkTarget,
      title: incident.description,
      kind: worst.kind,
      detail: worst.detail,
    });
  }
  return rows.sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** Counts per kind, for the panel's summary line. */
export function summarizeProofDebt(rows: readonly ProofDebtRow[]): Array<[ProofGapKind, number]> {
  const counts = new Map<ProofGapKind, number>();
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

export function ProofDebtPanel({
  rows,
  limit = 6,
  /**
   * False whenever a source is blind. An empty proof-debt panel under an
   * unreadable source is not "nothing outstanding" — it is a list we could
   * not fully compute, and the two must not render identically.
   */
  canClaimAllClear,
  checkedAt,
}: {
  rows: readonly ProofDebtRow[];
  limit?: number;
  canClaimAllClear: boolean;
  checkedAt: string;
}) {
  if (rows.length === 0) {
    return canClaimAllClear ? (
      <PanelAllClear label="No proof debt — everything solved is also proven" checkedAt={checkedAt} />
    ) : (
      <PanelNoData
        label="No proof debt found in readable sources"
        description="At least one source could not be read, so this list may be incomplete."
      />
    );
  }

  const shown = rows.slice(0, limit);
  const summary = summarizeProofDebt(rows);

  return (
    <div className="min-w-0">
      <p className="font-fw-mono text-caption text-warm-500">
        {summary.map(([kind, count], i) => (
          <span key={kind}>
            {i > 0 ? <span className="px-1 text-warm-400">·</span> : null}
            {count} {PROOF_GAP_LABEL[kind].toLowerCase()}
          </span>
        ))}
      </p>
      <ul className="mt-1 divide-y divide-warm-200/60">
        {shown.map((row) => (
          <RailRow key={row.incidentId} severity="info">
            <RowHead clamp={2}>
              {row.linkTarget ? (
                <Link href={row.linkTarget} className="hover:underline">
                  {row.title}
                </Link>
              ) : (
                row.title
              )}
            </RowHead>
            {/* The detail, verbatim. It is the reason this row is here. */}
            <RowPath>{row.detail}</RowPath>
            <RowFoot>
              <StateChip tone={GAP_TONE[row.kind]}>{PROOF_GAP_LABEL[row.kind]}</StateChip>
            </RowFoot>
          </RailRow>
        ))}
      </ul>
      {rows.length > shown.length ? (
        <p className="mt-2 text-caption text-warm-500">
          <Link href="/admin/errors?lens=awaiting-proof" className="text-accent-700 underline">
            {rows.length - shown.length} more awaiting proof
          </Link>
        </p>
      ) : null}
    </div>
  );
}
