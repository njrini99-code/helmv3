import {
  RELEASE_RELATIONSHIP_LABEL,
  type ReleaseRelationship,
  type ReleaseRelationshipVerdict,
} from '@/lib/admin/incidents/release-context';
import { PosturePill, type BridgePostureTone } from './PosturePill';
import { ConfidenceMeter } from './ConfidenceMeter';
import { cn } from '@/lib/utils';

/**
 * ============================================================================
 * Bridge Premium · ReleaseRelationshipLabel
 * ----------------------------------------------------------------------------
 * The shared rendering for `ReleaseRelationship` (brief §9: "Every incident
 * gets a release relationship: NEW AFTER RELEASE, REGRESSED AFTER RELEASE,
 * EXISTED BEFORE RELEASE, IMPROVED AFTER RELEASE, NO CAUSAL SIGNAL, UNKNOWN.
 * Proximity is not causation."). One mapping, reused by incident cards, the
 * Incident Genome, and Release Watch — the same discipline `PosturePill`
 * applies to lifecycle/watch states.
 *
 * TONE IS DELIBERATE, NOT SEVERITY-SHAPED. `'new-after-release'` and
 * `'regressed-after-release'` are both `danger`-ish because either one means
 * "this release probably caused something" — but `'no-causal-signal'` is
 * `neutral`, not a lesser danger: it is the classifier explicitly saying
 * timing alone did not earn a causal claim, which is a DIFFERENT fact than
 * "we don't know" (`'unknown'`, hatched) or "this got better"
 * (`'improved-after-release'`, success).
 * ========================================================================== */

const RELATIONSHIP_TONE: Readonly<Record<ReleaseRelationship, BridgePostureTone>> = {
  'new-after-release': 'danger',
  'regressed-after-release': 'danger',
  'existed-before-release': 'neutral',
  'improved-after-release': 'success',
  'no-causal-signal': 'neutral',
  unknown: 'unknown',
};

export interface ReleaseRelationshipLabelProps {
  verdict: ReleaseRelationshipVerdict;
  /** Show the numeric confidence meter beside the label — off by default on
   *  a dense card row, on for the Genome/Inspector where there's room. */
  showConfidence?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function ReleaseRelationshipLabel({
  verdict,
  showConfidence = false,
  size = 'md',
  className,
}: ReleaseRelationshipLabelProps) {
  const reason = verdict.relationship === 'unknown' ? verdict.evidenceAgainst[0] ?? 'Release deploy time is unknown.' : null;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <PosturePill tone={RELATIONSHIP_TONE[verdict.relationship]} size={size} reason={reason}>
        {RELEASE_RELATIONSHIP_LABEL[verdict.relationship]}
      </PosturePill>
      {showConfidence && verdict.relationship !== 'unknown' ? (
        <ConfidenceMeter value={verdict.confidence} size="sm" />
      ) : null}
    </span>
  );
}
