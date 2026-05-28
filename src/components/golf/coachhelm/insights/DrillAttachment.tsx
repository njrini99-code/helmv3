'use client';

/**
 * DrillAttachment — renders up to three drills attached to an insight.
 *
 * Two modes:
 *  - **Pre-fetched** (preferred): parent passes `drills` directly. Common on
 *    server-rendered dashboards where we've already joined the attachment
 *    table — no extra round-trip, no loading spinner.
 *  - **Self-fetching**: parent only has an `insightId`. The component calls
 *    `getDrillsForInsight` once on mount and caches the result in local
 *    state. RLS on the attachments table handles authorization.
 *
 * Rendering rules:
 *  - 0 drills → render nothing (no empty "suggested drills" heading).
 *  - 1-3 drills → glass-style cards, top-3 by rank.
 *  - Clicking a drill fires `recordDrillView` for analytics. If the drill
 *    has a `video_url` we open it in a new tab; until video content lands
 *    the click just logs and no-ops the link.
 */
import { useEffect, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { IconPlay, IconTarget } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  getDrillsForInsight as defaultGetDrillsForInsight,
  recordDrillView as defaultRecordDrillView,
  type InsightDrill,
} from '@/app/golf/actions/drills';

export interface DrillAttachmentProps {
  insightId: string;
  /** Pre-fetched drills (preferred). When supplied we skip the server call. */
  drills?: InsightDrill[];
  /** Injected for tests — defaults to the real server action. */
  getDrills?: (insightId: string) => Promise<InsightDrill[]>;
  /** Injected for tests — defaults to the real server action. */
  onView?: (drillId: string) => Promise<void> | void;
}

const DIFFICULTY_LABELS: Record<InsightDrill['difficulty'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const CATEGORY_LABELS: Record<string, string> = {
  putting: 'Putting',
  tee: 'Tee game',
  approach: 'Approach',
  short_game: 'Short game',
  scoring: 'Scoring',
  pressure: 'Pressure',
  course_management: 'Course management',
};

export function DrillAttachment({
  insightId,
  drills: drillsProp,
  getDrills = defaultGetDrillsForInsight,
  onView = defaultRecordDrillView,
}: DrillAttachmentProps) {
  // When parent pre-fetches we trust the array as-is and never call the
  // server. `loaded` tracks whether we've at least attempted a fetch so the
  // "zero drills" case renders null on both paths.
  const [fetched, setFetched] = useState<InsightDrill[] | null>(
    drillsProp ? drillsProp : null,
  );
  const [loaded, setLoaded] = useState<boolean>(Boolean(drillsProp));

  useEffect(() => {
    // Re-sync when parent hands us a fresh array.
    if (drillsProp) {
      setFetched(drillsProp);
      setLoaded(true);
      return;
    }
    let alive = true;
    (async () => {
      const result = await getDrills(insightId);
      if (alive) {
        setFetched(result);
        setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
    // `getDrills` is an external action — identity change should not retrigger
    // fetch. We intentionally depend only on the inputs that meaningfully
    // change what the user sees.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightId, drillsProp]);

  if (!loaded) return null;
  const drills = (fetched ?? []).slice(0, 3);
  if (drills.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-warm-500">
        <IconTarget size={14} />
        Suggested drills
      </div>
      <ul className="space-y-2">
        {drills.map((drill) => (
          <li key={drill.id}>
            <DrillCard drill={drill} onView={onView} />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface DrillCardProps {
  drill: InsightDrill;
  onView: (drillId: string) => Promise<void> | void;
}

function DrillCard({ drill, onView }: DrillCardProps) {
  const [pending, startTransition] = useTransition();
  const categoryLabel = CATEGORY_LABELS[drill.category] ?? drill.category;
  const difficultyLabel = DIFFICULTY_LABELS[drill.difficulty];
  const primaryTag = drill.tags[0];

  const handleClick = () => {
    startTransition(() => {
      void Promise.resolve(onView(drill.id));
    });
    if (drill.video_url) {
      // Open in new tab so we don't navigate away from the dashboard.
      if (typeof window !== 'undefined') {
        window.open(drill.video_url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <Button variant="ghost"
      type="button"
      onClick={handleClick}
      disabled={pending}
      data-testid="drill-card"
      className={cn(
        'group w-full text-left',
        'bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl ',
        'px-4 py-3',
        'hover:bg-cream-100/82 hover:shadow-card-hover transition-all duration-200',
        'disabled:opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-warm-900 truncate">
              {drill.title}
            </span>
            {drill.video_url && (
              <IconPlay
                size={14}
                className="text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            )}
          </div>
          <div className="mt-0.5 text-xs text-warm-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span>{difficultyLabel}</span>
            <span aria-hidden>·</span>
            <span>{categoryLabel}</span>
            {primaryTag && (
              <>
                <span aria-hidden>·</span>
                <span>{primaryTag.replace(/_/g, ' ')}</span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-warm-600 line-clamp-2">{drill.description}</p>
        </div>
        <div className="flex-shrink-0 text-xs text-warm-500 tabular-nums whitespace-nowrap">
          {drill.duration_min} min
        </div>
      </div>
    </Button>
  );
}
