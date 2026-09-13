import { rotate } from './project';
import { inFeature } from './spatial';
import { createSurfaceGuard } from './surface-compatibility';
import type {
  CourseGeometryPackage, DiagramDistance, DiagramEvent, Direction8, EstimatedPin, LocalFeature,
  PhysicalHole, PointM, ShotEvidence,
} from './types';

/** Deliberately bounded illustration model, not a measurement error model.
 * Input rounding contributes half an input unit; the additional allowance is
 * an explicit uncalibrated hypothesis. Source accuracy is still unknown.
 * Changing these constants changes the algorithm version, not stored shots. */
export const RECONSTRUCTION_LIMITS = Object.freeze({
  events: 72, targets: 36, samplesPerFeature: 196, statesPerTarget: 8,
  surfaces: 48, regionCellsPerEvent: 96, maximumCellRadiusM: 1.5,
  pointChecks: 250_000,
  offGreenAllowanceM: 2, greenAllowanceM: 0.3048,
});

const SURFACE = { fairway: 'fairway', sand: 'bunker', green: 'green', rough: 'rough', tee: 'tee' } as const;
const HALF_SECTOR = 3 * Math.PI / 16; // Overlapping 67.5° categories, never exact bearings.
const SECTOR: Record<Direction8, number> = {
  long: 0, long_left: Math.PI / 4, left: Math.PI / 2, short_left: 3 * Math.PI / 4,
  short: Math.PI, short_right: -3 * Math.PI / 4, right: -Math.PI / 2, long_right: -Math.PI / 4,
};
const distance = (a: PointM, b: PointM) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const surfaceKind = (lie: string | null) => SURFACE[lie as keyof typeof SURFACE] ?? null;
// Current entry classifies par-3 tee strokes as approaches and collects the
// eight GREEN-relative directions. Their before yardage is still a scorecard.
const unknownTeeAim = (event: ShotEvidence, hole: PhysicalHole) =>
  event.shotType === 'tee' || (event.lieBefore === 'tee' && hole.par !== 3);

export function radialToleranceM(value: DiagramDistance, green: boolean): number {
  const unitM = { yards: 0.9144, feet: 0.3048, meters: 1 }[value.originalUnit ?? ''];
  // A converted preference can leave many decimal digits in the canonical
  // field. Those digits do not prove finer player input. Retain a conservative
  // half-canonical-unit rounding allowance until writer precision is carried.
  const quantum = unitM ?? 0;
  return quantum / 2 + (green ? RECONSTRUCTION_LIMITS.greenAllowanceM : RECONSTRUCTION_LIMITS.offGreenAllowanceM);
}

/** Radius within which every point satisfies the categorical approach sector
 * for this hypothetical origin/target. Zero means incompatible. */
export function directionAllowanceM(origin: PointM, target: PointM, endpoint: PointM, direction: Direction8): number {
  const forward: PointM = [target[0] - origin[0], target[1] - origin[1]];
  if (Math.hypot(...forward) < 0.01) return 0;
  const vector: PointM = [endpoint[0] - target[0], endpoint[1] - target[1]];
  const radius = Math.hypot(...vector);
  if (radius < 1e-9) return 0;
  // atan2(cross,dot) is positive to the player's left in East/North space.
  const angle = Math.atan2(forward[0] * vector[1] - forward[1] * vector[0],
    forward[0] * vector[0] + forward[1] * vector[1]);
  const delta = Math.abs(Math.atan2(Math.sin(angle - SECTOR[direction]), Math.cos(angle - SECTOR[direction])));
  const margin = HALF_SECTOR - delta;
  return margin > 0 ? radius * Math.sin(Math.min(Math.PI / 2, margin)) : 0;
}

interface SurfaceSample { point: PointM; featureId: string; radiusM: number }
interface State {
  targetIndex: number;
  point: PointM;
  featureId: string;
  eventIndex: number;
  previous: State | null;
  /** Preserve competing surface histories when a later stroke reaches the
   * same green. Ranking cannot silently resolve an earlier bunker choice. */
  lineage: string;
  /** Ranking only; not a probability, travel measurement or hard constraint. */
  score: number;
}
interface Candidate {
  state: State;
  radiusM: number;
}
interface EventWork { event: DiagramEvent; candidates: Candidate[]; directionResolved: boolean }

