// =============================================================================
// src/app/baseball/(dashboard)/dashboard/players/[id]/scout-packet/page.tsx
//
// V5 Scout Packet — the STAFF manage surface for ONE player's share links.
// Showcase variant: "scout packet export · college coach viewer access".
//
// A coach with export rights mints/copies/revokes share links and previews the
// packet exactly as a scout would see it. The export capability is enforced
// server-side by the actions (mint/list/revoke); this page also reflects the
// passport exposure + program-export guardrails so a coach knows WHY minting is
// blocked when it is.
// =============================================================================

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  listScoutPacketLinks,
  getScoutPacketPreview,
} from '@/app/baseball/actions/scout-packet';
import { createClient } from '@/lib/supabase/server';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { ScoutPacketManager } from '@/components/baseball/passport/ScoutPacketManager';
import { IconArrowLeft } from '@/components/icons';
import type {
  PassportShareLinkView,
  PassportVisibilityState,
} from '@/lib/types/baseball-passport';

export const metadata = {
  title: 'Scout Packet · BaseballHelm',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CoachScoutPacketPage({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();

  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/dashboard');
  if (context.activeRole !== 'coach') redirect('/baseball/player/passport');

  // Export capability gate (head/primary coach implicitly hold it).
  const caps = await resolveBaseballCapabilities(context.activeTeamId);
  if (!(caps.can_export_reports || caps.is_head_coach)) {
    redirect(`/baseball/dashboard/players/${id}/passport`);
  }

  const supabase = await createClient();

  // Player identity + passport exposure + program export setting + links.
  const [playerRow, settingsRow, settings, links] = await Promise.all([
    supabase.from('baseball_players')
      .select('first_name, last_name')
      .eq('id', id)
      .maybeSingle()
      .then((r: { data: unknown }) => (r.data as Record<string, unknown> | null) ?? null),
    supabase.from('baseball_player_passport_settings')
      .select('visibility_state')
      .eq('player_id', id)
      .eq('team_id', context.activeTeamId)
      .maybeSingle()
      .then((r: { data: unknown }) => (r.data as Record<string, unknown> | null) ?? null),
    supabase.from('baseball_program_settings')
      .select('scout_access_enabled, scout_can_export')
      .eq('team_id', context.activeTeamId)
      .maybeSingle()
      .then((r: { data: unknown }) => (r.data as Record<string, unknown> | null) ?? null),
    listScoutPacketLinks(id).catch(() => [] as PassportShareLinkView[]),
  ]);

  const playerName =
    [playerRow?.first_name, playerRow?.last_name].filter(Boolean).join(' ').trim() || 'Player';
  const visibilityState: PassportVisibilityState =
    (settingsRow?.visibility_state as PassportVisibilityState) ?? 'staff_only';
  const exportEnabled =
    Boolean(settings?.scout_access_enabled) && Boolean(settings?.scout_can_export);

  // Validate the packet would actually assemble (preview) for the inline notice.
  const preview = await getScoutPacketPreview(id).catch(() => null);

  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        <Link
          href={`/baseball/dashboard/players/${id}/passport`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-warm-500 transition-colors hover:text-warm-700"
        >
          <IconArrowLeft size={16} />
          Back to passport
        </Link>

        <header className="mb-6">
          <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
            Scout Packet
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">{playerName}</h1>
          <p className="mt-1 text-warm-500">
            Share this player&rsquo;s source-backed packet with college coaches — verified
            measurables, performance, video, and contact rules only.
          </p>
        </header>

        <ScoutPacketManager
          playerId={id}
          playerName={playerName}
          visibilityState={visibilityState}
          exportEnabled={exportEnabled}
          initialLinks={links}
          previewHref={`/baseball/dashboard/players/${id}/scout-packet/preview`}
        />

        {preview && !preview.ok && (
          <p className="mt-4 text-sm text-warm-500">
            Heads up: this packet currently has nothing a scout could see ({preview.reason}). Expose
            the passport and mark fields public/scout to build it out.
          </p>
        )}
      </div>
    </div>
  );
}
