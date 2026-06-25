// =============================================================================
// src/lib/baseball/adapters/official-xml-adapters.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// CONCRETE official-game XML adapters: GameChanger college XML + StatCrew
// (bsgame) XML. These produce OFFICIAL-context pitch events from the play-by-play
// the SID workflow emits — not "XML treated as text".
//
// REALITY of these formats (V6 §GameChanger / §StatCrew):
//   * StatCrew bsgame: <bsgame> root, <team> blocks with <player> hitting/pitching
//     summaries, and a <plays> / <play> section where each <play> may carry a
//     pitch sequence in a `pitches` attribute (e.g. "BSSC" = ball/strike codes) or
//     nested <pitch> elements with type/speed in richer exports.
//   * GameChanger college XML: similar attribute-based structure; the box-score
//     player rows and a play-by-play list.
//
// Pitch-level richness varies wildly between exports. We parse what is present
// HONESTLY: when a play exposes per-pitch type/velocity we emit one pitch row per
// pitch; when it only exposes a ball/strike code string we emit one pitch row per
// code with the call but NULL velocity (NEVER fabricate a velocity). Both carry
// data_context='official_game' and the OFFICIAL trust ceiling.
//
// PURE: parse/normalize only.
// =============================================================================

import { parseXml, findAll, attr, type XmlNode } from '@/lib/baseball/adapters/mini-xml';
import type { CanonicalPitchRow } from '@/lib/baseball/adapters/event-rows';
import type { ConcreteParseResult } from '@/lib/baseball/adapters/tracking-adapters';

