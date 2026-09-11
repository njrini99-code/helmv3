import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Route-level loading fallback for /golf/dashboard/team (Team Settings / Info).
 *
 * This route forks by role on the server — FairwayTeamSettings for coaches,
 * FairwayTeamInfo for players (FairwayTeam.tsx) — and this fallback has no
 * access to that resolved role, so it shape-matches the COACH first paint,
 * the same default `../tasks/loading.tsx` takes for its own role fork. A
 * player's real first paint is a `flex flex-col gap-10` stack of icon-headed
 * sections (Head coach → Announcements → My tasks → Roster) instead of the
 * sections below — genuinely different content, not something a role-blind
 * fallback can also reproduce.
 *
 * Ground-truthed against FairwayTeamSettings.tsx's actual first paint (before
 * any client-side fetch resolves): masthead (ViewHeader — eyebrow, title,
 * description, then gender badge · season · established, view-header.tsx:270-334)
 * → Player invitations (join code + copy, its own trailing "Players enter
 * this when they sign up…" caption at FairwayTeamSettings.tsx:636-638, then
 * the "Invite link" eyebrow label + input at FairwayTeamSettings.tsx:643-649,
 * copy + regenerate row, plus the trailing "Regenerating will invalidate…"
 * caption at FairwayTeamSettings.tsx:699-702, still inside the Surface) → Staff
 * invitations (heading + description live INSIDE the same bordered Surface as
 * the role toggle/create-invite row — StaffInviteSection,
 * FairwayTeamSettings.tsx:1153-1163 — not as siblings above it) → Team
 * information form (program badge, team name, season, Save) → Add a team.
 * `CoachingStaffSection` and `PendingAssistantsSection` are deliberately
 * OMITTED: both start `loading`/unloaded and render `null` until their own
 * client-side fetch resolves, so neither is part of the real first paint.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[760px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading team…</span>

        {/* Masthead — ViewHeader (eyebrow · title · gender badge · season · established) */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-56 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <div className="mt-1 flex items-center gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>

        {/* Player invitations — code + copy, invite link input, regenerate row */}
        <section className="mt-8">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-1.5 h-3.5 w-72 max-w-full" />
          <Surface elevation="border" padding="md" className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-2.5 w-20" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-8 w-24 rounded-fw-md" />
              </div>
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-11 w-full rounded-fw-md" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-9 w-40 rounded-fw-md" />
              <Skeleton className="h-9 w-40 rounded-fw-md" />
            </div>
            <Skeleton className="h-3 w-56 max-w-full" />
          </Surface>
        </section>

        {/* Staff invitations — heading + description live INSIDE the same
            bordered Surface as the toggle/button row (FairwayTeamSettings.tsx:1155-1163). */}
        <section className="mt-10">
          <Surface elevation="border" padding="md" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-1 h-3.5 w-80 max-w-full" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-9 w-56 rounded-full" />
              <Skeleton className="h-9 w-40 rounded-fw-md" />
            </div>
            <Skeleton className="h-3 w-64 max-w-full" />
          </Surface>
        </section>

        {/* Team information — editable form (program badge, name, season) + Save */}
        <section className="mt-10">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-1.5 h-3.5 w-64 max-w-full" />
          <div className="mt-5 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-11 w-full rounded-fw-md" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-11 w-full rounded-fw-md" />
            </div>
            <Skeleton className="ml-auto h-9 w-32 rounded-fw-md" />
          </div>
        </section>

        {/* Add a team — program-head affordance */}
        <section className="mt-10 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28 flex-shrink-0 rounded-fw-md" />
        </section>
      </div>
    </div>
  );
}
