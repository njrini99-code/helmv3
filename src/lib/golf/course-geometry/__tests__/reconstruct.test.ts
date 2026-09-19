import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { auditContinuity, normalizePersistedShot } from '../normalize';
import { reconstructEvents, reconstructHoleEvidence, nominalGreenPin, radialToleranceM, directionAllowanceM, RECONSTRUCTION_LIMITS } from '../reconstruct';
import { checkedAnchor, checkedConnection, checkedRegions } from '../quality';
import { inFeature } from '../spatial';
import { createSurfaceGuard } from '../surface-compatibility';
import { rotate, toScreen, fromScreen } from '../project';
import { buildHoleScene } from '../build-scene';
import { parseGeometryPackage } from '../schema';
import type { Direction8, LocalFeature, PhysicalHole, PointM, ShotEvidence } from '../types';
import cacapon from '@/test/fixtures/course-geometry/cacapon.json';
import winchester from '@/test/fixtures/course-geometry/winchester.json';
import { illustrativeScene, pilotScene } from '@/test/fixtures/course-geometry/pilot';

const rect = (id: string, kind: LocalFeature['kind'], x0: number, y0: number, x1: number, y1: number): LocalFeature => ({
  id, kind, reviewed: true, type: 'Polygon', parts: [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]],
});
const route: LocalFeature = { id: 'route', kind: 'route', reviewed: true, type: 'LineString', parts: [[[[0, 0], [0, 320]]]] };
const base = [route, rect('tee', 'tee', -8, -5, 8, 5), rect('green', 'green', -10, 310, 10, 330),
  rect('fairway', 'fairway', -12, 20, 12, 295), rect('left-bunker', 'bunker', -23, 292, -12, 309)];
const hole: PhysicalHole = { key: 'analytic', ordinal: 1, par: 4, scorecardYards: 350,
  featureIds: base.map(f => f.id), routeFeatureId: 'route', greenFeatureId: 'green', nominalTargetWgs84: null,
  completeness: 'reviewed_surfaces', gaps: [] };
const shot = (number: number, result: string, before: number, after: number, lieBefore = 'fairway', miss?: Direction8): ShotEvidence =>
  normalizePersistedShot({ id: `shot-${number}`, shot_number: number, shot_type: lieBefore === 'tee' ? 'tee' : 'approach',
    result, lie_before: lieBefore, distance_to_hole_before: before, distance_to_hole_after: after,
    distance_unit_before: 'yards', distance_unit_after: result === 'green' ? 'feet' : 'yards', miss_direction: miss });
const ledger = [shot(1, 'fairway', 350, 158, 'tee'), shot(2, 'sand', 158, 18, 'fairway', 'short_left'),
  shot(3, 'green', 18, 12, 'sand')];
const solve = (events = ledger, features = base, physical = hole) =>
  reconstructEvents(physical, features, auditContinuity(events), 'reviewed_draft');