const numOrNull = (raw: string | null): number | null => {
  if (raw == null) return null;
  const n = Number(raw.replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Map a StatCrew/GC pitch code char to a (call, swing, whiff) tuple. */
function decodePitchCode(code: string): {
  call: string;
  isSwing: boolean | null;
  isWhiff: boolean | null;
} {
  switch (code.toUpperCase()) {
    case 'B':
      return { call: 'ball', isSwing: false, isWhiff: false };
    case 'C':
      return { call: 'called_strike', isSwing: false, isWhiff: false };
    case 'S':
      return { call: 'swinging_strike', isSwing: true, isWhiff: true };
    case 'F':
      return { call: 'foul', isSwing: true, isWhiff: false };
    case 'X':
    case 'D': // in play (some exports use D for "hit")
      return { call: 'in_play', isSwing: true, isWhiff: false };
    case 'T': // foul tip
      return { call: 'foul_tip', isSwing: true, isWhiff: false };
    case 'H': // hit by pitch
      return { call: 'hit_by_pitch', isSwing: false, isWhiff: false };
    default:
      return { call: 'unknown', isSwing: null, isWhiff: null };
  }
}

/**
 * Shared XML → pitch-row extraction used by both official adapters. It looks for
 * <play> elements that name a pitcher/batter and either nest <pitch> elements or
 * carry a pitch-code string attribute.
 */
function extractPitchesFromPlays(
  root: XmlNode | null,
): { rows: CanonicalPitchRow[]; warnings: string[] } {
  const rows: CanonicalPitchRow[] = [];
  const warnings: string[] = [];
  const plays = findAll(root, 'play');
  let rowNo = 0;

  for (const play of plays) {
    const pitcher =
      attr(play, 'pitcher', 'pitchername', 'pitcher_name') ??
      attr(play, 'p', 'pname');
    const batter =
      attr(play, 'batter', 'battername', 'batter_name', 'hitter') ?? attr(play, 'b', 'bname');
    const batSide = attr(play, 'batside', 'stand', 'bats');
    const handedness: 'L' | 'R' | 'S' | null = batSide
      ? batSide.toUpperCase().startsWith('L')
        ? 'L'
        : batSide.toUpperCase().startsWith('R')
          ? 'R'
          : batSide.toUpperCase().startsWith('S') || batSide.toUpperCase().startsWith('B')
            ? 'S'
            : null
      : null;
    const playUid = attr(play, 'id', 'uid', 'seq', 'pid');

    // Path A: nested <pitch> elements with richer fields.
    const nestedPitches = findAll(play, 'pitch');
    if (nestedPitches.length > 0) {
      nestedPitches.forEach((p, i) => {
        rowNo += 1;
        const code = attr(p, 'call', 'result', 'type_short', 'code');
        const decoded = code ? decodePitchCode(code) : null;
        rows.push({
          grain: 'pitch',
          primaryRole: 'pitcher',
          sourceRowNumber: rowNo,
          externalPlayerName: pitcher,
          externalPlayerId: attr(play, 'pitcherid', 'pid'),
          externalSecondaryName: batter,
          externalEventId: playUid ? `${playUid}:${i + 1}` : null,
          measuredAt: attr(play, 'time', 'timestamp', 'datetime'),
          dataContext: 'official_game',
          fields: {
            pitch_number: numOrNull(attr(p, 'num', 'no', 'number')) ?? i + 1,
            pitch_type: attr(p, 'type', 'pitchtype', 'tagged_type'),
            pitch_call: decoded?.call ?? attr(p, 'call', 'result'),
            pitch_result: attr(p, 'result', 'outcome'),
            velocity: numOrNull(attr(p, 'velo', 'speed', 'mph', 'velocity')),
            spin_rate: numOrNull(attr(p, 'spin', 'spinrate')),
            spin_axis: null,
            spin_efficiency: null,
            induced_vertical_break: null,
            horizontal_break: null,
            release_height: null,
            release_side: null,
            extension: null,
            plate_height: null,
            plate_side: null,
            is_in_zone: null,
            is_swing: decoded?.isSwing ?? null,
            is_whiff: decoded?.isWhiff ?? null,
            batter_handedness: handedness,
          },
        });
      });
      continue;
    }

    // Path B: a pitch-code string attribute (e.g. pitches="BCSX").
    const codeStr = attr(play, 'pitches', 'pitchseq', 'sequence');
    if (codeStr) {
      const codes = codeStr.replace(/[^A-Za-z]/g, '').split('');
      codes.forEach((c, i) => {
        const decoded = decodePitchCode(c);
        rowNo += 1;
        rows.push({
          grain: 'pitch',
          primaryRole: 'pitcher',
          sourceRowNumber: rowNo,
          externalPlayerName: pitcher,
          externalPlayerId: attr(play, 'pitcherid', 'pid'),
          externalSecondaryName: batter,
          externalEventId: playUid ? `${playUid}:${i + 1}` : null,
          measuredAt: attr(play, 'time', 'timestamp'),
          dataContext: 'official_game',
          fields: {
            pitch_number: i + 1,
            pitch_type: null,
            pitch_call: decoded.call,
            pitch_result: i === codes.length - 1 ? attr(play, 'result', 'narrative') : null,
            velocity: null, // honest: a B/S/C code carries NO velocity.
            spin_rate: null,
            spin_axis: null,
            spin_efficiency: null,
            induced_vertical_break: null,
            horizontal_break: null,
            release_height: null,
            release_side: null,
            extension: null,
            plate_height: null,
            plate_side: null,
            is_in_zone: null,
            is_swing: decoded.isSwing,
            is_whiff: decoded.isWhiff,
            batter_handedness: handedness,
          },
        });
      });
    }
  }

  if (plays.length === 0) {
    warnings.push(
      'No <play> elements found — this file may be a box-score-only export. ' +
        'Pitch-level events require a play-by-play export.',
    );
  } else if (rows.length === 0) {
    warnings.push(
      `${plays.length} plays found but none exposed pitch detail — no pitch events emitted.`,
    );
  }
  return { rows, warnings };
}

export function parseGameChangerXml(body: string): ConcreteParseResult {
  const { root, warnings: xmlWarn } = parseXml(body);
  const { rows, warnings } = extractPitchesFromPlays(root);
  return {
    sourceKey: 'gamechanger_xml',
    rows,
    warnings: [...xmlWarn, ...warnings],
    rowsRead: rows.length,
  };
}

export function parseStatCrewXml(body: string): ConcreteParseResult {
  const { root, warnings: xmlWarn } = parseXml(body);
  const { rows, warnings } = extractPitchesFromPlays(root);
  return {
    sourceKey: 'statcrew_xml',
    rows,
    warnings: [...xmlWarn, ...warnings],
    rowsRead: rows.length,
  };
}

// -----------------------------------------------------------------------------
// Additional official-game XML providers (PrestoSports, NCAA Live Stats, SIDEARM,
// StatBroadcast). The registry advertised these as official XML sources, but none
// had a concrete parser — so the highest-trust college pipeline (the SID website
// workflow emits PrestoSports/SIDEARM XML; in-venue scoring emits NCAA Live Stats /
// StatBroadcast) could not be ingested at all. All four share the same attribute-
// based <play> structure StatCrew/GameChanger use (PrestoSports is itself a StatCrew
// derivative), so they reuse the exact same honest pitch extraction — one pitch row
// per nested <pitch> OR per ball/strike code, with NULL velocity when the export
// carries only a code string (never fabricate a measurement). v9 Packet 4:
// "StatCrew/Presto XML if sample exists".
// -----------------------------------------------------------------------------

function parseOfficialXml(sourceKey: ConcreteParseResult['sourceKey'], body: string): ConcreteParseResult {
  const { root, warnings: xmlWarn } = parseXml(body);
  const { rows, warnings } = extractPitchesFromPlays(root);
  return { sourceKey, rows, warnings: [...xmlWarn, ...warnings], rowsRead: rows.length };
}

export function parsePrestoSportsXml(body: string): ConcreteParseResult {
  return parseOfficialXml('prestosports_xml', body);
}

export function parseNcaaLiveStatsXml(body: string): ConcreteParseResult {
  return parseOfficialXml('ncaa_live_stats', body);
}

export function parseSidearmXml(body: string): ConcreteParseResult {
  return parseOfficialXml('sidearm_xml', body);
}

export function parseStatBroadcastXml(body: string): ConcreteParseResult {
  return parseOfficialXml('statbroadcast_xml', body);
}
