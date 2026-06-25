// =============================================================================
// src/app/baseball/(dashboard)/dashboard/players/[id]/passport/page.tsx
//
// V5 Player Passport — the DEDICATED full passport surface (COACH/STAFF view).
//
// Spec: docs/.../19_breakthrough_product_systems_v5/
//        v5_player_passport_and_recruiting_showcase_system.md
//   "internal player passport · player meeting · roster evaluation"
//
// The staff full passport for ONE player: Identity + Verified Measurables +
// Development Story + Media + Baseball Performance + Completeness, every section
// non-compact, with honest provenance per item. This is the surface a coach
// pulls up for a player meeting or roster evaluation.
//
// ACCESS: the active baseball context establishes the staff viewer + team. The
// read model resolves viewerRole='staff' from the session and gates every
// section through RLS + the in-process viewer filter — a coach only ever sees a
// player on a team they staff. Team scoping comes from the active context (the
// same team the Media/video read model resolves), so the sections stay aligned.
// An honest authorized:false envelope renders the not-available state.
// =============================================================================

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  getPlayerPassport,
  getPassportSettingsForEditor,
} from '@/lib/baseball/read-models/player-passport';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import {
  PlayerPassportCard,
  PassportVisibilityControls,
} from '@/components/baseball/passport';
import { IconArrowLeft, IconShieldCheck } from '@/components/icons';

export const metadata = {
  title: 'Player Passport · BaseballHelm',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CoachPlayerPassportPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const context = await getActiveBaseballContext();
  if (!context) {
    redirect('/baseball/dashboard');
  }
  // Coaches/staff only — players reach their own passport via /baseball/player/passport.
  if (context.activeRole !== 'coach') {
    redirect('/baseball/player/passport');
  }

  // FULL mode for the target player, scoped to the active team (which is also the
  // team the Media/video read model resolves — keeps every section aligned).
  const [passport, caps, settings] = await Promise.all([
    getPlayerPassport(context.activeTeamId, { playerId: id, mode: 'full' }),
    resolveBaseballCapabilities(context.activeTeamId),
    getPassportSettingsForEditor(context.activeTeamId, id),
  ]);
  // Scout-packet sharing is the OUTBOUND action; only export-capable staff see
  // the affordance. The passport must additionally be exposed to actually share,
  // which the manage surface enforces + explains inline.
  const canShare = caps.can_export_reports || caps.is_head_coach;
  const exposed =
    passport.visibilityState === 'public_profile' ||
    passport.visibilityState === 'scout_packet';

  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        <Link
          href={`/baseball/dashboard/players/${id}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-warm-500 transition-colors hover:text-warm-700"
        >
          <IconArrowLeft size={16} />
          Back to profile
        </Link>

        <header className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
              Player Passport
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">
              Roster evaluation
            </h1>
            <p className="mt-1 text-warm-500">
              The source-backed proof packet for player meetings and roster evaluation —
              measurables, development story, video, and performance with full provenance.
            </p>
          </div>
          {canShare && (
            <Link
              href={`/baseball/dashboard/players/${id}/scout-packet`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
            >
              <IconShieldCheck size={15} />
              {exposed ? 'Scout packet' : 'Share as packet'}
            </Link>
          )}
        </header>

        <PlayerPassportCard model={passport} />

        {/* Staff Visibility Controls — staff edit the TARGET player's exposure +
            per-field visibility. The action authorizes via can_manage_roster and
            RLS independently. canEdit reflects the resolved gate. */}
        {settings.playerId && settings.canEdit && (
          <div className="mt-8">
            <PassportVisibilityControls
              playerId={id}
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
