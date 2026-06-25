// =============================================================================
// src/lib/baseball/adapters/swing-adapters.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// CONCRETE swing-sensor adapters: Blast Motion + Diamond Kinetics. Both produce
// swing-grain rows (baseball_swing_events) and are DEVELOPMENTAL — the DB CHECK
// already forbids trust_tier='official' on that table, and the source registry
// caps their trust at verified_vendor. (V6 §Swing Sensor Stats; V10 swing visual
// contracts.)
//
// Blast columns: "Bat Speed (mph)", "Attack Angle (deg)", "On Plane Efficiency
// (%)", "Rotational Acceleration (g)", "Time to Contact (sec)", "Connection at
// Impact (deg)", "Early Connection (deg)", "Vertical Bat Angle (deg)", "Peak Hand
// Speed (mph)", "Power (kW)".
// Diamond Kinetics columns: "Max Barrel Speed", "Max Acceleration", "Impact
// Momentum", "Attack Angle", "Vertical Bat Angle", "Time to Impact",
// "Acceleration", "Speed Efficiency".
//
// PURE: parse/normalize only.
// =============================================================================

import {
  tokenizeCsv,
  buildHeaderIndex,
  pick,
  num,
} from '@/lib/baseball/adapters/csv-tokenizer';
import type { CanonicalSwingRow } from '@/lib/baseball/adapters/event-rows';
import type { ConcreteParseResult } from '@/lib/baseball/adapters/tracking-adapters';

const CONTACT = (raw: string | null): string | null => {
  if (!raw) return null;
  return raw.trim() || null;
};

// =============================================================================
// Blast Motion — one row per swing.
// =============================================================================

export function parseBlast(body: string): ConcreteParseResult {
  const tk = tokenizeCsv(body);
  const idx = buildHeaderIndex(tk.headers);
  const warnings = [...tk.warnings];
  const rows: CanonicalSwingRow[] = [];

  for (let r = 0; r < tk.rows.length; r++) {
    const row = tk.rows[r]!;
    const sourceRowNumber = r + 1;
    const playerName = pick(row, idx, ['Player', 'Name', 'PlayerName', 'Athlete']);
    const extId = pick(row, idx, ['PlayerId', 'PlayerID', 'Equipment', 'DeviceId']);
    const swingId = pick(row, idx, ['SwingId', 'SwingID', 'Id', 'Swing']);
    const measuredAt = pick(row, idx, ['Date', 'SwingDate', 'Timestamp', 'Time']);

    const batSpeed = num(pick(row, idx, ['BatSpeed', 'Bat Speed (mph)', 'Bat Speed']));
    const attackAngle = num(pick(row, idx, ['AttackAngle', 'Attack Angle (deg)', 'Attack Angle']));
    const onPlane = num(
      pick(row, idx, ['OnPlaneEfficiency', 'On Plane Efficiency (%)', 'On Plane Efficiency']),
    );
    const timeToContact = num(
      pick(row, idx, ['TimeToContact', 'Time to Contact (sec)', 'Time to Contact']),
    );
    const rotAccel = num(
      pick(row, idx, ['RotationalAcceleration', 'Rotational Acceleration (g)']),
    );
    const connImpact = num(
      pick(row, idx, ['ConnectionAtImpact', 'Connection at Impact (deg)']),
    );
    const earlyConn = num(pick(row, idx, ['EarlyConnection', 'Early Connection (deg)']));
    const vba = num(pick(row, idx, ['VerticalBatAngle', 'Vertical Bat Angle (deg)']));
    const peakHand = num(pick(row, idx, ['PeakHandSpeed', 'Peak Hand Speed (mph)']));
    const power = num(pick(row, idx, ['Power', 'Power (kW)']));

    const hasData =
      batSpeed != null ||
      attackAngle != null ||
      onPlane != null ||
      rotAccel != null ||
      peakHand != null;

    if (!hasData && !playerName) {
      warnings.push(`Row ${sourceRowNumber}: no Blast swing metrics — skipped.`);
      continue;
    }

    rows.push({
      grain: 'swing',
      primaryRole: 'player',
      sourceRowNumber,
      externalPlayerName: playerName,
      externalPlayerId: extId,
      externalEventId: swingId ?? (extId && measuredAt ? `${extId}:${measuredAt}:${r}` : null),
      measuredAt,
      dataContext: 'sensor',
      fields: {
        bat_speed: batSpeed,
        attack_angle: attackAngle,
        vertical_bat_angle: vba,
        on_plane_efficiency: onPlane,
        time_to_contact: timeToContact,
        rotational_acceleration: rotAccel,
        connection_score: null,
        early_connection: earlyConn,
        connection_at_impact: connImpact,
        peak_hand_speed: peakHand,
        power_score: power,
        max_barrel_speed: null,
        max_acceleration: null,
        impact_momentum: null,
        contact_point: null,
      },
    });
  }

  return { sourceKey: 'blast_csv', rows, warnings, rowsRead: tk.rows.length };
}