export interface ReconstructionResult {
  events: DiagramEvent[];
  /** One surviving target hypothesis for presentation. It is returned AFTER
   * reconstruction and must never be fed back as independent pin evidence. */
  estimatedPin?: EstimatedPin;
}

/** Sampling axes belong to the physical route, so rotating the entire course
 * rotates the samples too. A display camera never enters reconstruction. */
function sampleFeature(feature: LocalFeature, axis: number, origin: PointM, budget: number): SurfaceSample[] {
  const samples: SurfaceSample[] = [];
  const toFrame = (point: PointM) => rotate([point[0] - origin[0], point[1] - origin[1]], -axis);
  const toWorld = (point: PointM): PointM => {
    const p = rotate(point, axis);
    return [p[0] + origin[0], p[1] + origin[1]];
  };
  // Allocate each disconnected component some capacity instead of dropping a
  // small greenside component behind the largest polygon's bounding box.
  const partBudget = Math.max(1, Math.floor(budget / Math.max(1, feature.parts.length)));
  for (const rings of feature.parts) {
    const ring = rings[0];
    if (!ring?.length) continue;
    const points = ring.map(toFrame), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const dx = Math.max(...xs) - minX, dy = Math.max(...ys) - minY;
    if (dx <= 0 || dy <= 0) continue;
    const nx = Math.max(1, Math.min(partBudget, Math.round(Math.sqrt(partBudget * dx / dy))));
    const ny = Math.max(1, Math.floor(partBudget / nx));
    const cellX = dx / nx, cellY = dy / ny;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const point = toWorld([minX + (x + .5) * cellX, minY + (y + .5) * cellY]);
      if (inFeature(point, feature)) samples.push({ point, featureId: feature.id,
        radiusM: Math.min(cellX, cellY) / 2 });
    }
  }
  return samples.slice(0, budget);
}

function emptyEvent(evidence: ShotEvidence): DiagramEvent {
  return { evidence, anchorM: null, placement: evidence.penalty || evidence.shotType === 'putting' || evidence.result === 'hole' ? 'schematic' : 'unknown',
    inferredSurfaceFeatureId: null, candidateFeatureIds: [], regions: [], connection: null,
    reasons: [...evidence.issues] };
}

/** Keep every represented surface before spending remaining capacity on more
 * hypotheses. If capacity is insufficient, the caller cannot assert a point. */
function retainStates(states: State[]): State[] {
  const ordered = [...states].sort((a, b) => a.score - b.score || compare(a.featureId, b.featureId));
  const selected: State[] = [], seen = new Set<string>();
  for (const state of ordered) if (!seen.has(state.lineage)) {
    selected.push(state); seen.add(state.lineage);
  }
  for (const state of ordered) {
    if (selected.length >= RECONSTRUCTION_LIMITS.statesPerTarget) break;
    if (!selected.includes(state)) selected.push(state);
  }
  return selected.slice(0, RECONSTRUCTION_LIMITS.statesPerTarget);
}

/** Manual inputs constrain possible regions. They never become observed
 * coordinates. Target samples are retained consistently across the complete
 * ledger, including recovery after a penalty; no event chooses its own pin. */
