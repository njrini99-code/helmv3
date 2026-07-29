// =============================================================================
// src/lib/baseball/scout-packet-shared.ts
//
// V5 Scout Packet — SHARED, isomorphic surface (NOT 'server-only').
//
// The public packet model TYPES and the pure CSV serializer live here so BOTH
// the server read-model (scout-packet.ts, which does the gated DB assembly) AND
// client components (the CSV download button) can use them without dragging the
// 'server-only' assembly module — and its supabase imports — into a client
// bundle.
//
// Pure module: no I/O, no 'use client', no 'server-only'. Baseball-only.
// =============================================================================

import type { SourceTrust } from '@/components/baseball/source-trust/source-trust-types';
import type { PassportVisibilityState } from '@/lib/types/baseball-passport';

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

export interface ScoutPacketMeasurable {
  key: string;
  label: string;
  value: number;
  unit: string;
  trust: SourceTrust;
  eventDate: string | null;
}

export interface ScoutPacketIdentityField {
  key: string;
  label: string;
  value: string;
}

export interface ScoutPacketVideoItem {
  id: string;
  title: string;
  url: string | null;
  thumbnailUrl: string | null;
  trust: SourceTrust;
}

export interface ScoutPacketSeasonLine {
  seasonYear: number;
  batting: {
    g: number;
    ab: number;
    h: number;
    hr: number;
    rbi: number;
    bb: number;
    k: number;
    avg: number | null;
    obp: number | null;
    slg: number | null;
    ops: number | null;
  } | null;
  pitching: {
    g: number;
    ip: number;
    er: number;
    k: number;
    bb: number;
    era: number | null;
    whip: number | null;
  } | null;
  noData: boolean;
}

/**
 * Contact rules surfaced on the packet (V5 §Scout Packet "contact rules"). NCAA
 * recruiting calendars + program policy govern whether/how a college coach may
 * contact a prospect. We never imply direct contact is permitted — the honest
 * default routes the scout through the program, and a player below the standard
 * recruiting age window is flagged so the scout self-governs.
 */
export interface ScoutPacketContactRules {
  contactViaProgram: boolean;
  programName: string | null;
  note: string;
  earlyProspect: boolean;
}

export interface ScoutPacketModel {
  ok: boolean;
  /**
   * `module_disabled` is distinct from `revoked` on purpose. Revoked means the
   * program turned this specific link off — a statement about their intent
   * that would be false while recruiting is sunset product-wide
   * (src/lib/baseball/product-modules.ts). Telling a college coach the program
   * revoked their link when the program did nothing invites a phone call about
   * a decision nobody made.
   */
  reason:
    | null
    | 'not_found'
    | 'expired'
    | 'revoked'
    | 'not_exposed'
    | 'module_disabled'
    | 'error';
  playerId: string | null;
  teamId: string | null;
  programName: string | null;
  visibilityState: PassportVisibilityState | null;
  headline: string | null;
  playerName: string | null;
  identity: ScoutPacketIdentityField[];
  measurables: ScoutPacketMeasurable[];
  videos: ScoutPacketVideoItem[];
  season: ScoutPacketSeasonLine | null;
  visibleNotes: Array<{ id: string; title: string; occurredAt: string; trust: SourceTrust }>;
  contactRules: ScoutPacketContactRules | null;
  recipientLabel: string | null;
  generatedAt: string;
}

// -----------------------------------------------------------------------------
// CSV summary (V5 §Scout Packet "Export forms: CSV summary")
//
// A flat, one-row-per-metric CSV a scout can drop into a board. Honest: only
// fields the packet actually exposes are written; nothing is fabricated. Source
// labels travel with each row so the CSV is self-describing.
// -----------------------------------------------------------------------------

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // RFC-4180 quoting; also neutralize spreadsheet formula injection.
  const needsQuote = /[",\n\r]/.test(s) || /^[=+\-@]/.test(s);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function scoutPacketToCsv(model: ScoutPacketModel): string {
  const rows: string[][] = [['Section', 'Field', 'Value', 'Source']];
  if (!model.ok) {
    rows.push(['Packet', 'Status', 'Unavailable', '']);
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  rows.push(['Identity', 'Name', model.playerName ?? '', 'Player profile']);
  if (model.programName) rows.push(['Identity', 'Program', model.programName, 'Program']);
  for (const f of model.identity) rows.push(['Identity', f.label, f.value, 'Player profile']);

  for (const m of model.measurables) {
    rows.push(['Measurables', m.label, `${m.value} ${m.unit}`.trim(), m.trust.label]);
  }

  const s = model.season;
  if (s && !s.noData) {
    if (s.batting) {
      const b = s.batting;
      rows.push(['Batting', 'G', String(b.g), 'Team box scores']);
      rows.push([
        'Batting',
        'AVG/OBP/SLG/OPS',
        `${b.avg ?? ''}/${b.obp ?? ''}/${b.slg ?? ''}/${b.ops ?? ''}`,
        'Team box scores',
      ]);
      rows.push(['Batting', 'H/HR/RBI', `${b.h}/${b.hr}/${b.rbi}`, 'Team box scores']);
      rows.push(['Batting', 'BB/K', `${b.bb}/${b.k}`, 'Team box scores']);
    }
    if (s.pitching) {
      const p = s.pitching;
      rows.push(['Pitching', 'G', String(p.g), 'Team box scores']);
      rows.push(['Pitching', 'ERA/WHIP', `${p.era ?? ''}/${p.whip ?? ''}`, 'Team box scores']);
      rows.push(['Pitching', 'IP/K/BB', `${p.ip}/${p.k}/${p.bb}`, 'Team box scores']);
    }
  }

  for (const v of model.videos) {
    rows.push(['Video', v.title, v.url ?? '', v.trust.label]);
  }

  if (model.contactRules) {
    rows.push([
      'Contact',
      'Route via',
      model.contactRules.programName ?? 'Program',
      'Program policy',
    ]);
  }

  rows.push(['Packet', 'Generated', model.generatedAt, 'BaseballHelm']);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