const length = (a: PointM, b: PointM) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('bounded manual shot reconstruction', () => {
  it('keeps the unknown target and original evidence while exposing compatible regions', () => {
    const before = structuredClone(ledger);
    const events = solve();
    expect(events.map(e => e.evidence)).toEqual(before);
    expect(ledger).toEqual(before);
    expect(events.map(e => e.candidateFeatureIds)).toEqual([['fairway'], ['left-bunker'], ['green']]);
    for (const e of events) {
      expect(e.reasons).toContain('pin_unknown_shared_target_samples');
      expect(e.reasons).toContain('sampled_regions_not_exhaustive');
      expect(e.regions!.flatMap(r => r.cells).length).toBeLessThanOrEqual(RECONSTRUCTION_LIMITS.regionCellsPerEvent);
      for (const region of e.regions!) for (const cell of region.cells) {
        expect(inFeature(cell.centerM, base.find(f => f.id === region.featureId)!)).toBe(true);
        expect(cell.radiusM).toBeGreaterThan(0);
        expect(cell.radiusM).toBeLessThanOrEqual(RECONSTRUCTION_LIMITS.maximumCellRadiusM);
      }
    }
  });

  it('connects only coherent representatives on complete reviewed surfaces, at physical scale', () => {
    const events = solve();
    expect(events.map(e => e.placement)).toEqual(['compatible_estimate', 'compatible_estimate', 'compatible_estimate']);
    expect(events[0]!.connection).toBeNull(); // No invented daily tee marker.
    for (const [index, e] of events.entries()) {
      expect(checkedAnchor(e, base)).not.toBeNull();
      if (!index) continue;
      const connection = checkedConnection(e, events[index - 1], base)!;
      expect(connection).not.toBeNull();
      for (const angle of [0, Math.PI / 4, Math.PI, -.97]) {
        const camera = { scale: .8 / .9144, angle, translation: [17, 300] as PointM };
        expect(length(toScreen(connection.fromM, camera), toScreen(connection.toM, camera)))
          .toBeCloseTo(connection.distanceM * camera.scale, 8);
      }
    }
  });

  it('never counts legacy calculated shot length or scorecard yardage as another measured radius', () => {
    const changed = ledger.map(e => ({ ...e, legacyLength: { ...e.legacyLength, valueM: 9999, originalValue: 10_934 },
      original: { ...e.original, shot_distance: 10_934 } }));
    const fields = (events: ReturnType<typeof solve>) => events.map(({ evidence: _e, ...spatial }) => spatial);
    expect(fields(solve(changed))).toEqual(fields(solve()));
    expect(fields(solve(ledger, base, { ...hole, scorecardYards: 999 }))).toEqual(fields(solve()));
  });

  it('keeps two compatible bunkers ambiguous, without bridging that event', () => {
    const features = [...base, rect('second-left', 'bunker', -22, 305, -12, 319)];
    const events = solve(ledger, features);
    expect(events[1]!.candidateFeatureIds).toEqual(['left-bunker', 'second-left']);
    expect(events[1]!.anchorM).toBeNull(); expect(events[1]!.inferredSurfaceFeatureId).toBeNull();
    expect(events[1]!.connection).toBeNull(); expect(events[2]!.connection).toBeNull();
  });

  it('rejects malformed region and connector annotations at the shared render boundary', () => {
    const events = solve(), event = events[1]!;
    expect(checkedRegions(event, base)).toHaveLength(1);
    expect(checkedRegions({ ...event, candidateFeatureIds: [] }, base)).toEqual([]);
    expect(checkedRegions({ ...event, evidence: { ...event.evidence, result: 'rough' } }, base)).toEqual([]);
    expect(checkedRegions({ ...event, regions: [{ featureId: 'left-bunker', basis: 'sampled_feasible_region',
      cells: [{ centerM: [0, 0], radiusM: 1 }] }] }, base)).toEqual([]);
    expect(checkedRegions({ ...event, regions: [{ featureId: 'left-bunker', basis: 'sampled_feasible_region',
      cells: [{ centerM: [-18, 300], radiusM: 999 }] }] }, base)).toEqual([]);
    expect(checkedConnection({ ...event, connection: { ...event.connection!, distanceM: 150 } }, events[0], base)).toBeNull();
    expect(checkedConnection({ ...event, connection: null }, events[0], base)).toBeNull();
  });

  it('does not repair contradictory distances by changing the latent pin or widening the search', () => {
    const impossible = [ledger[0]!, shot(2, 'sand', 158, 220, 'fairway', 'short_left')];
    const events = solve(impossible);
    expect(events.every(e => e.anchorM === null && e.connection === null && !e.regions?.length)).toBe(true);
    expect(events.every(e => e.reasons.includes('no_consistent_target_sequence'))).toBe(true);
    expect(events[1]!.evidence.after.originalValue).toBe(220);
  });

  it('isolates edits, missing units, sequence gaps and missing misses without rewriting neighbors', () => {
    const missingUnit = normalizePersistedShot({ shot_number: 2, lie_before: 'fairway', result: 'sand', distance_to_hole_after: 18 });
    expect(solve([ledger[0]!, missingUnit])[1]!.anchorM).toBeNull();
    const edited = shot(2, 'sand', 175, 18, 'rough', 'left');
    const scene = solve([ledger[0]!, edited]);
    expect(scene[1]!.reasons).toContain('neighbor_distance_conflict');
    expect(scene[1]!.reasons).toContain('neighbor_lie_conflict');
    expect(scene[1]!.connection).toBeNull();
    const gap = solve([ledger[0]!, { ...ledger[1]!, shotNumber: 4 }]);
    expect(gap[1]!.reasons).toContain('event_sequence_gap');
    expect(gap[1]!.connection).toBeNull();
    expect(solve([ledger[0]!])[0]!.evidence.miss).toBeNull();
  });

  it('retains regions for partial coverage and refuses inferred rough/Other or unreviewed source candidates', () => {
    const partial = solve(ledger, base, { ...hole, completeness: 'partial' });
    expect(partial.every(e => e.anchorM === null && e.connection === null)).toBe(true);
    expect(partial.every(e => e.regions!.length > 0)).toBe(true);
    expect(solve([shot(1, 'rough', 350, 158, 'tee')])[0]!.reasons).toContain('compatible_surface_not_reviewed');
    expect(solve([shot(1, 'other', 350, 158, 'tee')])[0]!.reasons).toContain('original_result_has_no_surface_constraint');
    expect(reconstructEvents(hole, base, ledger, 'source_candidate').every(e => !e.regions?.length && !e.anchorM)).toBe(true);
  });

  it('does not make a left/right tee miss into a known aim bearing', () => {
    const events = solve([{ ...ledger[0]!, miss: 'right', rawMiss: 'right' }]);
    expect(events[0]!.reasons).toContain('tee_direction_aim_unknown');
    expect(events[0]!.anchorM).toBeNull();
    expect(events[0]!.regions!.length).toBeGreaterThan(0);
  });

  it('uses par-3 approach directions while preserving tee-yardage uncertainty', () => {
    const approach = { ...shot(1, 'sand', 350, 18, 'tee', 'short_left'), shotType: 'approach' };
    const events = solve([approach], base, { ...hole, par: 3 });
    expect(events[0]!.candidateFeatureIds).toEqual(['left-bunker']);
    expect(events[0]!.reasons).not.toContain('tee_direction_aim_unknown');
    expect(events[0]!.evidence.miss).toBe('short_left');
    const changedBefore = { ...approach, before: { ...approach.before, valueM: 999, originalValue: 999 } };
    expect(solve([changedBefore], base, { ...hole, par: 3 })[0]!.regions).toEqual(events[0]!.regions);
  });

  it('allows a backward recovery with greater remaining distance', () => {
    const events = solve([ledger[0]!, shot(2, 'fairway', 158, 200)]);
    expect(events[1]!.candidateFeatureIds).toEqual(['fairway']);
    expect(events[1]!.connection).not.toBeNull();
    expect(events[1]!.evidence.after.originalValue).toBe(200);
    expect(events[1]!.anchorM![1]).toBeLessThan(events[0]!.anchorM![1]);
  });

  it('preserves penalty/drop/replay state and does not draw penalty strokes or unknown gaps', () => {
    const errant = shot(2, 'other', 158, 158);
    const penalty = normalizePersistedShot({ shot_number: 3, shot_type: 'penalty', is_penalty: true,
      penalty_type: 'ob', result: 'penalty', lie_before: 'fairway',
      distance_to_hole_before: 158, distance_to_hole_after: 158, distance_unit_before: 'yards', distance_unit_after: 'yards' });
    const replay = { ...ledger[1]!, shotNumber: 4, eventKey: 'replay' };
    const events = solve([ledger[0]!, errant, penalty, replay]);
    expect(events.map(e => e.evidence.shotNumber)).toEqual([1, 2, 3, 4]);
    expect(events[2]!.reasons).toContain('replay_origin_candidates_retained');
    expect(events[2]!.anchorM).toBeNull(); expect(events[2]!.placement).toBe('schematic');
    expect(events[3]!.candidateFeatureIds).toEqual(['left-bunker']);
    expect(events[3]!.connection).toBeNull();
    const water = solve([ledger[0]!, { ...penalty, shotNumber: 2, penalty: { ...penalty.penalty!, type: 'water' } },
      { ...replay, shotNumber: 3 }]);
    expect(water[1]!.reasons).toContain('drop_origin_not_measured');
    expect(water[2]!.connection).toBeNull();
  });

  it('keeps putting and holed status separate from any physical pin', () => {
    const putt = normalizePersistedShot({ shot_number: 4, shot_type: 'putting', lie_before: 'green', result: 'hole',
      distance_to_hole_before: 12, distance_to_hole_after: 0, distance_unit_before: 'feet', distance_unit_after: 'feet' });
    const events = solve([...ledger, putt]);
    expect(events[3]!.placement).toBe('schematic'); expect(events[3]!.anchorM).toBeNull();
    expect(events[3]!.evidence.putt.made).toBe(true);
    expect(events[3]!.reasons).toContain('holed_without_physical_pin');
  });

  it('retains valid inner holes and multipart regions instead of filling cutouts', () => {
    const bunker = structuredClone(base[4]!);
    bunker.parts[0]!.push([[-19, 296], [-16, 296], [-16, 303], [-19, 303], [-19, 296]]);
    const events = solve(ledger, [...base.slice(0, 4), bunker]);
    for (const region of events[1]!.regions!) for (const cell of region.cells) expect(inFeature(cell.centerM, bunker)).toBe(true);
    if (events[1]!.anchorM) expect(inFeature(events[1]!.anchorM, bunker)).toBe(true);
  });

  it('never treats sand or water inside a broad fairway outline as a fairway finish', () => {
    const bunker = rect('fairway-bunker', 'bunker', -4, 168, 4, 180);
    const features = [...base, bunker, rect('water', 'water', 5, 176, 10, 188)];
    const events = solve([ledger[0]!], features);
    const guard = createSurfaceGuard(features);
    for (const region of events[0]!.regions!) for (const cell of region.cells) {
      expect(inFeature(cell.centerM, bunker)).toBe(false);
      expect(guard.clearance(cell.centerM, 'fairway')).toBeGreaterThanOrEqual(cell.radiusM - 1e-7);
    }
    const fabricated = { ...events[0]!, anchorM: [0, 174] as PointM, placement: 'compatible_estimate' as const,
      candidateFeatureIds: ['fairway'], inferredSurfaceFeatureId: 'fairway' };
    expect(checkedAnchor(fabricated, features)).toBeNull();
  });

  it('bounds malformed/long input work without dropping original event numbers', () => {
    const many = Array.from({ length: 90 }, (_, i) => shot(i + 1, 'other', 100, 100));
    const events = solve(many);
    expect(events).toHaveLength(90);
    expect(events[89]!.evidence.shotNumber).toBe(90);
    expect(events[89]!.reasons).toContain('reconstruction_event_limit');
  });
});

