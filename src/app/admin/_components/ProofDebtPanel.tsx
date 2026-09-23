import type { ProofGapKind, UnifiedIncident } from '@/lib/admin/incidents/types';

/**
 * PROOF DEBT — work that looks solved but still lacks the evidence to say so.
 *
 * WHY THIS IS A COUNT AND NOT ITS OWN PANEL ANY MORE. The open/resolved axis
 * cannot express it: an incident whose fix is merged, deployed, and simply
 * has not seen traffic since is neither open nor closed. It drops off the
 * triage queue because nothing is wrong with it, and it never reaches the
 * archive because nothing has proved it fixed — the only thing that brings
 * it back is the fault recurring, which is precisely the outcome the proof
 * was meant to pre-empt.
 *
 * The full list used to be its own Overview panel (`ProofDebtPanel`); that
 * panel was the `awaiting-proof` lens rendered a second time (bridge
 * redesign plan §2.1) and is deleted. The two pure functions below survive —
 * `CommandDeck.tsx`'s Self-Heal Circuit chip reuses `selectProofDebt` for its
 * count, and the full list is one click away at
 * `/admin/errors?lens=awaiting-proof`.
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
