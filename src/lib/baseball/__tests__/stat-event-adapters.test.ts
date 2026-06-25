// =============================================================================
// Unit tests for the CONCRETE vendor event adapters.
//
// Locks the v10 anti-slop invariant: Rapsodo/TrackMan/Blast are NOT treated as
// generic CSV — each produces typed pitch/batted-ball/swing event rows from its
// real column vocabulary, with quote-aware parsing, honest derived flags, honest
// nulls (never a fabricated velocity), and an idempotent commit plan.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  tokenizeCsv,
  buildHeaderIndex,
  pick,
  num,
} from '@/lib/baseball/adapters/csv-tokenizer';
import { parseTrackMan, parseRapsodo } from '@/lib/baseball/adapters/tracking-adapters';
import { parseBlast, parseDiamondKinetics } from '@/lib/baseball/adapters/swing-adapters';
import { parseStatCrewXml } from '@/lib/baseball/adapters/official-xml-adapters';
import {
  hasConcreteEventAdapter,
  validateEventRows,
  resolveEventPlayers,
  buildEventCommitPlan,
  resolveEventTrust,
  handleOf,
  detectSourceFile,
  autoCommitLabel,
  type EventPlayerResolution,
} from '@/lib/baseball/adapters';
import type { CanonicalPitchRow, CanonicalBattedBallRow } from '@/lib/baseball/adapters/event-rows';

// ---------------------------------------------------------------------------
// CSV tokenizer — quote-aware (the bug the legacy splitter has)
// ---------------------------------------------------------------------------
describe('csv-tokenizer', () => {
  it('does NOT shift columns when a field contains a quoted comma', () => {
    const csv = 'Pitcher,Velo\n"Smith, John",92.4\n"Doe, Jane",88.1';
    const tk = tokenizeCsv(csv);
    expect(tk.headers).toEqual(['Pitcher', 'Velo']);
    expect(tk.rows[0]).toEqual(['Smith, John', '92.4']);
    expect(tk.rows[1]).toEqual(['Doe, Jane', '88.1']);
  });

  it('handles escaped double-quotes and \\r\\n line endings', () => {
    const csv = 'Name,Note\r\n"A ""B""","x"\r\n';
    const tk = tokenizeCsv(csv);
    expect(tk.rows[0]).toEqual(['A "B"', 'x']);
  });

  it('auto-detects a tab delimiter', () => {
    const tsv = 'Pitcher\tVelo\nSmith\t92';
    const tk = tokenizeCsv(tsv);
    expect(tk.delimiter).toBe('\t');
    expect(tk.rows[0]).toEqual(['Smith', '92']);
  });

  it('num() returns null (not 0, not NaN) on blank', () => {
    const idx = buildHeaderIndex(['Velo']);
    expect(num(pick(['', ''], idx, ['Velo']))).toBeNull();
    expect(num('92.4 mph')).toBe(92.4);
  });
});

