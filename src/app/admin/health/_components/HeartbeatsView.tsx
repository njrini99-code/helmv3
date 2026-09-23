import { Eyebrow } from '@/components/fairway';
import { fetchJobsTab } from '@/lib/admin/data/jobs';
import { fetchQualifierLogic } from '@/lib/admin/data/qualifier-logic';
import { fetchReliabilitySnapshot } from '@/lib/admin/data/reliability';
import { buildHeartbeatMatrix } from '@/lib/admin/triage/heartbeat-matrix';
import { buildInvariantLattice } from '@/lib/admin/triage/invariant-lattice';
import { HeartbeatMatrixGrid } from '@/components/admin/triage/HeartbeatMatrixGrid';
import { InvariantLatticeGrid } from '@/components/admin/triage/InvariantLatticeGrid';

/**
 * The HEARTBEATS view of Feature Health — did every critical job run on
 * schedule, and is the data it maintains still consistent.
 *
 * It was the last section of a four-section `/admin/health` scroll, under the
 * dot grid and the per-feature detail list. Those answer "which feature is
 * unhealthy"; this answers "is the machinery that would TELL us still
 * running" — a different question, and the one that is worthless if you have
 * to scroll past three boards to reach it. `/admin/health?view=heartbeats`.
 *
 * Heartbeat Matrix + Invariant Lattice (Bridge Premium Phase 3, extended
 * by Control Plane Phase D.4.3). One `fetchJobsTab()` call feeds the
 * matrix AND the integrity half of the lattice — never a second,
 * duplicate 21-query board read for the same refresh. The round-graph
 * invariants come from the reliability collector's own latest snapshot
 * (recorded every 3h, never re-run at request time — same rule this
 * whole panel already follows for qualifiers/integrity). Failures on any
 * one source degrade that source's rows to `unknown`, never the whole
 * section.
 */
export async function HeartbeatsView() {
  const [jobs, qualifierLogic, reliability] = await Promise.allSettled([
    fetchJobsTab(),
    fetchQualifierLogic(),
    fetchReliabilitySnapshot(),
  ]);

  const jobsTab = jobs.status === 'fulfilled' ? jobs.value : null;
  const qualifierRes = qualifierLogic.status === 'fulfilled' ? qualifierLogic.value : null;
  const reliabilityRes = reliability.status === 'fulfilled' ? reliability.value : null;
  const roundGraphChecks =
    reliabilityRes && reliabilityRes.status === 'ok' && reliabilityRes.data
      ? (reliabilityRes.data.latest?.run?.invariants?.checks ?? null)
      : null;

  const heartbeat = jobsTab ? buildHeartbeatMatrix(jobsTab, Date.now()) : null;
  const lattice = buildInvariantLattice({
    qualifierInvariants: qualifierRes && qualifierRes.status === 'ok' && qualifierRes.data ? qualifierRes.data.invariants : null,
    integrityRows: jobsTab ? jobsTab.integrity : null,
    roundGraphChecks,
  });

  return (
    <div className="space-y-4">
      <div>
        <Eyebrow as="h3" tone="tertiary">
          Heartbeat matrix
        </Eyebrow>
        {heartbeat ? (
          <HeartbeatMatrixGrid view={heartbeat} />
        ) : (
          <p className="text-sm text-warm-500">Could not read the job board this refresh.</p>
        )}
      </div>
      <div>
        <Eyebrow as="h3" tone="tertiary">
          Invariant lattice
        </Eyebrow>
        <InvariantLatticeGrid view={lattice} />
      </div>
    </div>
  );
}
