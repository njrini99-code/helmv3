// =============================================================================
// src/app/baseball/(player-dashboard)/player/passport/page.tsx
//
// V5 Player Passport — the DEDICATED full passport surface (self view).
//
// Spec: docs/.../19_breakthrough_product_systems_v5/
//        v5_player_passport_and_recruiting_showcase_system.md
//   "Recruiting platforms have profiles. BaseballHelm should have proof."
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
// HONESTY: an unauthorized envelope renders the not-available state (the card's
// own empty state) rather than redirect-looping or fabricating a passport.
// =============================================================================

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  getPlayerPassport,
  getPassportSettingsForEditor,
} from '@/lib/baseball/read-models/player-passport';
import {
  PlayerPassportCard,
  PassportVisibilityControls,
} from '@/components/baseball/passport';
import { IconArrowLeft, IconAlertCircle, IconShieldCheck } from '@/components/icons';

export const metadata = {
  title: 'Passport · BaseballHelm',
};

export default async function PlayerPassportPage() {
  const context = await getActiveBaseballContext();
  if (!context) {
    redirect('/baseball/player');
  }

  // FULL mode — assembles Development Story, Media, and Baseball Performance on
  // top of the compact snapshot. Settings drive the Visibility Controls editor
  // (the self path: no playerId → the read model resolves the current user).
  const [passport, settings] = await Promise.all([
    getPlayerPassport(context.activeTeamId, { mode: 'full' }),
    getPassportSettingsForEditor(context.activeTeamId),
  ]);

  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Back to Today */}
        <Link
          href="/baseball/player/today"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-warm-500 transition-colors hover:text-warm-700"
        >
          <IconArrowLeft size={16} />
          Back to Today
        </Link>

        <header className="mb-8">
          <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
            Player Passport
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">
            Your proof packet
          </h1>
          <p className="mt-1 text-warm-500">
            Source-backed identity, measurables, development story, video, and performance —
            everything that turns a profile into proof.
          </p>
        </header>

        {/* Exposure-state callout — surfaced prominently so the player always
            knows whether their passport is visible to scouts or locked internally.
            When staff_only, a non-alarmist nudge directs them to the controls
            below to unlock. When exposed, a confirmation keeps them informed. */}
        {settings.playerId && (
          <>
            {settings.visibilityState === 'staff_only' && (
              <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                <IconAlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    Your passport is internal-only
                  </p>
                  <p className="mt-0.5 text-sm text-amber-700">
                    College coaches and scouts can&apos;t see it yet. Use the Visibility Controls
                    below to set your exposure level when you&apos;re ready.
                  </p>
                </div>
              </div>
            )}
            {(settings.visibilityState === 'public_profile' ||
              settings.visibilityState === 'scout_packet') && (
              <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3.5">
                <IconShieldCheck size={16} className="mt-0.5 shrink-0 text-primary-600" />
                <p className="text-sm text-primary-800">
                  {settings.visibilityState === 'scout_packet'
                    ? 'Your passport is exposed and scout-packet-ready. Your program can share it with college coaches.'
                    : 'Your passport is publicly visible. Your profile fields are available to anyone with the link.'}
                </p>
              </div>
            )}
          </>
        )}

        <PlayerPassportCard model={passport} />

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
