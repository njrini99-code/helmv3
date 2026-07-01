'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/scout-packet.ts
//
// V5 Scout Packet — export ACTIONS (the ACTION link in the chain).
//
// Spec: v5_player_passport_and_recruiting_showcase_system.md §Scout Packet
//   Export forms: web packet · PDF later · CSV summary.
//   Showcase variant: "scout packet export · college coach viewer access".
//
// This file owns the staff-facing export surface:
//   * mintScoutPacketLink    — generate a revocable share link for a (player)
//                              whose passport is exposed. can_export_reports.
//   * listScoutPacketLinks   — list a player's share links for staff management.
//   * revokeScoutPacketLink  — revoke a link (non-destructive; status->revoked).
//   * relabelScoutPacketLink — rename a link's recipient label.
//   * getScoutPacketPreview  — staff "preview as a scout" of a player's packet.
//
// Plus a NON-action server helper used by the PUBLIC route (no session):
//   * resolveScoutPacketByToken — server-role token resolution + assembly, with
//                                 view-count telemetry. NOT a server action (it
//                                 is called from the route handler, not a form).
//
// SECURITY:
//   * Every staff action runs inside withBaseballAction (capability enforced
//     server-side). Minting/managing requires can_export_reports — head/primary
//     coach implicitly hold it.
//   * A link can only be minted when the passport's visibility_state ∈
//     ('public_profile','scout_packet') AND the program's scout export setting is
//     on — exposure is the SIGNAL gate the spec requires before export is legal.
//   * resolveScoutPacketByToken uses the SERVER role deliberately (an anon scout
//     has no RLS grant). The scout-packet read model is the gate: it returns
//     'not_exposed' unless exposed, and never emits a field below scout rank.
//   * No destructive writes: tokens are revoked (status flip), not deleted in the
//     normal path.
// =============================================================================

import { randomBytes } from 'crypto';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { getAppUrl } from '@/lib/utils/env';
import {
  assembleScoutPacket,
  type ScoutPacketModel,
} from '@/lib/baseball/read-models/scout-packet';
import type {
  PassportShareLinkView,
  PassportVisibilityState,
} from '@/lib/types/baseball-passport';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** A URL-safe opaque token (~32 bytes of entropy, base64url). */
function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Public packet URL for a token. */
function packetUrl(token: string): string {
  return `${getAppUrl().replace(/\/$/, '')}/baseball/packet/${token}`;
}

function toLinkView(row: Record<string, unknown>): PassportShareLinkView {
  const status = (row.status as string) === 'revoked' ? 'revoked' : 'active';
  const expiresAt = (row.expires_at as string | null) ?? null;
  const notExpired = !expiresAt || new Date(expiresAt).getTime() > Date.now();
  const token = String(row.token ?? '');
  return {
    id: String(row.id ?? ''),
    recipientLabel: (row.recipient_label as string | null) ?? null,
    packetKind: (row.packet_kind as 'scout' | 'transfer') ?? 'scout',
    status,
    url: packetUrl(token),
    token,
    expiresAt,
    isLive: status === 'active' && notExpired,
    viewCount: typeof row.view_count === 'number' ? row.view_count : 0,
    lastViewedAt: (row.last_viewed_at as string | null) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

/** Read the passport exposure state for a (player, team), staff-RLS scoped. */
async function readVisibilityState(
  playerId: string,
  teamId: string,
): Promise<PassportVisibilityState> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'baseball_player_passport_settings')
    .select('visibility_state')
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .maybeSingle();
  return (
    ((data as Record<string, unknown> | null)?.visibility_state as PassportVisibilityState) ??
    'staff_only'
  );
}

/** Is the team's scout export setting on? (program-level guardrail). */
async function scoutExportEnabled(teamId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'baseball_program_settings')
    .select('scout_access_enabled, scout_can_export')
    .eq('team_id', teamId)
    .maybeSingle();
  const s = (data as Record<string, unknown> | null) ?? {};
  // Default-permissive only when no settings row exists yet is WRONG for export —
  // require an explicit row that enables both scout access AND export.
  return Boolean(s.scout_access_enabled) && Boolean(s.scout_can_export);
}

