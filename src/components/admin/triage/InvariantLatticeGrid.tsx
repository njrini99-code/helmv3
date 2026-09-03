/**
 * Bridge Premium Phase 3 — Invariant Lattice for `/admin/health`.
 *
 * `to be replaced by premium/<name>` — no shared `src/components/admin/
 * premium/*` lattice/grid primitive existed on `agent/bridge-premium-p1` as
 * of this PR (branch not yet pushed).
 */
import { StatusPill, type FwStatusTone } from '@/components/fairway';
import type { InvariantCellState, InvariantLatticeRow, InvariantLatticeView } from '@/lib/admin/triage/invariant-lattice';
import { LocalTime } from '@/app/admin/_components/LocalTime';

const STATE_TONE: Record<InvariantCellState, FwStatusTone> = {
  pass: 'success',
  // A silent data-integrity violation must outrank an ordinary warning
  // visually — see invariant-lattice.ts's own severity field for the rule
  // this pill's tone follows: severity, not raw state, drives colour here.
  fail: 'danger',
  unknown: 'neutral',
};

function InvariantRow({ row }: { row: InvariantLatticeRow }) {
  const tone: FwStatusTone = row.state === 'fail' && row.severity === 'critical' ? 'danger' : STATE_TONE[row.state];
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-warm-800">{row.label}</p>
        <p className="truncate text-caption text-warm-500">
          {row.detail}
          {row.lastCheckedAt ? (
            <>
              {' · '}
              <LocalTime iso={row.lastCheckedAt} variant="datetime" />
            </>
          ) : null}
        </p>
      </div>
      <StatusPill tone={tone} dot size="sm">
        {row.state}
      </StatusPill>
    </div>
  );
}

export function InvariantLatticeGrid({ view }: { view: InvariantLatticeView }) {
  const groups = Array.from(new Set(view.rows.map((r) => r.group)));

  return (
    <div className="space-y-4">
      {view.anyFailing ? (
        <p className="text-caption font-semibold text-fw-danger-ink">
          At least one invariant is failing — a silent data-integrity violation outranks every ordinary warning on
          this page.
        </p>
      ) : null}
      {groups.map((group) => (
        <div key={group}>
          <p className="text-eyebrow font-semibold uppercase tracking-widest text-warm-400">{group}</p>
          <div className="mt-1 divide-y divide-warm-100">
            {view.rows
              .filter((r) => r.group === group)
              .map((row) => (
                <InvariantRow key={row.id} row={row} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
