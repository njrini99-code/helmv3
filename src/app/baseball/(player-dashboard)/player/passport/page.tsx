// =============================================================================
// src/app/baseball/(player-dashboard)/player/passport/page.tsx
//
// V5 Player Passport — the DEDICATED full passport surface (self view), now
// composed on the "Living Annual" kit (docs/baseball/design-system-living-
// annual.md; execution plan docs/baseball/ui-migration-execution-plan.md §3.3
// `passport`). PRESENTATION ONLY — the data flow below (context resolution,
// getPlayerPassport/getPassportSettingsForEditor, redirect, prop shapes into
// PassportVisibilityControls) is byte-for-byte the same as before this pass.
//
// The compact Passport on Today is a snapshot; THIS page is the full,
// source-backed proof packet — Identity + Verified Measurables + Development
// Story + Media + Baseball Performance + Completeness, every section non-compact
// with honest provenance per item.
//
// SELF-ONLY: getPlayerPassport resolves the player from the session (no player
// id from the URL) and only assembles that player's data. RLS + the read model's
// viewer gate back every section; nothing here widens access.
//
// HONESTY: an unauthorized envelope renders the not-available state (the
// Fairway component's own empty state) rather than redirect-looping or
// fabricating a passport.
//
// SCOPE: `/baseball/player/*` (the `(player-dashboard)` route group) has no
// Fairway shell equivalent to `(dashboard)/BaseballFairwayShell.tsx` yet — that
// shell is explicitly frozen to its own route group this migration (§6). This
// page therefore carries BOTH the `.fairway-ds` token scope and the
// `.living-annual` cream override itself (mirroring what the legacy
// `bg-cream-100` wrapper did), same as the page-local pattern documented in
// §1 for a surface no ancestor shell already scopes.
// =============================================================================

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  getPlayerPassport,
  getPassportSettingsForEditor,
} from '@/lib/baseball/read-models/player-passport';
import {
  PlayerPassportFairway,
  PassportVisibilityControls,
} from '@/components/baseball/passport';
import { EditorsLetter, pressableClass } from '@/components/baseball/living-annual';
import { fairwayScope } from '@/lib/redesign/flag';
import { cn } from '@/lib/utils';
import { IconArrowLeft } from '@/components/icons';

export const metadata = {
  title: 'Passport · BaseballHelm',
};

export default async function PlayerPassportPage() {
  // TEAMLESS (#463): a player can finish onboarding with NO team ("Skip for
  // Now"), so context resolves null even though onboarding is already done.
  // Redirecting to /baseball/player (the onboarding wizard) bounced such a
  // player right back into setup instead of the honest join-team terminal
  // Today already renders for this exact state (PlayerTodayTeamless). Send
  // them to Today instead — same surface, no dead-end, no onboarding loop.
  const context = await getActiveBaseballContext();
  if (!context) {
    redirect('/baseball/player/today');
  }

  // FULL mode — assembles Development Story, Media, and Baseball Performance on
  // top of the compact snapshot. Settings drive the Visibility Controls editor
  // (the self path: no playerId → the read model resolves the current user).
  const [passport, settings] = await Promise.all([
    getPlayerPassport(context.activeTeamId, { mode: 'full' }),
    getPassportSettingsForEditor(context.activeTeamId),
  ]);

  return (
    <div className={cn(fairwayScope('min-h-dvh'), 'living-annual')}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Back to Today */}
        <Link
          href="/baseball/player/today"
          className={pressableClass({
            ink: 'team',
            tint: false,
            className:
              'mb-6 inline-flex items-center gap-1.5 rounded-fw-sm text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary hover:text-grade-plus',
          })}
        >
          <IconArrowLeft size={14} aria-hidden />
          Back to Today
        </Link>

        {/* Exposure-state callout — surfaced prominently so the player always
            knows whether their passport is visible to scouts or locked internally.
            When staff_only, a non-alarmist nudge directs them to the controls
            below to unlock. When exposed, a confirmation keeps them informed. */}
        {settings.playerId && settings.visibilityState === 'staff_only' ? (
          <EditorsLetter
            className="mb-6"
            ink="team"
            title="Your passport is internal-only"
            body="College coaches and scouts can't see it yet. Use the Visibility Controls below to set your exposure level when you're ready."
          />
        ) : null}
        {settings.playerId &&
        (settings.visibilityState === 'public_profile' ||
          settings.visibilityState === 'scout_packet') ? (
          <EditorsLetter
            className="mb-6"
            ink="team"
            live
            liveLabel={settings.visibilityState === 'scout_packet' ? 'Scout packet ready' : 'Public'}
            title={
              settings.visibilityState === 'scout_packet'
                ? 'Exposed & scout-packet-ready'
                : 'Your passport is public'
            }
            body={
              settings.visibilityState === 'scout_packet'
                ? 'Your program can share your passport with college coaches.'
                : 'Your profile fields are available to anyone with the link.'
            }
          />
        ) : null}

        <PlayerPassportFairway model={passport} />

        {/* Visibility Controls — the WRITE surface for exposure + per-field
            visibility. Self path: no playerId. Only rendered when this player has
            a resolvable settings target (a roster player on the active team). */}
        {settings.playerId && (
          <div className="mt-8">
            <PassportVisibilityControls
              initialState={settings.visibilityState}
              initialHeadline={settings.headline}
              initialFieldVisibility={settings.fieldVisibility}
              canEdit={settings.canEdit}
            />
          </div>
        )}
      </div>
    </div>
  );
}
