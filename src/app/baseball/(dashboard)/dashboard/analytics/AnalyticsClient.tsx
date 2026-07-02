'use client';

// =============================================================================
// AnalyticsClient — the player's recruiting-interest view, migrated onto "The
// Living Annual" kit (design-system-living-annual.md §6, execution-plan.md
// §3.1 "analytics" row). PLAYER-ONLY (coaches redirect to the Command Center
// before this ever mounts — see page.tsx).
//
// PRESENTATION ONLY. `useAnalytics()` — the SAME hook, same 30-day engagement
// query, same anonymize-until-activated school naming — is preserved verbatim;
// only the render is re-skinned:
//   • 4 stat cards        → `KPIContentsStrip` (green-ruled, tabular-nums)
//   • Views-over-time     → `ClimbArc` (paper season climb, replaces recharts)
//   • Top schools list    → `RuledStatLine` rows (top interest reads green)
//
// Ink ruling: stays GREEN chrome throughout — this is the Passport (player)
// lane, not the War Room. Recruiting heat (a coach viewing the profile) gets a
// single `sodium` `InkBadge` accent on the masthead, never full clay chrome.
// =============================================================================

import { useAnalytics } from '@/hooks/use-analytics';
import {
  SectionMasthead,
  KPIContentsStrip,
  RuledStatLine,
  ClimbArc,
  PaperCard,
  Eyebrow,
  InkBadge,
  EmptyIssue,
  EditorsLetter,
  Reveal,
} from '@/components/baseball/living-annual';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

/** `2026-06-15` → `Jun 15`, parsed as a local calendar date (not UTC-shifted). */
function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Loading (skeleton, not a spinner) ──────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className={`${PAGE_SHELL} space-y-8`}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={180} height={11} />
        <Skeleton variant="text" width={220} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-7 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton variant="text" width="70%" height={11} />
            <Skeleton variant="text" width="50%" height={34} />
          </div>
        ))}
      </div>

      <PaperCard className="p-5">
        <Skeleton variant="text" width="30%" height={14} className="mb-4" />
        <Skeleton variant="rectangular" className="h-44 w-full" />
      </PaperCard>

      <PaperCard className="space-y-4 p-5">
        <Skeleton variant="text" width="40%" height={14} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="text" width="100%" height={22} />
        ))}
      </PaperCard>
    </div>
  );
}

export default function AnalyticsClient() {
  const { data, loading } = useAnalytics();

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  // No player record resolved for this session (rare edge state — not the
  // "recruiting not activated" case, which still returns real zeroed stats
  // below). Honest standing-by letter, never a broken/blank page.
  if (!data) {
    return (
      <div className={PAGE_SHELL}>
        <SectionMasthead eyebrow="THE PASSPORT · RECRUITING ANALYTICS" title="Analytics" ink="team" />
        <div className="mt-6">
          <EmptyIssue variant="generic" ink="team" />
        </div>
      </div>
    );
  }

  const { stats, viewsOverTime, topSchools } = data;
  const hasInterest = stats.profileViews > 0;

  return (
    <div className={`${PAGE_SHELL} space-y-8`}>
      <SectionMasthead
        eyebrow="THE PASSPORT · LAST 30 DAYS"
        title="Analytics"
        ink="team"
        actions={hasInterest ? <InkBadge tone="sodium" label="A school viewed you" /> : undefined}
      >
        <p className="max-w-prose font-annual text-body-sm text-text-secondary">
          Track your recruiting activity over the last 30 days.
        </p>
      </SectionMasthead>

      <KPIContentsStrip
        columns={4}
        items={[
          { label: 'Profile Views', value: stats.profileViews },
          { label: 'Watchlist Adds', value: stats.watchlistAdds },
          { label: 'Video Views', value: stats.videoViews },
          { label: 'Messages', value: stats.messagesSent },
        ]}
      />

      <ClimbArc
        title="Profile views"
        unit="views"
        points={viewsOverTime.map((v) => ({ label: formatDateLabel(v.date), value: v.views }))}
      />

      <PaperCard className="p-5">
        <Eyebrow as="h2">Top schools viewing your profile</Eyebrow>
        <p className="mt-1 font-annual text-body-sm text-text-secondary">
          Schools that have shown the most interest.
        </p>

        <div className="mt-6">
          {topSchools.length > 0 ? (
            <div className="flex flex-col gap-6">
              {topSchools.map((school, i) => (
                <Reveal key={`${school.school_id}-${i}`} staggerIndex={Math.min(i, 10)}>
                  <RuledStatLine
                    label={`${i + 1}. ${school.school_name}${school.division ? ` · ${school.division}` : ''}`}
                    value={school.view_count}
                    unit={school.view_count === 1 ? 'view' : 'views'}
                    ink="team"
                    leader={i === 0 && school.view_count > 0}
                  />
                </Reveal>
              ))}
            </div>
          ) : (
            <EditorsLetter
              ink="team"
              live
              title="No school views yet."
              body="Keep your profile complete and recruiting activated — interest shows up here the moment a coach opens your page."
            />
          )}
        </div>
      </PaperCard>
    </div>
  );
}
