// =============================================================================
// src/lib/baseball/adapters/tracking-adapters.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// CONCRETE adapters for the ball-tracking sources that produce pitch + batted-
// ball event rows: TrackMan and Rapsodo. These are the adapters the v10 anti-slop
// bar singles out ("it treats Rapsodo/TrackMan as generic CSV" is FORBIDDEN).
//
// Each adapter knows its vendor's REAL column vocabulary (TrackMan: RelSpeed,
// SpinRate, InducedVertBreak, HorzBreak, ExitSpeed, Angle, PlateLocSide...;
// Rapsodo: "Velocity", "Total Spin", "Spin Efficiency", "VB (trajectory)",
// "Exit Velocity", "Launch Angle"...) and maps it onto the canonical pitch /
// batted-ball event rows in event-rows.ts.
//
// PURE: parsing/normalization only (no DB, no 'use server'). The commit writer
// (actions/stat-event-imports.ts) takes the canonical rows + matched players and
// writes the event tables with provenance.
// =============================================================================

import {
  tokenizeCsv,
  buildHeaderIndex,
  pick,
  num,
} from '@/lib/baseball/adapters/csv-tokenizer';
import {
  type CanonicalEventRow,
  type CanonicalPitchRow,
  type CanonicalBattedBallRow,
  deriveHardHit,
  deriveBarrel,
  deriveSweetSpot,
  deriveBattedBallType,
} from '@/lib/baseball/adapters/event-rows';
import type { BaseballSourceKey } from '@/lib/types/baseball-stat-events';

// -----------------------------------------------------------------------------
// Shared parse output for the concrete adapters.
// -----------------------------------------------------------------------------

export interface ConcreteParseResult {
  sourceKey: BaseballSourceKey;
  rows: CanonicalEventRow[];
  /** Rows the file had but the adapter could not turn into ANY event (e.g. no
   *  player + no measurements) — surfaced as warnings in the diff viewer. */
  warnings: string[];
  /** Total physical data rows read (for "parsed N of M" honesty). */
  rowsRead: number;
  /**
   * OPTIONAL preserved document text for sources that intentionally do NOT auto-
   * extract committable rows (PDF box scores). The wizard shows this so a coach can
   * hand-map the lines — honouring the registry rule "preserve as a source document
   * for manual row mapping. Never silently commit low-confidence extraction." */
  preservedText?: string;
}

const HAND = (raw: string | null): 'L' | 'R' | 'S' | null => {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (s.startsWith('L')) return 'L';
  if (s.startsWith('R')) return 'R';
  if (s.startsWith('S') || s.startsWith('B')) return 'S'; // switch
  return null;
};

const bool = (raw: string | null): boolean | null => {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return null;
};

// =============================================================================
// TrackMan — one row per PITCH; carries BOTH pitch metrics AND, when the pitch
// was put in play, the batted-ball metrics. We emit a pitch row for every row,
// and ALSO a batted-ball row whenever contact metrics (ExitSpeed/Angle) exist.
// (V6 §TrackMan: "Link TrackMan pitch/hit rows to games or practice sessions.")
// =============================================================================