describe('direction and deterministic coordinate invariants', () => {
  const endpoints: Record<Direction8, PointM> = { short: [0, -20], short_left: [-20, -20], left: [-20, 0],
    long_left: [-20, 20], long: [0, 20], long_right: [20, 20], right: [20, 0], short_right: [20, -20] };
  it.each(Object.entries(endpoints))('preserves %s as a sector through physical rotation', (direction, endpoint) => {
    fc.assert(fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), angle => {
      const allowance = directionAllowanceM(rotate([0, -100], angle), [0, 0], rotate(endpoint, angle), direction as Direction8);
      expect(allowance).toBeGreaterThan(0);
      expect(allowance).toBeCloseTo(directionAllowanceM([0, -100], [0, 0], endpoint, direction as Direction8), 8);
      expect(directionAllowanceM(rotate([0, -100], angle), [0, 0], rotate([-endpoint[0], -endpoint[1]], angle), direction as Direction8)).toBe(0);
    }), { seed: 1937, numRuns: 30 });
  });
  it('accepts category width rather than assuming an exact diagonal angle', () => {
    expect(directionAllowanceM([0, -100], [0, 0], [-10, -20], 'short_left')).toBeGreaterThan(0);
    expect(directionAllowanceM([0, -100], [0, 0], [-20, -10], 'short_left')).toBeGreaterThan(0);
  });
  it('is deterministic and rotation-equivariant without depending on the display camera', () => {
    const original = solve();
    expect(solve()).toEqual(original);
    const angle = .731;
    const rotated = solve(ledger, base.map(f => ({ ...f,
      parts: f.parts.map(rings => rings.map(r => r.map(p => rotate(p, angle)))),
    })));
    for (const [i, event] of rotated.entries()) {
      expect(event.candidateFeatureIds).toEqual(original[i]!.candidateFeatureIds);
      expect(event.placement).toBe(original[i]!.placement);
      if (event.anchorM && original[i]!.anchorM) expect(length(event.anchorM, rotate(original[i]!.anchorM!, angle))).toBeLessThan(1e-7);
    }
  });
});

