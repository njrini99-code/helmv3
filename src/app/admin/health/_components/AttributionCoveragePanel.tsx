import Link from 'next/link';
import { Surface, Inset, SegmentBar, InlineNotice, type FeedbackTone } from '@/components/fairway';
import { PanelStale } from '../../_components/PanelStates';
import type { AttributionCoverage } from '@/lib/admin/data/feature-health-detail';

/**
 * W16-follow-up — "how many events mapped to a feature vs not, and what that
 * does to confidence in the rest of the page" (task point 3). This panel is
 * the single explicit place that question gets answered; every other panel
 * on this page inherits its caveat rather than repeating it.
 *
 * `coverage` is null ONLY when the coverage queries themselves failed — see
 * `fetchFeatureHealthDetail`'s own doc comment on why that is a SEPARATE
 * failure domain from `get_feature_health()`. Rendered as `PanelStale`, never
 * as a fabricated percentage.
 */

const CONFIDENCE_TONE: Record<AttributionCoverage['confidence'], FeedbackTone> = {
  high: 'success',
  medium: 'info',
  low: 'warning',
  // 'unknown' only happens on a genuinely empty window (totalEvents === 0) —
  // that is not itself bad news, so 'info' rather than 'warning'.
  unknown: 'info',
};

const CONFIDENCE_LABEL: Record<AttributionCoverage['confidence'], string> = {
  high: 'high confidence',
  medium: 'medium confidence — read per-feature counts as directional',
  low: 'low confidence — a large share of this window is unattributed',
  unknown: 'confidence unknown',
};

export function AttributionCoveragePanel({
  coverage,
  coverageError,
}: {
  coverage: AttributionCoverage | null;
  coverageError: string | null;
}) {
  if (!coverage) {
    return (
      <PanelStale
        label="Attribution coverage unavailable"
        error={coverageError ?? 'Could not read admin_events for the coverage window.'}
      />
    );
  }

  return (
    <Surface padding="sm">
      <Inset padding="none">
        <SegmentBar
          overline={`Trailing ${coverage.windowDays}d`}
          title="Feature attribution coverage"
          takeaway={`${coverage.coveragePct ?? '—'}% attributed, ${CONFIDENCE_LABEL[coverage.confidence]}`}
          parts={[
            { label: 'Attributed', value: coverage.attributedEvents, tone: 'good' },
            { label: 'Unattributed', value: coverage.unattributedEvents, tone: 'caution' },
          ]}
          // Coverage, not the unattributed share, is the headline this panel
          // exists to report — index 0 ("Attributed") is the honest primary
          // read here, not the auto-picked 'good' default (which would also
          // resolve to index 0 in this two-part case, but pinned explicitly
          // so a future third part can't silently change what's called out).
          primary={0}
          // SegmentBar already treats a zero-total part set as its own
          // honest "awaiting" state (never a fabricated full bar) — no need
          // for a separate zero-events branch here; this is that same
          // condition made explicit rather than relying on it noticing
          // `total === 0` on its own.
          awaiting={coverage.totalEvents === 0}
        />
      </Inset>
      <InlineNotice tone={CONFIDENCE_TONE[coverage.confidence]} className="mt-3">
        {coverage.headline}
        {coverage.unattributedEvents > 0 ? (
          <>
            {' '}
            {/* /admin/errors has no "unattributed only" filter today (its
                `feature` param validates against FEATURE_REGISTRY keys, which
                by definition excludes "no tag at all") — this links to the
                unfiltered feed, not a scoped one, so the label never claims
                a filter that doesn't exist. */}
            <Link href="/admin/errors" className="underline underline-offset-2">
              Open Errors →
            </Link>
          </>
        ) : null}
      </InlineNotice>
    </Surface>
  );
}