export function reconstructHoleEvidence(hole: PhysicalHole, features: readonly LocalFeature[],
  evidence: readonly ShotEvidence[], status: CourseGeometryPackage['status']): ReconstructionResult {
  if (!evidence.length) return { events: [] }; // Static filmstrip cells need no solver work.
  const work: EventWork[] = evidence.map(e => ({ event: emptyEvent(e), candidates: [], directionResolved: true }));
  const green = features.find(f => f.id === hole.greenFeatureId && f.kind === 'green' && f.reviewed);
  if (status === 'source_candidate' || !green) return { events: work.map(({ event }) => ({ ...event,
    reasons: [...event.reasons, status === 'source_candidate' ? 'source_acceptance_pending' : 'reviewed_green_unavailable'] })) };
  const route = features.find(f => f.id === hole.routeFeatureId && f.kind === 'route' && f.reviewed)?.parts[0]?.[0];
  const origin = route?.[0] ?? green.parts[0]![0]![0]!;
  const end = route?.at(-1);
  const axis = end ? Math.atan2(end[1] - origin[1], end[0] - origin[0]) : 0;
  const surfaceGuard = createSurfaceGuard(features);
  const targets = sampleFeature(green, axis, origin, RECONSTRUCTION_LIMITS.targets)
    .map(p => p.point).filter(p => surfaceGuard.clearance(p, 'green', 1e-6) > 0);
  if (!targets.length) return { events: work.map(({ event }) => ({ ...event, reasons: [...event.reasons, 'target_sampling_unresolved'] })) };
  const surfaces = features.filter(f => f.reviewed && f.kind !== 'route' && f.kind !== 'woods' && f.kind !== 'water');
  const surfaceLimit = surfaces.length > RECONSTRUCTION_LIMITS.surfaces;
  const samples = surfaces.slice(0, RECONSTRUCTION_LIMITS.surfaces)
    .flatMap(f => sampleFeature(f, axis, origin, RECONSTRUCTION_LIMITS.samplesPerFeature)
      .map(sample => ({ ...sample, radiusM: surfaceGuard.clearance(sample.point, f.kind,
        Math.min(sample.radiusM, RECONSTRUCTION_LIMITS.maximumCellRadiusM)) }))
      .filter(sample => sample.radiusM > 1e-6));
  const featureById = new Map(surfaces.map(f => [f.id, f]));
  let activeTargets = new Set(targets.map((_, i) => i));
  let previousStates: State[] = [], lastStrokeOrigins: State[] = [];
  let lastSolvedStates: State[] = [];
  let targetConflict = false;
  let sequenceLimit = false;
  let pointChecks = 0;

  const originStates = (e: ShotEvidence, targetIndex: number, previous: readonly State[]): State[] => {
    const target = targets[targetIndex]!;
    const kind = surfaceKind(e.lieBefore);
    // Tee yardage is a scorecard length, not today's straight tee-to-cup
    // measurement. It cannot cut a second circle around the unknown pin.
    const tee = e.lieBefore === 'tee';
    const tolerance = radialToleranceM(e.before, e.lieBefore === 'green');
    const matches = (p: PointM, featureId: string) =>
      (!kind || featureById.get(featureId)?.kind === kind) &&
      (tee || e.before.valueM == null || Math.abs(distance(p, target) - e.before.valueM) <= tolerance);
    const retained = previous.filter(p => p.targetIndex === targetIndex && matches(p.point, p.featureId));
    // A known previous candidate set must not be silently replaced by a new
    // conveniently positioned origin when an edit makes it incompatible.
    if (previous.some(p => p.targetIndex === targetIndex)) return retained;
    if (!kind || (!tee && e.before.valueM == null)) return [];
    return retainStates(samples.filter(s => matches(s.point, s.featureId) && featureById.get(s.featureId)?.kind === kind)
      .map(s => ({ targetIndex, point: s.point, featureId: s.featureId, eventIndex: -1, previous: null,
        lineage: `origin:${s.featureId}`, score: 0 })));
  };

  for (const [index, item] of work.entries()) {
    const e = item.event.evidence;
    const note = (reason: string) => item.event.reasons.push(reason);
    if (index >= RECONSTRUCTION_LIMITS.events) { note('reconstruction_event_limit'); previousStates = []; continue; }
    if (e.penalty) {
      note('penalty_transition_without_flight');
      if (e.penalty.type === 'ob' || e.penalty.type === 'lost') {
        // The row carries replay lie/distance. Reuse all compatible origins of
        // the offending stroke, not its illustrative finish or a new tee dot.
        previousStates = lastStrokeOrigins.filter(s => activeTargets.has(s.targetIndex) &&
          (!surfaceKind(e.penalty!.nextLie) || featureById.get(s.featureId)?.kind === surfaceKind(e.penalty!.nextLie)) &&
          (e.penalty!.nextLie === 'tee' || (e.penalty!.nextDistance.valueM != null &&
            Math.abs(distance(s.point, targets[s.targetIndex]!) - e.penalty!.nextDistance.valueM) <=
              radialToleranceM(e.penalty!.nextDistance, e.penalty!.nextLie === 'green'))));
        note(previousStates.length ? 'replay_origin_candidates_retained' : 'replay_origin_unresolved');
      } else {
        // A drop is an origin transition with no observed coordinate. Resolve
        // its recorded lie/distance for the next stroke instead of drawing it.
        previousStates = [];
        note('drop_origin_not_measured');
      }
      continue;
    }
    if (e.shotType === 'putting' || e.result === 'hole') {
      note(e.result === 'hole' ? 'holed_without_physical_pin' : 'putting_uses_abstract_cup');
      previousStates = []; continue;
    }
    const origins = [...activeTargets].flatMap(t => originStates(e, t, previousStates));
    lastStrokeOrigins = origins;
    if (e.issues.length) { note('conflicting_evidence_kept_unresolved'); previousStates = []; continue; }
    if (e.after.valueM == null) { note('remaining_distance_unknown'); previousStates = []; continue; }
    const kind = surfaceKind(e.result);
    if (!kind || kind === 'tee') { note('original_result_has_no_surface_constraint'); previousStates = []; continue; }
    const compatible = samples.filter(s => featureById.get(s.featureId)?.kind === kind);
    if (!compatible.length) { note('compatible_surface_not_reviewed'); previousStates = []; continue; }
    const isTee = unknownTeeAim(e, hole);
    if (isTee && e.miss) { note('tee_direction_aim_unknown'); item.directionResolved = false; }
    const tolerance = radialToleranceM(e.after, e.result === 'green');
    const currentStates: State[] = [];
    for (const targetIndex of activeTargets) {
      const target = targets[targetIndex]!;
      const prior = origins.filter(s => s.targetIndex === targetIndex);
      if (!prior.length && previousStates.some(s => s.targetIndex === targetIndex)) continue;
      if (e.miss && !isTee && !prior.length) item.directionResolved = false;
      const targetStates: State[] = [];
      for (const sample of compatible) {
        if (++pointChecks > RECONSTRUCTION_LIMITS.pointChecks) return { events: work.map(({ event }) => ({
          ...emptyEvent(event.evidence), reasons: [...event.evidence.issues, 'reconstruction_work_limit'],
        })) };
        const radialMargin = tolerance - Math.abs(distance(sample.point, target) - e.after.valueM);
        if (radialMargin <= 1e-6) continue;
        const branches = new Map<string, { state: State; directionMargin: number }>();
        for (const state of prior) {
          const allowed = e.miss && !isTee ? directionAllowanceM(state.point, target, sample.point, e.miss) : Infinity;
          if (allowed <= 1e-6) continue;
          const score = state.score + distance(state.point, sample.point);
          const lineage = `${state.lineage}/${sample.featureId}`;
          if (!branches.has(lineage) || score < branches.get(lineage)!.state.score) {
            branches.set(lineage, { state: { targetIndex, point: sample.point, featureId: sample.featureId,
              eventIndex: index, previous: state.eventIndex >= 0 ? state : null, lineage, score }, directionMargin: allowed });
          }
        }
        // When no origin is known, a radial/surface region can still be shown;
        // a direction is explicitly unresolved, never silently called straight.
        if (!branches.size && !prior.length) branches.set(sample.featureId, { state: { targetIndex, point: sample.point,
          featureId: sample.featureId, eventIndex: index, previous: null, lineage: sample.featureId, score: 0 }, directionMargin: Infinity });
        for (const branch of branches.values()) {
          const radiusM = Math.min(RECONSTRUCTION_LIMITS.maximumCellRadiusM, sample.radiusM,
            radialMargin, branch.directionMargin);
          item.candidates.push({ state: branch.state, radiusM }); targetStates.push(branch.state);
        }
      }
      if (new Set(targetStates.map(s => s.lineage)).size > RECONSTRUCTION_LIMITS.statesPerTarget) sequenceLimit = true;
      currentStates.push(...retainStates(targetStates));
    }
    if (!item.directionResolved) note('direction_frame_unresolved');
    if (!currentStates.length) {
      note('no_compatible_sampled_region');
      // A failed finite constraint must not widen the band or choose a new
      // convenient target. Do not imply a coherent geographic shot sequence.
      targetConflict = true;
      previousStates = []; continue;
    }
    activeTargets = new Set(currentStates.map(s => s.targetIndex));
    previousStates = currentStates; lastSolvedStates = currentStates;
    note('pin_unknown_shared_target_samples');
    note('uncalibrated_distance_allowance');
    note('sampled_regions_not_exhaustive');
    if (hole.completeness !== 'reviewed_surfaces') note('incomplete_surface_coverage');
    if (surfaceLimit) note('reconstruction_surface_limit');
  }

  if (targetConflict) return { events: work.map(({ event }) => ({ ...event, anchorM: null, regions: [],
    connection: null, candidateFeatureIds: [], inferredSurfaceFeatureId: null,
    placement: event.placement === 'schematic' ? 'schematic' : 'unknown',
    reasons: [...event.reasons, 'no_consistent_target_sequence'] })) };

  // The representative chain is selected once after the complete ledger has
  // constrained targets. Its preceding points remain hypotheses throughout.
  const surviving = lastSolvedStates.filter(s => activeTargets.has(s.targetIndex));
  const supported = new Set<State>();
  const outgoingAllowance = new Map<State, number>();
  for (const terminal of surviving) {
    outgoingAllowance.set(terminal, Infinity);
    for (let state: State | null = terminal; state; state = state.previous) {
      supported.add(state);
      const prior = state.previous;
      if (!prior) continue;
      const e = work[state.eventIndex]!.event.evidence, target = targets[state.targetIndex]!;
      const beforeMargin = e.lieBefore === 'tee' || e.before.valueM == null ? Infinity :
        radialToleranceM(e.before, e.lieBefore === 'green') - Math.abs(distance(prior.point, target) - e.before.valueM);
      // Moving an earlier point also rotates the next stroke's target-relative
      // frame. Bound its cell by the NEXT direction as well as its own finish.
      const directionMargin = e.miss && !unknownTeeAim(e, hole)
        ? directionAllowanceM(prior.point, target, state.point, e.miss) * distance(prior.point, target) /
          Math.max(1e-9, distance(state.point, target)) : Infinity;
      const allowance = Math.max(0, Math.min(beforeMargin, directionMargin));
      outgoingAllowance.set(prior, Math.max(outgoingAllowance.get(prior) ?? 0, allowance));
    }
  }
  const winner = [...surviving]
    .sort((a, b) => a.score - b.score || a.targetIndex - b.targetIndex || compare(a.featureId, b.featureId))[0];
  const chain = new Map<number, State>();
  for (let state = winner; state; state = state.previous ?? undefined) chain.set(state.eventIndex, state);
  for (const [index, item] of work.entries()) {
    const candidates = item.candidates.filter(c => supported.has(c.state))
      .map(c => ({ ...c, radiusM: Math.min(c.radiusM, outgoingAllowance.get(c.state) ?? Infinity) }))
      .filter(c => c.radiusM > 1e-6);
    if (!candidates.length) continue;
    const featureIds = [...new Set(candidates.map(c => c.state.featureId))].sort(compare);
    item.event.candidateFeatureIds = featureIds;
    item.event.placement = 'ambiguous';
    // Round-robin cells across candidate surfaces; dense fairway sampling must
    // not erase the second compatible bunker from the visible alternatives.
    const byFeature = featureIds.map(featureId => {
      const cells = new Map<string, { centerM: PointM; radiusM: number }>();
      for (const candidate of candidates) if (candidate.state.featureId === featureId) {
        const p = candidate.state.point, key = `${p[0]},${p[1]}`;
        if ((cells.get(key)?.radiusM ?? -1) < candidate.radiusM) cells.set(key, { centerM: p, radiusM: candidate.radiusM });
      }
      return { featureId, cells: [...cells.values()], basis: 'sampled_feasible_region' as const };
    });
    const budget = Math.floor(RECONSTRUCTION_LIMITS.regionCellsPerEvent / byFeature.length);
    item.event.regions = byFeature.map(region => ({ ...region, cells: region.cells.filter((_, i) =>
      i % Math.max(1, Math.ceil(region.cells.length / Math.max(1, budget))) === 0).slice(0, budget) }));
    const representative = chain.get(index);
    if (sequenceLimit) item.event.reasons.push('reconstruction_branch_limit');
    if (hole.completeness === 'reviewed_surfaces' && !surfaceLimit && !sequenceLimit && featureIds.length === 1 &&
      item.directionResolved && !item.event.evidence.issues.length && representative) {
      item.event.anchorM = representative.point;
      item.event.inferredSurfaceFeatureId = representative.featureId;
      item.event.placement = 'compatible_estimate';
      item.event.reasons.push('representative_of_retained_sequence_not_measurement');
    }
  }
  for (const [index, item] of work.entries()) {
    const previous = work[index - 1]?.event;
    const state = chain.get(index);
    if (!item.event.anchorM || !previous?.anchorM || !state?.previous ||
      state.previous.eventIndex !== index - 1 || previous.evidence.penalty) continue;
    item.event.connection = { fromM: previous.anchorM, toM: item.event.anchorM,
      distanceM: distance(previous.anchorM, item.event.anchorM), basis: 'inferred_endpoint_separation' };
  }
  return { events: work.map(w => w.event), ...(winner ? { estimatedPin: {
    positionM: targets[winner.targetIndex]!, basis: 'retained_manual_hypothesis' as const,
  } } : {}) };
}