// =============================================================================
// Diamond Kinetics — one row per swing (mobile app export).
// =============================================================================

export function parseDiamondKinetics(body: string): ConcreteParseResult {
  const tk = tokenizeCsv(body);
  const idx = buildHeaderIndex(tk.headers);
  const warnings = [...tk.warnings];
  const rows: CanonicalSwingRow[] = [];

  for (let r = 0; r < tk.rows.length; r++) {
    const row = tk.rows[r]!;
    const sourceRowNumber = r + 1;
    const playerName = pick(row, idx, ['Player', 'Name', 'PlayerName', 'Athlete']);
    const extId = pick(row, idx, ['PlayerId', 'PlayerID', 'DeviceId']);
    const swingId = pick(row, idx, ['SwingId', 'SwingID', 'Id', 'Swing']);
    const measuredAt = pick(row, idx, ['Date', 'SwingDate', 'Timestamp', 'Time']);

    const maxBarrel = num(pick(row, idx, ['MaxBarrelSpeed', 'Max Barrel Speed', 'BarrelSpeed']));
    const maxAccel = num(pick(row, idx, ['MaxAcceleration', 'Max Acceleration', 'Acceleration']));
    const impactMomentum = num(pick(row, idx, ['ImpactMomentum', 'Impact Momentum']));
    const attackAngle = num(pick(row, idx, ['AttackAngle', 'Attack Angle']));
    const vba = num(pick(row, idx, ['VerticalBatAngle', 'Vertical Bat Angle']));
    const timeToImpact = num(pick(row, idx, ['TimeToImpact', 'Time to Impact', 'TimeToContact']));
    const contactPoint = CONTACT(pick(row, idx, ['ContactPoint', 'Contact Point', 'PointOfImpact']));

    const hasData =
      maxBarrel != null ||
      maxAccel != null ||
      impactMomentum != null ||
      attackAngle != null;

    if (!hasData && !playerName) {
      warnings.push(`Row ${sourceRowNumber}: no Diamond Kinetics swing metrics — skipped.`);
      continue;
    }

    rows.push({
      grain: 'swing',
      primaryRole: 'player',
      sourceRowNumber,
      externalPlayerName: playerName,
      externalPlayerId: extId,
      externalEventId: swingId ?? (extId && measuredAt ? `${extId}:${measuredAt}:${r}` : null),
      measuredAt,
      dataContext: 'sensor',
      fields: {
        bat_speed: null,
        attack_angle: attackAngle,
        vertical_bat_angle: vba,
        on_plane_efficiency: null,
        time_to_contact: timeToImpact,
        rotational_acceleration: null,
        connection_score: null,
        early_connection: null,
        connection_at_impact: null,
        peak_hand_speed: null,
        power_score: null,
        max_barrel_speed: maxBarrel,
        max_acceleration: maxAccel,
        impact_momentum: impactMomentum,
        contact_point: contactPoint,
      },
    });
  }

  return { sourceKey: 'diamond_kinetics_csv', rows, warnings, rowsRead: tk.rows.length };
}