export function parseTrackMan(body: string): ConcreteParseResult {
  const tk = tokenizeCsv(body);
  const idx = buildHeaderIndex(tk.headers);
  const warnings = [...tk.warnings];
  const rows: CanonicalEventRow[] = [];

  for (let r = 0; r < tk.rows.length; r++) {
    const row = tk.rows[r]!;
    const sourceRowNumber = r + 1;

    const pitcherName = pick(row, idx, ['Pitcher', 'PitcherName', 'pitcher_name']);
    const batterName = pick(row, idx, ['Batter', 'BatterName', 'batter_name']);
    const pitcherExtId = pick(row, idx, ['PitcherId', 'PitcherID', 'pitcher_id']);
    const batterExtId = pick(row, idx, ['BatterId', 'BatterID', 'batter_id']);
    const pitchUid = pick(row, idx, ['PitchUID', 'PitchUid', 'PitchID', 'pitch_uid', 'GameUID']);
    const measuredAt = pick(row, idx, ['UTCDate', 'Date', 'Time', 'UTCDateTime']);

    const velocity = num(pick(row, idx, ['RelSpeed', 'PitchSpeed', 'Velocity', 'velo']));
    const spinRate = num(pick(row, idx, ['SpinRate', 'Spin']));
    const spinAxis = num(pick(row, idx, ['SpinAxis', 'Tilt']));
    const ivb = num(pick(row, idx, ['InducedVertBreak', 'InducedVerticalBreak', 'IVB']));
    const hb = num(pick(row, idx, ['HorzBreak', 'HorizontalBreak', 'HB']));
    const relHeight = num(pick(row, idx, ['RelHeight', 'ReleaseHeight']));
    const relSide = num(pick(row, idx, ['RelSide', 'ReleaseSide']));
    const extension = num(pick(row, idx, ['Extension']));
    const plateHeight = num(pick(row, idx, ['PlateLocHeight', 'PlateHeight']));
    const plateSide = num(pick(row, idx, ['PlateLocSide', 'PlateSide']));
    const pitchType = pick(row, idx, ['TaggedPitchType', 'AutoPitchType', 'PitchType']);
    const pitchCall = pick(row, idx, ['PitchCall', 'Call']);
    const pitchNo = num(pick(row, idx, ['PitchofPA', 'PitchNo', 'PitchNumber']));
    const batterSide = HAND(pick(row, idx, ['BatterSide', 'BatSide', 'Stand']));

    // Derived swing/whiff/in-zone from PitchCall when the boolean isn't present.
    const callLc = (pitchCall ?? '').toLowerCase();
    const isSwing =
      bool(pick(row, idx, ['IsSwing'])) ??
      (callLc ? /swing|foul|inplay|strikeswinging/.test(callLc.replace(/\s/g, '')) : null);
    const isWhiff =
      bool(pick(row, idx, ['IsWhiff'])) ??
      (callLc ? /strikeswinging|swingingstrike|swinging/.test(callLc.replace(/\s/g, '')) : null);

    const hasPitchData =
      velocity != null || spinRate != null || ivb != null || hb != null || pitchType != null;

    if (hasPitchData || pitcherName) {
      const pitch: CanonicalPitchRow = {
        grain: 'pitch',
        primaryRole: 'pitcher',
        sourceRowNumber,
        externalPlayerName: pitcherName,
        externalPlayerId: pitcherExtId,
        externalSecondaryName: batterName,
        externalEventId: pitchUid,
        measuredAt: measuredAt,
        dataContext: 'sensor',
        fields: {
          pitch_number: pitchNo,
          pitch_type: pitchType,
          pitch_call: pitchCall,
          pitch_result: null,
          velocity,
          spin_rate: spinRate,
          spin_axis: spinAxis,
          spin_efficiency: num(pick(row, idx, ['SpinEfficiency', 'SpinEff'])),
          induced_vertical_break: ivb,
          horizontal_break: hb,
          release_height: relHeight,
          release_side: relSide,
          extension,
          plate_height: plateHeight,
          plate_side: plateSide,
          // In-zone from plate location when present: |side| <= 0.83 ft and
          // height in [1.5, 3.5] ft is the standard rulebook zone box.
          is_in_zone:
            plateSide != null && plateHeight != null
              ? Math.abs(plateSide) <= 0.83 && plateHeight >= 1.5 && plateHeight <= 3.5
              : null,
          is_swing: isSwing,
          is_whiff: isWhiff,
          batter_handedness: batterSide,
        },
      };
      rows.push(pitch);
    }

    // Batted-ball row when contact metrics exist.
    const ev = num(pick(row, idx, ['ExitSpeed', 'ExitVelocity', 'ExitVelo']));
    const la = num(pick(row, idx, ['Angle', 'LaunchAngle']));
    const spray = num(pick(row, idx, ['Direction', 'SprayAngle', 'Bearing']));
    const dist = num(pick(row, idx, ['Distance', 'CarryDistance', 'HitDistance']));
    const hangTime = num(pick(row, idx, ['HangTime']));
    const playResult = pick(row, idx, ['PlayResult', 'HitType', 'TaggedHitType']);
    if (ev != null || la != null || dist != null) {
      const bb: CanonicalBattedBallRow = {
        grain: 'batted_ball',
        primaryRole: 'batter',
        sourceRowNumber,
        externalPlayerName: batterName,
        externalPlayerId: batterExtId,
        externalSecondaryName: pitcherName,
        externalEventId: pitchUid ? `${pitchUid}:bb` : null,
        measuredAt,
        dataContext: 'sensor',
        fields: {
          exit_velocity: ev,
          launch_angle: la,
          spray_angle: spray,
          distance: dist,
          hang_time: hangTime,
          batted_ball_type: deriveBattedBallType(la),
          is_hard_hit: deriveHardHit(ev),
          is_barrel: deriveBarrel(ev, la),
          is_sweet_spot: deriveSweetSpot(la),
          result: playResult,
          pitch_type: pitchType,
        },
      };
      rows.push(bb);
    }

    if (!hasPitchData && ev == null && la == null && !pitcherName && !batterName) {
      warnings.push(`Row ${sourceRowNumber}: no player and no measurements — skipped.`);
    }
  }

  return { sourceKey: 'trackman_csv', rows, warnings, rowsRead: tk.rows.length };
}

// =============================================================================
// Rapsodo — hitting OR pitching export. Hitting rows carry Exit Velocity / Launch
// Angle / Distance; pitching rows carry Velocity / Total Spin / Spin Efficiency /
// VB / HB. One file is one mode; we detect per-row which grain is present.
// (V6 §Rapsodo: exit speed, spin profile, seam orientation, strike zone.)
// =============================================================================