/** Event-only compatibility API. Presentation of an estimated pin cannot
 * change the event reconstruction consumed by existing callers. */
export function reconstructEvents(hole: PhysicalHole, features: readonly LocalFeature[],
  evidence: readonly ShotEvidence[], status: CourseGeometryPackage['status']): DiagramEvent[] {
  return reconstructHoleEvidence(hole, features, evidence, status).events;
}

/** A geometry-only fallback when there is no retained manual hypothesis.
 * Validate the supplied interior reference; a concave green's bounding-box
 * centre or centroid is not necessarily on its putting surface. */
export function nominalGreenPin(hole: PhysicalHole, features: readonly LocalFeature[],
  status: CourseGeometryPackage['status'], suppliedReference?: PointM): EstimatedPin | undefined {
  if (status !== 'reviewed_draft') return undefined;
  const green = features.find(f => f.id === hole.greenFeatureId && f.kind === 'green' && f.reviewed);
  if (!green) return undefined;
  const guard = createSurfaceGuard(features);
  const allowed = (point: PointM) => point.every(Number.isFinite) && inFeature(point, green) && guard.clearance(point, 'green', 1e-6) > 0;
  if (suppliedReference && allowed(suppliedReference)) return { positionM: suppliedReference, basis: 'nominal_green_reference' };
  const route = features.find(f => f.id === hole.routeFeatureId && f.kind === 'route' && f.reviewed)?.parts[0]?.[0];
  const origin = route?.[0] ?? green.parts[0]![0]![0]!, end = route?.at(-1);
  const axis = end ? Math.atan2(end[1] - origin[1], end[0] - origin[0]) : 0;
  const samples = sampleFeature(green, axis, origin, RECONSTRUCTION_LIMITS.samplesPerFeature).filter(sample => allowed(sample.point));
  // Choose a roomy interior point, using metric edges (including cutouts).
  // This is layout, never an attempt to identify the day's cup from imagery.
  const clearance = (point: PointM) => {
    let result = Infinity;
    for (const ring of green.parts.flat()) for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!, b = ring[i]!, dx = b[0] - a[0], dy = b[1] - a[1];
      const length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2)) : 0;
      result = Math.min(result, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
    }
    return Math.min(result, guard.clearance(point, 'green'));
  };
  const point = samples.map(s => ({ point: s.point, clearance: clearance(s.point) }))
    .sort((a, b) => b.clearance - a.clearance)[0]?.point;
  return point ? { positionM: point, basis: 'nominal_green_reference' } : undefined;
}
