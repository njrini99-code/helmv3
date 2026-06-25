// =============================================================================
// src/lib/baseball/read-models/scout-packet.ts
//
// V5 Scout Packet read model — the OUTBOUND, college-coach-facing assembly of a
// Player Passport.
//
// Spec: docs/.../19_breakthrough_product_systems_v5/
//        v5_player_passport_and_recruiting_showcase_system.md  §Scout Packet
//   Scout Packet outputs: event roster · player cards · verified metrics ·
//   video links · contact rules · source labels · notes if visible.
//   Export forms: web packet · PDF later · CSV summary.
//   Showcase variant: "scout packet export · college coach viewer access".
//
// WHY a dedicated model (not getPlayerPassport with viewerRole='other'):
//   The compact/full passport read model resolves the viewer FROM THE SESSION
//   and leans on RLS as the primary gate. A scout packet is opened by an
//   UNAUTHENTICATED college coach via a share token, so RLS cannot help — this
//   model is the ONLY gate. It therefore:
//     1. takes the supabase client as an argument (the public route passes the
//        SERVER-role admin client; a staff "preview as scout" passes the RLS
//        server client),
//     2. enforces the exposure gate explicitly — assembles ONLY when
//        visibility_state ∈ ('public_profile','scout_packet'),
//     3. filters EVERY field to scout/public rank (VISIBILITY_RANK >= 2),
//        NEVER returning staff_only or player_visible fields,
//     4. carries the CONTACT RULES + SOURCE LABELS + visible-notes the spec
//        requires, and never fabricates a measurable it does not have.
//
// This is the read half of the SOURCE -> SIGNAL -> ACTION -> OUTCOME chain:
//   source  = baseball_players / box scores / timeline / video (existing tables)
//   signal  = passport_settings.visibility_state + field_visibility (exposure)
//   action  = a minted share token resolved by the public route / a CSV export
//   outcome = the assembled, strictly-filtered packet the scout actually sees
//
// 'server-only'. No 'use client'. Baseball-only; no golf labels.
// =============================================================================

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildSourceRef,
  normalizeConfidence,
  type CaptureMode,
} from '@/lib/baseball/source-record';
import { buildSourceTrust } from '@/components/baseball/source-trust/build-source-trust';
import type { SourceTrust } from '@/components/baseball/source-trust/source-trust-types';
import type {
  PassportVisibilityState,
  PassportFieldVisibility,
  PassportFieldVisibilityMap,
} from '@/lib/types/baseball-passport';
// Public packet shapes + the pure CSV serializer live in the SHARED (isomorphic)
// module so client components can use them without importing this 'server-only'
// assembly file. Re-exported below to keep existing import paths working.
import type {
  ScoutPacketMeasurable,
  ScoutPacketIdentityField,
  ScoutPacketVideoItem,
  ScoutPacketSeasonLine,
  ScoutPacketContactRules,
  ScoutPacketModel,
} from '@/lib/baseball/scout-packet-shared';

export type {
  ScoutPacketMeasurable,
  ScoutPacketIdentityField,
  ScoutPacketVideoItem,
  ScoutPacketSeasonLine,
  ScoutPacketContactRules,
  ScoutPacketModel,
} from '@/lib/baseball/scout-packet-shared';
export { scoutPacketToCsv } from '@/lib/baseball/scout-packet-shared';

// -----------------------------------------------------------------------------
// Visibility model (scout view — STRICT)
// -----------------------------------------------------------------------------

// Same section defaults the passport read model uses, kept local so the scout
// model is the single source of truth for what a scout CAN ever see.
const SECTION_FIELD_DEFAULT: Record<string, PassportFieldVisibility> = {
  name: 'player_visible',
  preferred_name: 'player_visible',
  grad_year: 'player_visible',
  positions: 'player_visible',
  bats_throws: 'player_visible',
  height_weight: 'player_visible',
  hometown: 'player_visible',
  high_school: 'player_visible',
  measurable: 'player_visible',
  academic: 'player_visible',
};

const VISIBILITY_RANK: Record<PassportFieldVisibility, number> = {
  staff_only: 0,
  player_visible: 1,
  public: 2,
  scout: 2,
};

/** A scout sees a field ONLY when its resolved visibility is public/scout (>=2). */
const SCOUT_MIN_RANK = 2;