export function parseRapsodo(body: string): ConcreteParseResult {
  const tk = tokenizeCsv(body);
  const idx = buildHeaderIndex(tk.headers);
  const warnings = [...tk.warnings];
  const rows: CanonicalEventRow[] = [];

  // Rapsodo files name the player in a "Player"/"Hitter"/"Pitcher" column, or in
  // a header preamble (handled upstream by the wizard's session name). We read
  // the per-row player column when present.
  for (let r = 0; r < tk.rows.length; r++) {
    const row = tk.rows[r]!;
    const sourceRowNumber = r + 1;
    const playerName = pick(row, idx, ['Player', 'Hitter', 'Pitcher', 'Name', 'PlayerName']);
    const extId = pick(row, idx, ['PlayerId', 'PlayerID', 'DeviceId']);
    const no = num(pick(row, idx, ['No', 'No.', 'Pitch', 'Shot', 'Swing']));
    const measuredAt = pick(row, idx, ['Date', 'Timestamp', 'Time']);

    // Pitching metrics.
    const velocity = num(pick(row, idx, ['Velocity', 'Speed', 'PitchSpeed']));
    const totalSpin = num(pick(row, idx, ['TotalSpin', 'Total Spin', 'Spin']));
    const spinEff = num(pick(row, idx, ['SpinEfficiency', 'Spin Efficiency', 'SpinEff']));
    const vb = num(pick(row, idx, ['VB', 'VB (trajectory)', 'VerticalBreak', 'InducedVerticalBreak']));
    const hbreak = num(pick(row, idx, ['HB', 'HB (trajectory)', 'HorizontalBreak']));
    const spinDir = num(pick(row, idx, ['SpinDirection', 'Spin Direction', 'Tilt']));
    const relHeight = num(pick(row, idx, ['ReleaseHeight', 'Release Height']));
    const relSide = num(pick(row, idx, ['ReleaseSide', 'Release Side']));
    const pitchType = pick(row, idx, ['PitchType', 'Pitch Type', 'Type']);

    const hasPitch = velocity != null || totalSpin != null || vb != null || spinEff != null;

    // Hitting metrics.
    const ev = num(pick(row, idx, ['ExitVelocity', 'Exit Velocity', 'ExitSpeed', 'EV']));
    const la = num(pick(row, idx, ['LaunchAngle', 'Launch Angle', 'LA']));
    const dist = num(pick(row, idx, ['Distance', 'Carry', 'Distance (ft)']));
    const spray = num(pick(row, idx, ['Direction', 'SprayAngle', 'Spray Angle', 'Bearing']));
    const hitType = pick(row, idx, ['Type', 'HitType', 'Result']);
    const hasHit = ev != null || la != null || dist != null;

    if (hasPitch) {
      rows.push({
        grain: 'pitch',
        primaryRole: 'pitcher',
        sourceRowNumber,
        externalPlayerName: playerName,
        externalPlayerId: extId,
        externalEventId: extId && no != null ? `${extId}:${no}` : null,
        measuredAt,
        dataContext: 'sensor',
        fields: {
          pitch_number: no,
          pitch_type: pitchType,
          pitch_call: null,
          pitch_result: null,
          velocity,
          spin_rate: totalSpin,
          spin_axis: spinDir,
          spin_efficiency: spinEff,
          induced_vertical_break: vb,
          horizontal_break: hbreak,
          release_height: relHeight,
          release_side: relSide,
          extension: null,
          plate_height: null,
          plate_side: null,
          is_in_zone: null,
          is_swing: null,
          is_whiff: null,
          batter_handedness: null,
        },
      });
    }

    if (hasHit) {
      rows.push({
        grain: 'batted_ball',
        primaryRole: 'batter',
        sourceRowNumber,
        externalPlayerName: playerName,
        externalPlayerId: extId,
        externalEventId: extId && no != null ? `${extId}:${no}:bb` : null,
        measuredAt,
        dataContext: 'cage', // Rapsodo hitting is overwhelmingly a cage capture.
        fields: {
          exit_velocity: ev,
          launch_angle: la,
          spray_angle: spray,
          distance: dist,
          hang_time: null,
          batted_ball_type: deriveBattedBallType(la),
          is_hard_hit: deriveHardHit(ev),
          is_barrel: deriveBarrel(ev, la),
          is_sweet_spot: deriveSweetSpot(la),
          result: hitType,
          pitch_type: null,
        },
      });
    }

    if (!hasPitch && !hasHit && !playerName) {
      warnings.push(`Row ${sourceRowNumber}: no Rapsodo measurements — skipped.`);
    }
  }

  return { sourceKey: 'rapsodo_csv', rows, warnings, rowsRead: tk.rows.length };
}