// ---------------------------------------------------------------------------
// TrackMan — pitch + batted-ball from one row, real columns, derived flags
// ---------------------------------------------------------------------------
describe('parseTrackMan', () => {
  const csv = [
    'Pitcher,Batter,RelSpeed,SpinRate,InducedVertBreak,HorzBreak,TaggedPitchType,PitchCall,ExitSpeed,Angle,Distance,PlateLocSide,PlateLocHeight,PitchUID',
    '"Ace, Pitcher","Bat, Ter",94.2,2350,17.5,8.1,Fastball,InPlay,103.5,18,402,0.1,2.6,uid-1',
    '"Ace, Pitcher","Bat, Ter",84.0,2600,2.0,-12.0,Slider,StrikeSwinging,,,,0.9,2.1,uid-2',
  ].join('\n');

  it('emits a pitch row for every pitch and a batted-ball row only on contact', () => {
    const res = parseTrackMan(csv);
    expect(res.sourceKey).toBe('trackman_csv');
    const pitches = res.rows.filter((r) => r.grain === 'pitch');
    const bbs = res.rows.filter((r) => r.grain === 'batted_ball');
    expect(pitches).toHaveLength(2);
    expect(bbs).toHaveLength(1); // only uid-1 had ExitSpeed
  });

  it('maps TrackMan-specific columns (NOT generic CSV)', () => {
    const res = parseTrackMan(csv);
    const p = res.rows.find((r) => r.grain === 'pitch') as CanonicalPitchRow;
    expect(p.fields.velocity).toBe(94.2);
    expect(p.fields.spin_rate).toBe(2350);
    expect(p.fields.induced_vertical_break).toBe(17.5);
    expect(p.fields.horizontal_break).toBe(8.1);
    expect(p.externalPlayerName).toBe('Ace, Pitcher');
    expect(p.dataContext).toBe('sensor');
  });

  it('derives hard-hit / barrel / sweet-spot from EV+LA', () => {
    const res = parseTrackMan(csv);
    const bb = res.rows.find((r) => r.grain === 'batted_ball') as CanonicalBattedBallRow;
    expect(bb.fields.exit_velocity).toBe(103.5);
    expect(bb.fields.is_hard_hit).toBe(true); // 103.5 >= 95
    // 103.5 EV → barrel window is [20.5, 35.5]; LA 18 is below it → NOT a barrel
    // (conservative single-band, never overclaims).
    expect(bb.fields.is_barrel).toBe(false);
    expect(bb.fields.is_sweet_spot).toBe(true); // 18 in [8,32]
    expect(bb.fields.batted_ball_type).toBe('line_drive'); // 18 deg
  });

  it('classifies plate location into the strike zone box', () => {
    const res = parseTrackMan(csv);
    const inZone = res.rows.find(
      (r) => r.grain === 'pitch' && r.externalEventId === 'uid-1',
    ) as CanonicalPitchRow;
    expect(inZone.fields.is_in_zone).toBe(true); // side 0.1, height 2.6
  });
});

