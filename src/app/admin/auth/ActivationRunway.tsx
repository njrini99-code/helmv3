'use client';

import { useState } from 'react';
import { RuledLeaderStat, SegmentBar, Dial, Sparkline, Segmented } from '@/components/fairway';
import type { SportRunway } from '@/lib/admin/data/activation-funnel';

// Dial full-scale caps (hours) — chosen so a healthy median sits mid-arc
// rather than pinned at either extreme. Onboarding is expected to resolve
// same-day; activation (actually playing/logging) has a longer natural tail.
const ONBOARD_DIAL_MAX_HOURS = 48;
const ACTIVATE_DIAL_MAX_HOURS = 168;

function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function dialFraction(hours: number | null, maxHours: number): number | undefined {
  if (hours === null) return undefined;
  return Math.max(0, Math.min(hours / maxHours, 1));
}

function GateDial({
  hours,
  prevHours,
  maxHours,
  samples,
}: {
  hours: number | null;
  prevHours: number | null;
  maxHours: number;
  samples: number;
}) {
  return (
    <Dial
      label="Median"
      value={dialFraction(hours, maxHours)}
      benchmark={dialFraction(prevHours, maxHours)}
      goodDirection="down"
      valueFormatter={() => formatHours(hours)}
      samples={samples}
      size={72}
    />
  );
}

function SportRunwayPanel({ label, runway }: { label: string; runway: SportRunway }) {
  const isEmpty = runway.signedUpCount === 0;
  const notOnboarded = Math.max(0, runway.signedUpCount - runway.onboardedCount);
  const onboardedNotActivated = Math.max(0, runway.onboardedCount - runway.activatedCount);

  return (
    <div className={isEmpty ? 'opacity-40' : undefined}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-fw-display text-body-lg font-semibold text-warm-900">{label}</h3>
        {isEmpty ? (
          <span className="text-caption text-warm-500">No signups this week</span>
        ) : runway.activationSampleTruncated ? (
          <span className="text-caption text-warm-500">activated/median from a capped sample</span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <RuledLeaderStat label="Signed up" value={String(runway.signedUpCount)} size="row" />
        <div className="flex items-end justify-between gap-2">
          <RuledLeaderStat label="Onboarded" value={String(runway.onboardedCount)} size="row" />
          <GateDial
            hours={runway.medianOnboardHours}
            prevHours={runway.prevMedianOnboardHours}
            maxHours={ONBOARD_DIAL_MAX_HOURS}
            samples={runway.onboardedCount}
          />
        </div>
        <div className="flex items-end justify-between gap-2">
          <RuledLeaderStat label="Activated" value={String(runway.activatedCount)} size="row" />
          <GateDial
            hours={runway.medianActivateHours}
            prevHours={runway.prevMedianActivateHours}
            maxHours={ACTIVATE_DIAL_MAX_HOURS}
            samples={runway.activatedCount}
          />
        </div>
      </div>

      <div className="mt-4">
        <SegmentBar
          title={`${label} runway breakdown`}
          overline="7d cohort"
          parts={[
            { label: 'Not yet onboarded', value: notOnboarded, tone: 'neutral' },
            { label: 'Onboarded, not activated', value: onboardedNotActivated, tone: 'caution' },
            { label: 'Activated', value: runway.activatedCount, tone: 'good' },
          ]}
          primary="good"
          thickness={20}
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-caption uppercase tracking-widest text-warm-500">Daily signups · 30d</span>
        <Sparkline
          data={runway.dailySignups30d.map((d) => d.y)}
          label={`${label} daily signups`}
          width={160}
          height={28}
          goodDirection="up"
        />
      </div>
    </div>
  );
}

/**
 * "First 7 Days" — signup → onboarded → activated runway, split by sport.
 * Desktop: both sports stacked. Mobile: a Segmented sport switcher instead of
 * a tall double-stack (Mobile Doctrine — compose, don't stack monoliths).
 */
export function ActivationRunway({ golf, baseball }: { golf: SportRunway; baseball: SportRunway }) {
  const [mobileSport, setMobileSport] = useState<'golf' | 'baseball'>('golf');

  return (
    <div>
      <div className="md:hidden">
        <Segmented
          options={[
            { value: 'golf', label: 'Golf' },
            { value: 'baseball', label: 'Baseball' },
          ]}
          value={mobileSport}
          onValueChange={(v) => setMobileSport(v as 'golf' | 'baseball')}
          fullWidth
          aria-label="Sport"
        />
        <div className="mt-4">
          <SportRunwayPanel label={mobileSport === 'golf' ? 'Golf' : 'Baseball'} runway={mobileSport === 'golf' ? golf : baseball} />
        </div>
      </div>

      <div className="hidden space-y-8 md:block">
        <SportRunwayPanel label="Golf" runway={golf} />
        <SportRunwayPanel label="Baseball" runway={baseball} />
      </div>
    </div>
  );
}
