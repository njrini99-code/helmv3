import { z } from 'zod';
import type { CourseGeometryPackage } from '../course-geometry/types';
import type { CourseGeometryPolicy } from '../course-geometry/course-policy';
import type { EssentialCourseManifest } from './course-assets';
import type { RoundScoringSetup } from './live-round-placement';

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.object({
  courseId: id, geometryVersion: id, packageUrl: z.string().min(1).max(2048),
  terrainByHole: z.record(id, z.string().max(2048)).optional(), contextLayerUrl: z.string().max(2048).optional(),
});
export const roundBindingProposalSchema = z.object({
  schemaVersion: z.literal(2), roundId: z.string().uuid(), layoutId: id, siteId: id,
  geometryVersion: id, layoutRevision: hash, admissionVersion: hash, frameVersion: hash,
  admissionBasis: z.literal('runtime_policy'),
  manifest: manifestSchema,
  holeBindings: z.record(z.string().regex(/^[1-9][0-9]?$/), id),
});
const scoringSchema = z.object({
  dbCourseId: z.string().uuid().nullable(), selectedTeeId: z.string().uuid().nullable(),
  scorecardProfileId: id.nullable(), scorecardRevision: hash.nullable(),
  courseRating: z.number().finite().nullable(), courseSlope: z.number().finite().nullable(),
  holes: z.array(z.object({ number: z.number().int().min(1).max(36), par: z.number().int().min(1).max(9), yardage: z.number().finite().nonnegative().nullable(),
    teeId: z.string().uuid().nullable(), scorecardProfileId: id.nullable(),
    physicalHoleId: id.nullable(), geometryHoleKey: id.nullable(), teeFeatureId: id.nullable() })).max(36),
});
export const roundCourseBindingSchema = roundBindingProposalSchema.extend({
  scoringSnapshot: scoringSchema, scorecardSnapshotHash: hash,
});
export type RoundBindingProposal = z.infer<typeof roundBindingProposalSchema>;
export type DurableRoundCourseBinding = z.infer<typeof roundCourseBindingSchema>;
export type BindingReadResult = { status: 'found'; binding: DurableRoundCourseBinding } | { status: 'missing' | 'unavailable' | 'conflict' };
export interface RoundBindingTransport {
  read(roundId: string): Promise<BindingReadResult>;
  /** Insert once; a concurrent winner is returned unchanged. Never upsert. */
  claim(proposal: RoundBindingProposal): Promise<BindingReadResult>;
}

export function canonicalBindingJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalBindingJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalBindingJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalBindingJson(value));
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('');
}
export async function proposeRoundBinding(roundId: string, manifest: EssentialCourseManifest, pkg: CourseGeometryPackage, policy: CourseGeometryPolicy): Promise<RoundBindingProposal> {
  const holeBindings = policy.holeBindings?.[pkg.contentHash] ?? {};
  if (!Object.keys(holeBindings).length || Object.values(holeBindings).some(key => !pkg.holes.some(h => h.key === key))
    || new Set(Object.values(holeBindings)).size !== Object.values(holeBindings).length) throw new Error('Explicit round hole mapping unavailable');
  return roundBindingProposalSchema.parse({
    schemaVersion: 2, roundId, layoutId: policy.layoutId, siteId: pkg.siteId, geometryVersion: pkg.contentHash, manifest, holeBindings,
    layoutRevision: await digest({ layoutId: policy.layoutId, holeBindings }),
    admissionVersion: await digest({ layoutId: policy.layoutId, geometryVersion: pkg.contentHash, tier: policy.acceptedCapabilityTier,
      packageByteHash: policy.approvedPackageByteHashes?.[pkg.contentHash] ?? null,
      pilot: policy.pilotAcceptsSourceCandidate, livePilot: policy.livePilot?.geometryHashes.has(pkg.contentHash) ?? false, holeBindings }),
    admissionBasis: 'runtime_policy',
    frameVersion: await digest({ projection: pkg.projection, originWgs84: pkg.originWgs84, units: 'meters' }),
  });
}
/** No persisted approval overrides current revocation or a changed crosswalk. */
export function sameBindingProposal(binding: DurableRoundCourseBinding, proposal: RoundBindingProposal): boolean {
  return canonicalBindingJson(roundBindingProposalSchema.parse(binding)) === canonicalBindingJson(proposal);
}
export function bindingMatchesScoring(binding: DurableRoundCourseBinding, setup?: RoundScoringSetup): boolean {
  if (!setup) return true; // Read-only round review still uses its own saved scorecard for labels.
  const saved = binding.scoringSnapshot;
  return saved.dbCourseId === setup.dbCourseId && saved.selectedTeeId === setup.selectedTeeId
    && (setup.scorecardProfileId === undefined || setup.scorecardProfileId === saved.scorecardProfileId)
    && (setup.scorecardRevision === undefined || setup.scorecardRevision === saved.scorecardRevision)
    && setup.holes.length === saved.holes.length
    && setup.holes.every((h, index) => {
      const s = saved.holes[index];
      return s?.number === h.number && s.par === h.par && (s.yardage ?? 0) === h.yardage;
    });
}

/**
 * The world binding must name the exact package hole for every saved round
 * hole. A round can retain `physicalHoleId` and `teeFeatureId` as null when
 * the source evidence does not support those claims, but it may never obtain
 * a geometry hole by ordinal or nearest-neighbour fallback. This is checked
 * again on every resume because the durable record is an external boundary.
 */
export function bindingHasCompleteHoleCrosswalk(binding: DurableRoundCourseBinding): boolean {
  const holes = binding.scoringSnapshot.holes;
  if (!holes.length) return false;
  const numbers = new Set<number>();
  const geometryKeys = new Set<string>();
  return holes.every(hole => {
    const geometryHoleKey = hole.geometryHoleKey;
    if (numbers.has(hole.number) || !geometryHoleKey || geometryKeys.has(geometryHoleKey)) return false;
    numbers.add(hole.number);
    geometryKeys.add(geometryHoleKey);
    return binding.holeBindings[String(hole.number)] === geometryHoleKey;
  });
}