describe('actual pilot evidence', () => {
  it('shows Cacapon possible areas and both compatible short-right bunkers, without a fabricated shot path', () => {
    const events = [shot(1, 'fairway', 431, 158, 'tee'), shot(2, 'sand', 158, 17, 'fairway', 'short_right'), shot(3, 'green', 17, 12, 'sand')];
    const scene = buildHoleScene(parseGeometryPackage(cacapon), 'cacapon-07', events);
    expect(scene.overlayKind).toBe('estimated_regions');
    expect(scene.events[1]!.candidateFeatureIds).toEqual(['osm-way-885719199', 'osm-way-885719200']);
    expect(scene.events.every(e => !e.anchorM && !e.connection)).toBe(true);
    expect(scene.target.kind).toBe('unknown_pin');
    expect(scene.events.map(e => e.evidence.after.originalValue)).toEqual([158, 17, 12]);
  });
  it('keeps Winchester source candidates as course context until surface acceptance', () => {
    const scene = buildHoleScene(parseGeometryPackage(winchester), 'winchester-07', ledger);
    expect(scene.overlayKind).toBe('unresolved');
    expect(scene.events.every(e => !e.anchorM && !e.regions?.length && !e.connection)).toBe(true);
    expect(scene.events[0]!.reasons).toContain('source_acceptance_pending');
  });
});