function resolveFieldVisibility(
  fieldKey: string,
  overrides: PassportFieldVisibilityMap,
): PassportFieldVisibility {
  const base: PassportFieldVisibility =
    SECTION_FIELD_DEFAULT[fieldKey] ?? SECTION_FIELD_DEFAULT.measurable ?? 'player_visible';
  // An override may NARROW or widen-to-exposure, but a scout still only ever sees
  // rank>=2; a staff_only base can never be widened above its base here because
  // the section defaults above are never staff_only and overrides for sensitive
  // sections are validated upstream.
  return overrides[fieldKey] ?? base;
}

/** Is a field exposed to a scout at its resolved visibility? */
function scoutCanSee(vis: PassportFieldVisibility): boolean {
  return VISIBILITY_RANK[vis] >= SCOUT_MIN_RANK;
}

// -----------------------------------------------------------------------------
// Measurable defs (mirrors the passport read model)
// -----------------------------------------------------------------------------

interface MeasurableDef {
  key: string;
  column: string;
  label: string;
  unit: string;
}
const MEASURABLE_DEFS: MeasurableDef[] = [
  { key: 'sixty_time', column: 'sixty_time', label: '60-Yard', unit: 's' },
  { key: 'exit_velo', column: 'exit_velo', label: 'Exit Velocity', unit: 'mph' },
  { key: 'pitch_velo', column: 'pitch_velo', label: 'Pitching Velocity', unit: 'mph' },
  { key: 'pop_time', column: 'pop_time', label: 'Pop Time', unit: 's' },
  { key: 'arm_strength', column: 'arm_strength', label: 'Throwing Velocity', unit: 'mph' },
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function r3(n: number): number {
  return parseFloat(n.toFixed(3));
}
function r2(n: number): number {
  return parseFloat(n.toFixed(2));
}

/** A scout-grade SourceTrust for a self-reported profile measurable. */
function measurableTrust(): SourceTrust {
  return buildSourceTrust({
    ref: buildSourceRef({ source: 'manual', label: 'Player profile' }),
    confidence: null,
    captureMode: 'active_capture' as CaptureMode,
    verified: false, // honesty: never auto-verified on a scout packet either
    conflict: false,
    trustLevel: 'player_entered',
  });
}

// -----------------------------------------------------------------------------
// Core assembly — takes a resolved (playerId, teamId) and a supabase client.
//
// The client is injected so the SAME assembly serves two callers:
//   * the public token route (admin/server-role client; no session),
//   * a staff "preview as scout" (RLS server client).
// In BOTH cases this function is the gate: it returns ok:false 'not_exposed'
// unless the passport's visibility_state allows external exposure, and it never
// emits a field below scout rank.
// -----------------------------------------------------------------------------

interface AssembleArgs {
  playerId: string;
  teamId: string;
  recipientLabel?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function assembleScoutPacket(
  supabase: AnyClient,
  args: AssembleArgs,
): Promise<ScoutPacketModel> {
  const generatedAt = new Date().toISOString();
  const fail = (reason: ScoutPacketModel['reason']): ScoutPacketModel => ({
    ok: false,
    reason,
    playerId: args.playerId ?? null,
    teamId: args.teamId ?? null,
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
    recipientLabel: args.recipientLabel ?? null,
    generatedAt,
  });

  if (!args.playerId || !args.teamId) return fail('not_found');

  // ---- Settings gate FIRST — never assemble a non-exposed passport ----
  const { data: settingsRow } = await supabase
    .from('baseball_player_passport_settings')
    .select('visibility_state, field_visibility, headline')
    .eq('player_id', args.playerId)
    .eq('team_id', args.teamId)
    .maybeSingle();

  const visibilityState: PassportVisibilityState =
    (settingsRow?.visibility_state as PassportVisibilityState) ?? 'staff_only';
  const overrides: PassportFieldVisibilityMap =
    (settingsRow?.field_visibility as PassportFieldVisibilityMap) ?? {};
  const exposureEnabled =
    visibilityState === 'public_profile' || visibilityState === 'scout_packet';
  if (!exposureEnabled) return fail('not_exposed');

  // ---- Player identity + measurables ----
  const { data: p, error: pErr } = await supabase
    .from('baseball_players')
    .select(
      'id, first_name, last_name, primary_position, secondary_position, grad_year, bats, throws, height_feet, height_inches, weight_lbs, city, state, high_school_name, gpa, sixty_time, exit_velo, pitch_velo, pop_time, arm_strength',
    )
    .eq('id', args.playerId)
    .maybeSingle();
  if (pErr || !p) return fail('not_found');

  // ---- Program name (for header + contact routing) ----
  const { data: teamRow } = await supabase
    .from('baseball_teams')
    .select('name')
    .eq('id', args.teamId)
    .maybeSingle();
  const programName = (teamRow?.name as string | null) ?? null;

  // ---- Identity (scout-rank fields only) ----
  const identity: ScoutPacketIdentityField[] = [];
  const pushIdentity = (key: string, label: string, value: string | null) => {
    if (value === null || value === '') return;
    if (!scoutCanSee(resolveFieldVisibility(key, overrides))) return;
    identity.push({ key, label, value });
  };
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  const playerName = fullName || null;
  pushIdentity('grad_year', 'Class Year', p.grad_year ? String(p.grad_year) : null);
  const positions = [p.primary_position, p.secondary_position].filter(Boolean).join(' / ');
  pushIdentity('positions', 'Positions', positions || null);
  const batsThrows =
    p.bats || p.throws ? `B: ${p.bats ?? '—'} / T: ${p.throws ?? '—'}` : null;
  pushIdentity('bats_throws', 'Bats / Throws', batsThrows);
  const height = p.height_feet != null ? `${p.height_feet}'${p.height_inches ?? 0}"` : null;
  const heightWeight =
    height || p.weight_lbs != null
      ? [height, p.weight_lbs != null ? `${p.weight_lbs} lbs` : null].filter(Boolean).join(', ')
      : null;
  pushIdentity('height_weight', 'Height / Weight', heightWeight);
  const hometown = [p.city, p.state].filter(Boolean).join(', ');
  pushIdentity('hometown', 'Hometown', hometown || null);
  pushIdentity('high_school', 'High School', p.high_school_name);
  // Academic (GPA) is scout-visible ONLY if explicitly exposed to scout/public.
  pushIdentity('academic', 'GPA', p.gpa != null ? Number(p.gpa).toFixed(2) : null);

  // ---- Measurables (scout-rank only; omitted when missing — never faked) ----
  const measurables: ScoutPacketMeasurable[] = [];
  if (scoutCanSee(resolveFieldVisibility('measurable', overrides))) {
    for (const def of MEASURABLE_DEFS) {
      const raw = (p as Record<string, unknown>)[def.column];
      if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) continue;
      measurables.push({
        key: def.key,
        label: def.label,
        value: Number(raw),
        unit: def.unit,
        trust: measurableTrust(),
        eventDate: null,
      });
    }
  }

  // ---- Video links (V5 "video links") — only externally-linkable references ----
  // We read directly (not via getVideoLibrary, which is session/RLS-scoped). The
  // video table itself has NO scout/public row-level flag (its visibility enum is
  // 'staff_only' | 'player_visible' | 'restricted' per BaseballEventVisibility),
  // so SCOUT exposure of media is governed by the
  // passport's per-section field-visibility key 'media'. A scout sees clips ONLY
  // when the player set 'media' to public/scout AND the underlying row is not
  // staff_only AND the clip is staff-approved AND carries a shareable URL.
  // (Defense in depth: the passport key is the exposure decision; the row flag is
  // the floor.) Nothing is fabricated; an internal-asset clip is omitted.
  const videos: ScoutPacketVideoItem[] = [];
  const mediaExposed = scoutCanSee(resolveFieldVisibility('media', overrides));
  if (mediaExposed) {
    try {
      const { data: vids } = await supabase
        .from('baseball_video_events')
        .select(
          'id, clip_title, source_label, source_vendor, source_confidence, external_video_url, thumbnail_url, review_status, visibility',
        )
        .eq('player_id', args.playerId)
        .eq('team_id', args.teamId)
        .limit(24);
      for (const v of (vids as Array<Record<string, unknown>> | null) ?? []) {
        const url = (v.external_video_url as string | null) ?? null;
        if (!url) continue; // a scout can only open an external link
        if (v.review_status !== 'approved') continue; // staff-approved only
        // Row floor: never surface a staff_only clip to a scout.
        // baseball_video_events.visibility enum is 'staff_only' | 'player_visible' | 'restricted'
        // (see BaseballEventVisibility in baseball-stat-events.ts). A scout may see
        // any approved clip that is NOT staff_only — player_visible and restricted
        // clips are safe once staff-approved. The passport's 'media' field-visibility
        // key is the outer exposure decision; this is the row-level floor.
        if ((v.visibility as string | null) === 'staff_only') continue;
        const vendor = v.source_vendor as string | null;
        videos.push({
          id: String(v.id),
          title:
            (v.clip_title as string | null)?.trim() ||
            (v.source_label as string | null)?.trim() ||
            'Video clip',
          url,
          thumbnailUrl: (v.thumbnail_url as string | null) ?? null,
          trust: buildSourceTrust({
            ref: buildSourceRef({
              source: vendor === 'manual' || vendor == null ? 'manual' : 'integration',
              label: (v.source_label as string | null) ?? vendor ?? 'Video',
            }),
            confidence: normalizeConfidence(v.source_confidence as number | null),
            captureMode: 'active_capture' as CaptureMode,
            verified: true, // approved review status == staff-verified clip
            conflict: false,
            trustLevel: 'attached_report',
          }),
        });
      }
    } catch {
      // Degrade to no video — never throw the packet.
    }
  }

  // ---- Verified metrics — OFFICIAL season line from box scores ----
  // Performance is scout-visible only when the player exposed the 'stats' section
  // (key 'stats') to public/scout. Box-score season totals are non-PII team
  // output, but a player still controls whether their line appears on the packet.
  let season: ScoutPacketSeasonLine | null = null;
  if (scoutCanSee(resolveFieldVisibility('stats', overrides))) {
    try {
      season = await assembleSeasonLine(supabase, args.playerId, args.teamId);
    } catch {
      season = null;
    }
  }

  // ---- Visible notes (V5 "notes if visible") — exposed timeline moments --------
  // The timeline table has NO scout/public row value (its enum is
  // team|player_only|staff_only), so SCOUT exposure of notes is governed by the
  // passport's per-section field-visibility key 'story'. A scout sees a moment
  // ONLY when 'story' is public/scout AND the underlying row is 'team' (never a
  // staff_only or player_only note). "notes if visible" — honestly visible.
  const visibleNotes: ScoutPacketModel['visibleNotes'] = [];
  if (scoutCanSee(resolveFieldVisibility('story', overrides))) {
   try {
    const { data: events } = await supabase
      .from('baseball_player_timeline_events')
      .select('id, title, occurred_at, source_type, confidence, visibility')
      .eq('player_id', args.playerId)
      .eq('team_id', args.teamId)
      .eq('visibility', 'team')
      .order('occurred_at', { ascending: false })
      .limit(40);
    for (const e of (events as Array<Record<string, unknown>> | null) ?? []) {
      visibleNotes.push({
        id: String(e.id),
        title: String(e.title ?? 'Note'),
        occurredAt: String(e.occurred_at ?? generatedAt),
        trust: buildSourceTrust({
          ref: buildSourceRef({ source: (e.source_type as string | null) ?? 'manual' }),
          confidence: normalizeConfidence(e.confidence as number | null),
          captureMode: 'active_capture' as CaptureMode,
          verified: false,
          conflict: false,
        }),
      });
      if (visibleNotes.length >= 8) break;
    }
   } catch {
     // Degrade to no notes — never throw the packet.
   }
  }

  // ---- Contact rules (V5 "contact rules") ----
  const currentYear = new Date().getFullYear();
  const gradYear = typeof p.grad_year === 'number' ? p.grad_year : Number(p.grad_year) || null;
  const earlyProspect = gradYear != null && gradYear - currentYear > 2;
  const contactRules: ScoutPacketContactRules = {
    contactViaProgram: true,
    programName,
    note: programName
      ? `Route all recruiting contact through ${programName}. This packet is shared for evaluation; it does not authorize direct contact with the prospect outside applicable NCAA recruiting rules.`
      : 'Route all recruiting contact through the player’s program. This packet is shared for evaluation; it does not authorize direct contact with the prospect outside applicable NCAA recruiting rules.',
    earlyProspect,
  };

  return {
    ok: true,
    reason: null,
    playerId: args.playerId,
    teamId: args.teamId,
    programName,
    visibilityState,
    headline: (settingsRow?.headline as string | null) ?? null,
    playerName,
    identity,
    measurables,
    videos,
    season,
    visibleNotes,
    contactRules,
    recipientLabel: args.recipientLabel ?? null,
    generatedAt,
  };
}

// -----------------------------------------------------------------------------
// Season line from box scores (OFFICIAL games only — never inflated)
// -----------------------------------------------------------------------------

async function assembleSeasonLine(
  supabase: AnyClient,
  playerId: string,
  teamId: string,
): Promise<ScoutPacketSeasonLine> {
  const seasonYear = new Date().getFullYear();
  const [batRes, pitRes] = await Promise.all([
    supabase
      .from('baseball_box_score_batting')
      .select('game_id, ab, h, hr, rbi, bb, k, doubles, triples, hbp, sf')
      .eq('team_id', teamId)
      .eq('player_id', playerId),
    supabase
      .from('baseball_box_score_pitching')
      .select('game_id, ip, h, er, k, bb')
      .eq('team_id', teamId)
      .eq('player_id', playerId),
  ]);

  const batting = (batRes.data as Array<Record<string, number | null>> | null) ?? [];
  const pitching = (pitRes.data as Array<Record<string, number | null>> | null) ?? [];

  if (batting.length === 0 && pitching.length === 0) {
    return { seasonYear, batting: null, pitching: null, noData: true };
  }

  // Resolve which games are OFFICIAL (exclude scrimmages from the season line).
  const gameIds = Array.from(
    new Set(
      [...batting, ...pitching].map((r) => String(r.game_id)).filter((x) => x && x !== 'null'),
    ),
  );
  const officialGameIds = new Set<string>();
  if (gameIds.length > 0) {
    const { data: games } = await supabase
      .from('baseball_games')
      .select('id, game_type')
      .eq('team_id', teamId)
      .in('id', gameIds);
    for (const g of (games as Array<Record<string, unknown>> | null) ?? []) {
      if ((g.game_type as string | null) !== 'scrimmage') officialGameIds.add(String(g.id));
    }
  }

  let bG = 0,
    ab = 0,
    h = 0,
    hr = 0,
    rbi = 0,
    bb = 0,
    kBat = 0,
    doubles = 0,
    triples = 0,
    hbp = 0,
    sf = 0;
  for (const b of batting) {
    if (!officialGameIds.has(String(b.game_id))) continue;
    bG += 1;
    ab += b.ab ?? 0;
    h += b.h ?? 0;
    hr += b.hr ?? 0;
    rbi += b.rbi ?? 0;
    bb += b.bb ?? 0;
    kBat += b.k ?? 0;
    doubles += b.doubles ?? 0;
    triples += b.triples ?? 0;
    hbp += b.hbp ?? 0;
    sf += b.sf ?? 0;
  }
  let pG = 0,
    ip = 0,
    pH = 0,
    er = 0,
    kPit = 0,
    bbPit = 0;
  for (const pr of pitching) {
    if (!officialGameIds.has(String(pr.game_id))) continue;
    pG += 1;
    ip += Number(pr.ip ?? 0);
    pH += pr.h ?? 0;
    er += pr.er ?? 0;
    kPit += pr.k ?? 0;
    bbPit += pr.bb ?? 0;
  }

  const battingLine =
    bG > 0
      ? (() => {
          const singles = h - doubles - triples - hr;
          const avg = ab > 0 ? r3(h / ab) : null;
          const slg = ab > 0 ? r3((singles + 2 * doubles + 3 * triples + 4 * hr) / ab) : null;
          const pa = ab + bb + hbp + sf;
          const obp = pa > 0 ? r3((h + bb + hbp) / pa) : null;
          const ops = obp != null && slg != null ? r3(obp + slg) : null;
          return { g: bG, ab, h, hr, rbi, bb, k: kBat, avg, obp, slg, ops };
        })()
      : null;

  const pitchingLine =
    pG > 0
      ? {
          g: pG,
          ip: r2(ip),
          er,
          k: kPit,
          bb: bbPit,
          era: ip > 0 ? r2((er * 9) / ip) : null,
          whip: ip > 0 ? r2((bbPit + pH) / ip) : null,
        }
      : null;

  return {
    seasonYear,
    batting: battingLine,
    pitching: pitchingLine,
    noData: battingLine === null && pitchingLine === null,
  };
}