// -----------------------------------------------------------------------------
// mintScoutPacketLink
// -----------------------------------------------------------------------------

export const mintScoutPacketLink = withBaseballAction(
  'mintScoutPacketLink',
  { featureArea: 'baseball-scout-packet', requiredCapability: 'can_export_reports' },
  async (
    ctx,
    input: { playerId: string; recipientLabel?: string | null; expiresInDays?: number | null },
  ): Promise<PassportShareLinkView> => {
    const teamId = ctx.targetTeamId;
    const playerId = input.playerId?.trim();
    if (!playerId) throw new Error('A player is required to mint a scout packet link.');

    // SIGNAL gate: passport must be exposed AND program export must be enabled.
    const [state, exportOn] = await Promise.all([
      readVisibilityState(playerId, teamId),
      scoutExportEnabled(teamId),
    ]);
    if (state !== 'public_profile' && state !== 'scout_packet') {
      throw new Error(
        'This player’s passport is not exposed. Set the passport to a public/scout state before sharing.',
      );
    }
    if (!exportOn) {
      throw new Error(
        'Scout packet export is off for this program. Enable scout access + export in Settings.',
      );
    }

    const expiresInDays =
      typeof input.expiresInDays === 'number' && input.expiresInDays > 0
        ? Math.min(input.expiresInDays, 365)
        : null;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      : null;

    const label = (input.recipientLabel ?? '').trim().slice(0, 160) || null;
    const token = generateToken();

    const supabase = await createClient();
    const { data, error } = await fromUntyped(supabase, 'baseball_player_passport_share_tokens')
      .insert({
        player_id: playerId,
        team_id: teamId,
        token,
        recipient_label: label,
        packet_kind: 'scout',
        status: 'active',
        expires_at: expiresAt,
        created_by: ctx.user.id,
      })
      .select('*')
      .maybeSingle();

    if (error || !data) throw new Error('The scout packet link could not be created.');

    revalidatePath(`/baseball/dashboard/players/${playerId}/passport`);
    revalidatePath('/baseball/dashboard/scout-packets');
    return toLinkView(data as Record<string, unknown>);
  },
);

// -----------------------------------------------------------------------------
// listScoutPacketLinks
// -----------------------------------------------------------------------------

export const listScoutPacketLinks = withBaseballAction(
  'listScoutPacketLinks',
  { featureArea: 'baseball-scout-packet', requiredCapability: 'can_export_reports' },
  async (ctx, playerId: string): Promise<PassportShareLinkView[]> => {
    const teamId = ctx.targetTeamId;
    if (!playerId?.trim()) return [];
    const supabase = await createClient();
    const { data } = await fromUntyped(supabase, 'baseball_player_passport_share_tokens')
      .select('*')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    return ((data as Array<Record<string, unknown>> | null) ?? []).map(toLinkView);
  },
);

// -----------------------------------------------------------------------------
// revokeScoutPacketLink (non-destructive: status -> revoked)
// -----------------------------------------------------------------------------

