import Link from 'next/link';
import { Surface } from '@/components/fairway';
import type { PulseTeamRow } from '@/lib/admin/data/pulse-grid';
import { LocalTime } from '../_components/LocalTime';
import { SportBadge } from '../_components/SportBadge';
import { PanelNoData } from '../_components/PanelStates';

/**
 * `/admin/thread/[entity]/[id]` has no nav entry anywhere in Bridge — the
 * only way an operator reaches one today is clicking a row on the Teams
 * pulse table (`TeamRow` already links to `team.threadHref`). This strip
 * surfaces a handful of them directly, from the SAME `grid.teams` that page
 * already fetched for that table — no new query, just a different sort/slice
 * of data already in hand. Team threads only: the Teams pulse page never
 * loads a user-level activity feed, so a "user threads" row here would have
 * to be invented rather than derived.
 *
 * Kept in its own module (not inlined in page.tsx) so it can be exported and
 * unit-tested directly — `admin-gate-coverage.test.ts` requires every
 * exported function in a page.tsx/layout.tsx/actions file to reach
 * requireSuperAdmin(), which a presentational strip like this has no reason
 * to do itself (the page's own gate already covers the whole tree).
 */
export function RecentTimelines({ teams }: { teams: PulseTeamRow[] }) {
  const recent = [...teams]
    .filter((team): team is PulseTeamRow & { lastActivityDate: string } => team.lastActivityDate !== null)
    .sort((a, b) => b.lastActivityDate.localeCompare(a.lastActivityDate))
    .slice(0, 6);

  return (
    <Surface padding="sm">
      <p className="text-eyebrow uppercase text-warm-500">Recent timelines</p>
      {recent.length === 0 ? (
        <div className="mt-2">
          <PanelNoData
            label="No recent timelines"
            description="A team's timeline appears here once it has activity in the pulse window."
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {recent.map((team) => (
            <Link
              key={team.teamId}
              href={team.threadHref}
              className="flex min-h-11 items-center gap-2 rounded-full border border-warm-200 bg-surface-sunken px-3 py-2 text-sm text-warm-800 transition-colors hover:bg-surface"
            >
              <SportBadge sport={team.sport} />
              <span className="max-w-[10rem] truncate font-medium">{team.name}</span>
              <span className="font-fw-mono text-xs text-warm-500">
                {/* lastActivityDate is a bare YYYY-MM-DD (no time-of-day signal
                    in the source data) — noon UTC is the synthesized instant
                    least likely to roll to the WRONG calendar date once
                    LocalTime converts it to the viewer's zone. It only
                    misdates for viewers east of roughly UTC+12. */}
                last <LocalTime iso={`${team.lastActivityDate}T12:00:00Z`} variant="date" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </Surface>
  );
}