// ---------------------------------------------------------------------------
// Rapsodo — hitting vs pitching mode detected per-row
// ---------------------------------------------------------------------------
describe('parseRapsodo', () => {
  it('parses hitting export into cage-context batted-ball rows', () => {
    const csv = 'Player,Exit Velocity,Launch Angle,Distance\nMike Trout,104,24,420';
    const res = parseRapsodo(csv);
    const bb = res.rows.find((r) => r.grain === 'batted_ball') as CanonicalBattedBallRow;
    expect(bb.fields.exit_velocity).toBe(104);
    expect(bb.dataContext).toBe('cage');
    // 104 EV → barrel window ~[20, 36]; LA 24 is inside → barrel.
    expect(bb.fields.is_barrel).toBe(true);
  });

  it('parses pitching export into sensor-context pitch rows with spin efficiency', () => {
    const csv = 'Pitcher,Velocity,Total Spin,Spin Efficiency,VB (trajectory)\nGerrit Cole,97,2400,95,15';
    const res = parseRapsodo(csv);
    const p = res.rows.find((r) => r.grain === 'pitch') as CanonicalPitchRow;
    expect(p.fields.velocity).toBe(97);
    expect(p.fields.spin_efficiency).toBe(95);
    expect(p.fields.induced_vertical_break).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Swing sensors
// ---------------------------------------------------------------------------
describe('swing adapters', () => {
  it('Blast maps "Bat Speed (mph)" / "On Plane Efficiency (%)" into swing rows', () => {
    const csv =
      'Player,Bat Speed (mph),Attack Angle (deg),On Plane Efficiency (%),Connection at Impact (deg)\nJ. Hitter,72,9,85,91';
    const res = parseBlast(csv);
    expect(res.rows).toHaveLength(1);
    const s = res.rows[0]!;
    expect(s.grain).toBe('swing');
    if (s.grain === 'swing') {
      expect(s.fields.bat_speed).toBe(72);
      expect(s.fields.on_plane_efficiency).toBe(85);
      expect(s.fields.connection_at_impact).toBe(91);
    }
  });

  it('Diamond Kinetics maps barrel speed / impact momentum', () => {
    const csv = 'Player,Max Barrel Speed,Max Acceleration,Impact Momentum,Attack Angle\nA. Player,78,12,9.4,10';
    const res = parseDiamondKinetics(csv);
    const s = res.rows[0]!;
    if (s.grain === 'swing') {
      expect(s.fields.max_barrel_speed).toBe(78);
      expect(s.fields.impact_momentum).toBe(9.4);
    }
  });
});

// ---------------------------------------------------------------------------
// Official XML — honest nulls (a B/S/C code carries NO velocity)
// ---------------------------------------------------------------------------
describe('parseStatCrewXml', () => {
  it('emits one pitch row per ball/strike code with NULL velocity', () => {
    const xml =
      '<bsgame><plays><play pitcher="Smith, A" batter="Jones, B" pitches="BCSX" id="p1"/></plays></bsgame>';
    const res = parseStatCrewXml(xml);
    expect(res.rows).toHaveLength(4);
    expect(res.rows.every((r) => r.grain === 'pitch')).toBe(true);
    const p = res.rows[0] as CanonicalPitchRow;
    expect(p.dataContext).toBe('official_game');
    expect(p.fields.velocity).toBeNull(); // honest: codes carry no velo
    const swing = res.rows[2] as CanonicalPitchRow; // 'S'
    expect(swing.fields.is_whiff).toBe(true);
  });

  it('warns when no plays are present (box-score-only file)', () => {
    const res = parseStatCrewXml('<bsgame><team name="X"/></bsgame>');
    expect(res.rows).toHaveLength(0);
    expect(res.warnings.join(' ')).toMatch(/play-by-play/i);
  });
});

// ---------------------------------------------------------------------------
// Registry + validation + matching + plan
// ---------------------------------------------------------------------------
describe('adapter registry + orchestration', () => {
  it('registers exactly the event-grain producers', () => {
    expect(hasConcreteEventAdapter('trackman_csv')).toBe(true);
    expect(hasConcreteEventAdapter('blast_csv')).toBe(true);
    expect(hasConcreteEventAdapter('generic_csv')).toBe(false); // legacy flat path
  });

  it('clamps trust to the source ceiling (sensor never official)', () => {
    expect(resolveEventTrust('trackman_csv')).toBe('verified_vendor');
    expect(resolveEventTrust('blast_csv')).toBe('verified_vendor');
    expect(resolveEventTrust('gamechanger_xml')).toBe('official');
  });

  it('flags impossible measurements as errors, unusual ones as warnings', () => {
    const res = parseTrackMan(
      'Pitcher,RelSpeed,SpinRate\nA,999,2000\nB,107,2000',
    );
    const issues = validateEventRows(res.rows);
    // 999 mph is impossible (> hardMax 110) → error.
    expect(issues.some((i) => i.severity === 'error' && i.field === 'velocity')).toBe(true);
    // 107 mph is possible but unusual (> softMax 105) → warning.
    expect(issues.some((i) => i.severity === 'warning' && i.field === 'velocity')).toBe(true);
  });

  it('resolves distinct players once across many event rows', () => {
    const res = parseTrackMan(
      [
        'Pitcher,RelSpeed,SpinRate',
        'Jane Smith,92,2200',
        'Jane Smith,93,2210',
        'Jane Smith,91,2190',
      ].join('\n'),
    );
    const roster = [{ id: 'p1', first_name: 'Jane', last_name: 'Smith' }];
    const resolutions = resolveEventPlayers(res.rows, roster, new Map());
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]!.playerId).toBe('p1');
    expect(resolutions[0]!.rowCount).toBe(3);
  });

  it('builds an idempotent plan: existing external ids become updates, not dup creates', () => {
    const res = parseTrackMan(
      'Pitcher,RelSpeed,SpinRate,PitchUID\nJane Smith,92,2200,uid-1\nJane Smith,93,2210,uid-2',
    );
    const roster = [{ id: 'p1', first_name: 'Jane', last_name: 'Smith' }];
    const resolutions = resolveEventPlayers(res.rows, roster, new Map());
    const resolutionByHandle = new Map<string, EventPlayerResolution>(
      resolutions.map((r) => [r.handle, r]),
    );
    const plan = buildEventCommitPlan({
      rows: res.rows,
      resolutionByHandle,
      existingExternalIds: {
        pitch: new Set(['uid-1']),
        batted_ball: new Set(),
        swing: new Set(),
      },
      parseWarnings: [],
      validation: [],
    });
    expect(plan.byGrain.pitch.creates).toBe(1); // uid-2 new
    expect(plan.byGrain.pitch.updates).toBe(1); // uid-1 already present
    expect(plan.duplicateRowCount).toBe(1);
  });

  it('skips unmatched rows in the plan (does not silently create orphans)', () => {
    const res = parseTrackMan('Pitcher,RelSpeed,SpinRate\nNobody Here,92,2200');
    const resolutions = resolveEventPlayers(res.rows, [], new Map());
    const resolutionByHandle = new Map<string, EventPlayerResolution>(
      resolutions.map((r) => [r.handle, r]),
    );
    const plan = buildEventCommitPlan({
      rows: res.rows,
      resolutionByHandle,
      existingExternalIds: { pitch: new Set(), batted_ball: new Set(), swing: new Set() },
      parseWarnings: [],
      validation: [],
    });
    expect(plan.totalCreates).toBe(0);
    expect(plan.unmatchedRowCount).toBeGreaterThan(0);
  });

  it('handleOf dedupes by external id when present', () => {
    const res = parseRapsodo('Player,Velocity,PlayerId\nX,90,ext-9');
    const p = res.rows[0]!;
    expect(handleOf(p)).toBe('id:ext-9');
  });
});

// ---------------------------------------------------------------------------
// detectSourceFile + auto-commit band — the Detect step (v9 Packet 4 acceptance
// "upload shows detected source AND grain"; v8 confidence-based auto-commit). This
// is what made decideAutoCommit/AutoCommitDecision live instead of dead code.
// ---------------------------------------------------------------------------
describe('detectSourceFile', () => {
  it('surfaces the detected source label, category and grains a TrackMan file produces', () => {
    // A row with BOTH pitch metrics and contact metrics emits pitch + batted_ball.
    const csv =
      'Pitcher,Batter,RelSpeed,SpinRate,ExitSpeed,Angle\n' +
      'Jane Ace,Tim Bat,93.1,2300,101,18';
    const d = detectSourceFile('trackman_csv', csv);
    expect(d.sourceKey).toBe('trackman_csv');
    expect(d.sourceLabel).toBe('TrackMan CSV');
    expect(d.category).toBe('tracking');
    expect(d.grains).toContain('pitch');
    expect(d.grains).toContain('batted_ball');
    expect(d.grainLabels).toContain('Pitch');
    expect(d.eventRowCount).toBeGreaterThan(0);
  });

  it('a tracking source can NEVER reach an official auto-commit band (ceiling clamp)', () => {
    // Make a clean, high-yield TrackMan file (every row -> a pitch event).
    const rows = Array.from({ length: 30 }, (_, i) => `P${i % 3},9${i % 9}.0,2200`).join('\n');
    const d = detectSourceFile('trackman_csv', `Pitcher,RelSpeed,SpinRate\n${rows}`);
    expect(d.trustCeiling).toBe('verified_vendor');
    // Even at high confidence, a non-official source is never "auto_commit_silent".
    expect(d.autoCommit).not.toBe('auto_commit_silent');
  });

  it('a requires-review source (StatCrew) is held for review, never auto-committed', () => {
    const xml =
      '<bsgame><team vh="V"><player name="Smith, J" /></team></bsgame>';
    const d = detectSourceFile('statcrew_xml', xml);
    expect(d.trustCeiling).toBe('official');
    // statcrew_xml has requiresReviewByDefault=true → band is capped below auto-commit.
    expect(['hold_for_review', 'do_not_commit']).toContain(d.autoCommit);
  });

  it('an unparseable / wrong-source file lands at do_not_commit with no grains', () => {
    const d = detectSourceFile('trackman_csv', 'completely,unrelated\nfoo,bar');
    expect(d.eventRowCount).toBe(0);
    expect(d.grains).toEqual([]);
    expect(d.autoCommit).toBe('do_not_commit');
  });

  it('autoCommitLabel returns honest copy for every band', () => {
    expect(autoCommitLabel('auto_commit_silent').title).toMatch(/auto-commit/i);
    expect(autoCommitLabel('hold_for_review').title).toMatch(/review/i);
    expect(autoCommitLabel('do_not_commit').title).toMatch(/manual/i);
  });
});