export const revokeScoutPacketLink = withBaseballAction(
  'revokeScoutPacketLink',
  { featureArea: 'baseball-scout-packet', requiredCapability: 'can_export_reports' },
  async (ctx, linkId: string): Promise<{ success: true }> => {
    const teamId = ctx.targetTeamId;
    if (!linkId?.trim()) throw new Error('A link id is required.');
    const supabase = await createClient();
    await fromUntyped(supabase, 'baseball_player_passport_share_tokens')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', linkId)
      .eq('team_id', teamId);
    revalidatePath('/baseball/dashboard/scout-packets');
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// relabelScoutPacketLink
// -----------------------------------------------------------------------------

export const relabelScoutPacketLink = withBaseballAction(
  'relabelScoutPacketLink',
  { featureArea: 'baseball-scout-packet', requiredCapability: 'can_export_reports' },
  async (ctx, input: { linkId: string; recipientLabel: string | null }): Promise<{ success: true }> => {
    const teamId = ctx.targetTeamId;
    if (!input.linkId?.trim()) throw new Error('A link id is required.');
    const label = (input.recipientLabel ?? '').trim().slice(0, 160) || null;
    const supabase = await createClient();
    await fromUntyped(supabase, 'baseball_player_passport_share_tokens')
      .update({ recipient_label: label, updated_at: new Date().toISOString() })
      .eq('id', input.linkId)
      .eq('team_id', teamId);
    revalidatePath('/baseball/dashboard/scout-packets');
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// getScoutPacketRoster — the Showcase "event roster -> scout packet" surface
//
// Lists the team's roster with each player's passport exposure + live-link count
// so a coach can drive packets straight from the roster. Gated by export rights.
// -----------------------------------------------------------------------------

export interface ScoutPacketRosterEntry {
  playerId: string;
  name: string;
  position: string | null;
  gradYear: number | null;
  visibilityState: PassportVisibilityState;
  /** True when the passport is in a public/scout state (eligible to share). */
  exposed: boolean;
  /** Count of live (active + unexpired) share links for this player. */
  liveLinkCount: number;
  /** Total share links ever minted (live + revoked + expired). */
  totalLinkCount: number;
}

export interface ScoutPacketRoster {
  /** True only when the program has scout access + export enabled. */
  exportEnabled: boolean;
  entries: ScoutPacketRosterEntry[];
}

export const getScoutPacketRoster = withBaseballAction(
  'getScoutPacketRoster',
  { featureArea: 'baseball-scout-packet', requiredCapability: 'can_export_reports' },
  async (ctx): Promise<ScoutPacketRoster> => {
    const teamId = ctx.targetTeamId;
    const supabase = await createClient();

    const exportEnabled = await scoutExportEnabled(teamId);

    // Roster members (any non-removed status). RLS scopes to the active team.
    const { data: members } = await fromUntyped(supabase, 'baseball_team_members')
      .select('player_id, position, status')
      .eq('team_id', teamId);
    const memberRows = (members as Array<Record<string, unknown>> | null) ?? [];
    const playerIds = memberRows
      .filter((m) => (m.status as string | null) !== 'removed')
      .map((m) => String(m.player_id));
    if (playerIds.length === 0) return { exportEnabled, entries: [] };

    const posByPlayer = new Map<string, string | null>(
      memberRows.map((m) => [String(m.player_id), (m.position as string | null) ?? null]),
    );

    // Player identity, passport settings, and live link counts in parallel.
    const [playersRes, settingsRes, tokensRes] = await Promise.all([
      fromUntyped(supabase, 'baseball_players')
        .select('id, first_name, last_name, primary_position, grad_year')
        .in('id', playerIds),
      fromUntyped(supabase, 'baseball_player_passport_settings')
        .select('player_id, visibility_state')
        .eq('team_id', teamId)
        .in('player_id', playerIds),
      fromUntyped(supabase, 'baseball_player_passport_share_tokens')
        .select('player_id, status, expires_at')
        .eq('team_id', teamId)
        .in('player_id', playerIds),
    ]);

    const players = (playersRes.data as Array<Record<string, unknown>> | null) ?? [];
    const stateByPlayer = new Map<string, PassportVisibilityState>(
      ((settingsRes.data as Array<Record<string, unknown>> | null) ?? []).map((s) => [
        String(s.player_id),
        (s.visibility_state as PassportVisibilityState) ?? 'staff_only',
      ]),
    );

    const liveCounts = new Map<string, number>();
    const totalCounts = new Map<string, number>();
    const now = Date.now();
    for (const t of (tokensRes.data as Array<Record<string, unknown>> | null) ?? []) {
      const pid = String(t.player_id);
      totalCounts.set(pid, (totalCounts.get(pid) ?? 0) + 1);
      const expAt = t.expires_at as string | null;
      const live =
        (t.status as string) === 'active' && (!expAt || new Date(expAt).getTime() > now);
      if (live) liveCounts.set(pid, (liveCounts.get(pid) ?? 0) + 1);
    }

    const entries: ScoutPacketRosterEntry[] = players
      .map((p) => {
        const pid = String(p.id);
        const state = stateByPlayer.get(pid) ?? 'staff_only';
        const name =
          [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Player';
        return {
          playerId: pid,
          name,
          position:
            (p.primary_position as string | null) ?? posByPlayer.get(pid) ?? null,
          gradYear: typeof p.grad_year === 'number' ? p.grad_year : null,
          visibilityState: state,
          exposed: state === 'public_profile' || state === 'scout_packet',
          liveLinkCount: liveCounts.get(pid) ?? 0,
          totalLinkCount: totalCounts.get(pid) ?? 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { exportEnabled, entries };
  },
);

// -----------------------------------------------------------------------------
// getScoutPacketPreview — staff "preview as a scout"
//
// Assembles exactly what a college coach would see, using the RLS server client
// (staff are authorized to read the underlying rows). The scout read model still
// enforces the exposure gate + scout-rank filter, so this is a true preview, not
// a privileged staff view.
// -----------------------------------------------------------------------------

export const getScoutPacketPreview = withBaseballAction(
  'getScoutPacketPreview',
  { featureArea: 'baseball-scout-packet', requiredCapability: 'can_export_reports' },
  async (ctx, playerId: string): Promise<ScoutPacketModel> => {
    const teamId = ctx.targetTeamId;
    const supabase = await createClient();
    return assembleScoutPacket(supabase, { playerId, teamId });
  },
);

// =============================================================================
// PUBLIC token resolution (NOT a server action) — used by the route handler.
// =============================================================================

/**
 * Resolve a share token to an assembled scout packet for an UNAUTHENTICATED
 * viewer. Uses the SERVER role (an anon scout holds no RLS grant). Honest
 * outcomes: a not-found / revoked / expired / not-exposed token resolves to an
 * ok:false model with a reason — never a leaked packet.
 *
 * Side effect: a successful, live resolution bumps the token's view telemetry
 * (best-effort; never blocks the packet).
 */
export async function resolveScoutPacketByToken(
  token: string,
  options: { trackView?: boolean } = {},
): Promise<ScoutPacketModel> {
  // A CSV export is data retrieval, not a human "view" of the packet, so callers
  // like the CSV route pass trackView: false to avoid inflating view_count.
  const { trackView = true } = options;
  const generatedAt = new Date().toISOString();
  const fail = (reason: ScoutPacketModel['reason']): ScoutPacketModel => ({
    ok: false,
    reason,
    playerId: null,
    teamId: null,
    programName: null,
    visibilityState: null,
    headline: null,
    playerName: null,
    identity: [],
    measurables: [],
    videos: [],
    season: null,
    visibleNotes: [],
    contactRules: null,
    recipientLabel: null,
    generatedAt,
  });

  const clean = (token ?? '').trim();
  if (!clean || clean.length > 256) return fail('not_found');

  // The admin (service-role) client is typed against the generated Database,
  // which lags the additive share-token migration. Use the untyped accessor for
  // the new table; assembleScoutPacket takes an untyped client by design.
  // Instantiate after input validation so the elevated client is never created
  // before the caller has passed the basic sanity gate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any;
  try {
    admin = createAdminClient();
  } catch {
    return fail('error');
  }

  const { data: tok } = await fromUntyped(admin, 'baseball_player_passport_share_tokens')
    .select('id, player_id, team_id, recipient_label, status, expires_at, view_count')
    .eq('token', clean)
    .maybeSingle();

  const row = (tok as Record<string, unknown> | null) ?? null;
  if (!row) return fail('not_found');
  if ((row.status as string) === 'revoked') return fail('revoked');
  const expiresAt = (row.expires_at as string | null) ?? null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return fail('expired');

  const packet = await assembleScoutPacket(admin, {
    playerId: String(row.player_id),
    teamId: String(row.team_id),
    recipientLabel: (row.recipient_label as string | null) ?? null,
  });

  // Telemetry: only count a live, exposed open — and never for CSV exports.
  if (packet.ok && trackView) {
    try {
      await fromUntyped(admin, 'baseball_player_passport_share_tokens')
        .update({
          view_count: (typeof row.view_count === 'number' ? row.view_count : 0) + 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq('id', String(row.id));
    } catch {
      // best-effort
    }
  }

  return packet;
}