describe('estimated pin presentation without manufactured measurements', () => {
  it('uses the same retained target as the representative shot sequence', () => {
    const result = reconstructHoleEvidence(hole, base, auditContinuity(ledger), 'reviewed_draft');
    expect(result.events).toEqual(solve());
    expect(result.estimatedPin?.basis).toBe('retained_manual_hypothesis');
    const pin = result.estimatedPin!.positionM;
    expect(inFeature(pin, base[2]!)).toBe(true);
    for (const event of result.events) {
      expect(event.anchorM).not.toBeNull();
      expect(Math.abs(length(event.anchorM!, pin) - event.evidence.after.valueM!))
        .toBeLessThanOrEqual(radialToleranceM(event.evidence.after, event.evidence.result === 'green'));
    }
  });

  it('finds an interior reference for a concave green and respects its cutout', () => {
    const green: LocalFeature = { id: 'green', kind: 'green', reviewed: true, type: 'Polygon', parts: [[
      [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30], [0, 0]],
      [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]],
    ]] };
    expect(inFeature([15, 15], green)).toBe(false);
    const reference = nominalGreenPin(hole, [green], 'reviewed_draft', [15, 15]);
    expect(reference?.basis).toBe('nominal_green_reference');
    expect(inFeature(reference!.positionM, green)).toBe(true);
    expect(nominalGreenPin(hole, [green], 'reviewed_draft', [5, 20])?.positionM).toEqual([5, 20]);
    expect(inFeature(nominalGreenPin(hole, [green], 'reviewed_draft', [5, 5])!.positionM, green)).toBe(true);
  });

  it('does not infer a pin inside overlapping water or from an unreviewed source candidate', () => {
    const features = [...base, rect('water-in-green', 'water', -3, 317, 3, 323)];
    const reference = nominalGreenPin(hole, features, 'reviewed_draft', [0, 320]);
    expect(reference).toBeDefined();
    expect(inFeature(reference!.positionM, features.at(-1)!)).toBe(false);
    expect(nominalGreenPin(hole, features, 'source_candidate')).toBeUndefined();
    expect(nominalGreenPin(hole, features.map(f => f.kind === 'green' ? { ...f, reviewed: false } : f), 'reviewed_draft')).toBeUndefined();
    expect(buildHoleScene(parseGeometryPackage(winchester), 'winchester-07', ledger).target.estimate).toBeUndefined();
  });

  it('keeps estimated pin world coordinates independent of camera, yardage and calculated shot length', () => {
    const pkg = parseGeometryPackage(cacapon);
    const scene = buildHoleScene(pkg, 'cacapon-07', ledger);
    const pin = scene.target.estimate!.positionM;
    expect(scene.target.kind).toBe('unknown_pin');
    for (const angle of [0, Math.PI / 2, -.49]) {
      const camera = { scale: .9, angle, translation: [25, 355] as PointM };
      expect(length(fromScreen(toScreen(pin, camera), camera), pin)).toBeLessThan(1e-8);
    }
    const changed = ledger.map(e => ({ ...e, legacyLength: { ...e.legacyLength, valueM: 9999, originalValue: 10_934 } }));
    expect(buildHoleScene(pkg, 'cacapon-07', changed).target).toEqual(scene.target);
    const changedYardage = structuredClone(pkg);
    changedYardage.holes[6]!.scorecardYards = 999;
    expect(buildHoleScene(changedYardage, 'cacapon-07', ledger).target).toEqual(scene.target);
  });

  it('uses an explicitly nominal reference with no ledger and does not claim a daily tee or pin', () => {
    const scene = buildHoleScene(parseGeometryPackage(cacapon), 'cacapon-07');
    expect(scene.target.kind).toBe('unknown_pin');
    expect(scene.target.estimate?.basis).toBe('nominal_green_reference');
    expect(scene.events).toEqual([]);
    expect(inFeature(scene.target.estimate!.positionM, scene.features.find(f => f.id === scene.hole.greenFeatureId)!)).toBe(true);
  });

  it('does not retain another ledger’s pin hypothesis when supplying an analytic fixture', () => {
    const scene = illustrativeScene();
    expect(scene.overlayKind).toBe('analytic_fixture');
    expect(scene.events).toHaveLength(2);
    expect(scene.events[0]!.evidence.after.originalValue).toBe(158);
    expect(scene.target).toEqual(pilotScene('cacapon-07', false).target);
    expect(scene.target.estimate?.basis).toBe('nominal_green_reference');
  });
});
