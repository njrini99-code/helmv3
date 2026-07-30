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
// SCOPE: this page keeps the `.living-annual` cream override locally because it
// is the full editorial passport surface, while the route-group layout owns the
// shared Fairway shell frame.
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
import { isRecruitingEnabled } from '@/lib/baseball/product-modules';
import { showRecruitingActivationPrompt } from '@/lib/baseball/recruiting-activation';
import { cn } from '@/lib/utils';
import { IconArrowLeft, IconChevronRight } from '@/components/icons';
import { createClient } from '@/lib/supabase/server';

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

  // Activate Recruiting nudge (conn-baseball-player Finding 2 — same
  // persistent-surface rationale as Player Today: the nav entry has no rail
  // slot by design, so the daily/identity surfaces carry the one-time nudge
  // instead). Honest degrade: a failed read just hides the banner.
  //
  // Skipped entirely while the module is off — this is a per-request round trip
  // whose only consumer is a banner the sunset hides, so running it would be
  // paying for an answer nothing can use.
  let recruitingActivation: { activated: boolean } | null = null;
  if (settings.playerId && isRecruitingEnabled()) {
    try {
      const supabase = await createClient();
      const { data: recruitingRow } = await supabase
        .from('baseball_players')
        .select('recruiting_activated, player_type')
        .eq('id', settings.playerId)
        .maybeSingle();
      if (recruitingRow && recruitingRow.player_type !== 'college') {
        recruitingActivation = { activated: recruitingRow.recruiting_activated === true };
      }
    } catch {
      recruitingActivation = null;
    }
  }

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

        {/* Activate Recruiting nudge — see the module-header comment on the
            recruitingActivation fetch above. The read-time gate is repeated
            here rather than left implicit in `recruitingActivation === null`,
            so the sunset is visible at the surface a reader is looking at. */}
        {showRecruitingActivationPrompt(
          Boolean(recruitingActivation && !recruitingActivation.activated),
        ) && (
          <EditorsLetter
            className="mb-6"
            ink="team"
            live
            liveLabel="One-time"
            title="Activate recruiting to be seen by college coaches"
            body="Right now your Passport is invisible to recruiters, no matter what you set below. Turn on recruiting exposure once to let college coaches discover it."
            action={
              <Link
                href="/baseball/dashboard/activate"
                className={pressableClass({
                  ink: 'team',
                  className:
                    'inline-flex items-center gap-1.5 rounded-card bg-grade-plus px-4 py-2 font-annual text-body-sm font-semibold text-white',
                })}
              >
                Activate Recruiting
                <IconChevronRight size={16} aria-hidden />
              </Link>
            }
          />
        )}

        {/* Exposure-state callout — surfaced prominently so the player always
            knows whether their passport is visible to scouts or locked internally.
            When staff_only, a non-alarmist nudge directs them to the controls
            below to unlock. When exposed, a confirmation keeps them informed. */}
        {settings.playerId && settings.visibilityState === 'staff_only' ? (
          <EditorsLetter
            className="mb-6"
            ink="team"
            title="Your passport is internal-only"
            body={
              // The "set your exposure level below" instruction is only
              // actionable while an exposure tile exists to set. With recruiting
              // sunset, PassportVisibilityControls withholds the public_profile
              // and scout_packet tiles entirely, so this copy sent the player
              // hunting for a control that is not rendered — and framed a
              // permanent product state ("can't see it YET") as a pending task.
              isRecruitingEnabled()
                ? "College coaches and scouts can't see it yet. Use the Visibility Controls below to set your exposure level when you're ready."
                : 'Your passport stays inside your program — your coaches and staff can open it, nobody outside can. Use the Visibility Controls below to choose what your staff sees.'
            }
          />
        ) : null}
        {/* Exposure CONFIRMATION. Only true while there is an outside audience
            to be exposed to. A player who set public_profile/scout_packet before
            the sunset still has that value stored, and this banner asserted
            "available to anyone with the link" / "your program can share your
            passport with college coaches" — both false once the packet route and
            public discovery are closed. Telling a player their personal data is
            public when it is not is the more alarming direction of that error,
            so state what is actually true instead. */}
        {settings.playerId &&
        (settings.visibilityState === 'public_profile' ||
          settings.visibilityState === 'scout_packet') ? (
          isRecruitingEnabled() ? (
            <EditorsLetter
              className="mb-6"
              ink="team"
              live
              liveLabel={
                settings.visibilityState === 'scout_packet' ? 'Scout packet ready' : 'Public'
              }
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
          ) : (
            <EditorsLetter
              className="mb-6"
              ink="team"
              title="Your passport stays inside your program"
              body="You set this passport to be shared outside the program earlier. Outside sharing isn't part of BaseballHelm right now, so nobody beyond your coaches and staff can open it. Your setting is kept as-is."
            />
          )
        ) : null}

        <PlayerPassportFairway model={passport} />

        {/* Visibility Controls — the WRITE surface for exposure + per-field
            visibility. Self path: no playerId. Only rendered when this player has
            a resolvable settings target (a roster player on the active team). */}
        {settings.playerId && (
          <div className="mt-8">
            <PassportVisibilityControls
              publicProfilePlayerId={settings.playerId}
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
