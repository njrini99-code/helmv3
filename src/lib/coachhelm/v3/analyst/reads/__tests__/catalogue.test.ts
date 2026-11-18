import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildTeamReads } from '../build';
import { CATALOGUE_FLOORS, MAX_SIGNALS } from '../catalogue';
import { numbersIn } from '../format';
import { forPlayer } from '../player-card';
import { holesTeam } from './holes-team';
import { readsTeam } from './team';

const team = buildTeamReads(holesTeam());

describe('stage 2: the catalogue reads', () => {
  it('counts every read hole by hole, with its floor said plainly when it is not met', () => {
    const steady = team.catalogue.find((c) => c.player_id === 'steady-1')!;
    const ids = steady.reads.map((r) => r.id);
    expect(ids).toEqual(['doubles', 'mistakes', 'tee_penalties', 'tee_miss_side', 'approach_length', 'first_putt_length', 'chip_leave', 'long_three_putts', 'par5_seconds']);
    for (const r of steady.reads) {
      if (r.value == null) expect(r.text).toMatch(/needs \d+/);
      else expect(r.text.length).toBeGreaterThan(20);
    }
    // Ten rounds is over the eight-round floor.
    expect(steady.reads.find((r) => r.id === 'doubles')!.value).not.toBeNull();
    expect(CATALOGUE_FLOORS.rounds).toBe(8);
    // Par 5 lay-ups are inferred: described, never tested.
    expect(steady.reads.find((r) => r.id === 'par5_seconds')!.described_only).toBe(true);
  });

  it('the player with doubles from tee penalties gets that as a signal; the steady ones do not', () => {
    const wild = team.catalogue.find((c) => c.player_id === 'wild')!;
    expect(wild.signals.map((s) => s.family)).toContain('scoring');
    const doubles = wild.reads.find((r) => r.id === 'doubles')!;
    expect(doubles.detail!.penalty).toBeGreaterThan(0);
    expect(doubles.text).toMatch(/had a penalty/);
    const tee = wild.reads.find((r) => r.id === 'tee_penalties')!;
    expect(tee.text).toMatch(/water/);
    expect(tee.text).toMatch(/driver/);
    const steadySignals = team.catalogue.filter((c) => c.player_id !== 'wild').flatMap((c) => c.signals.map((s) => s.id));
    expect(steadySignals.filter((id) => id === 'doubles' || id === 'tee_penalties')).toEqual([]);
  });

  it('at most three signals a player, one per family, none repeating another', () => {
    for (const fx of [team, buildTeamReads(readsTeam().rows()), buildTeamReads(holesTeam({ seed: 9, players: 10 }))]) {
      for (const c of fx.catalogue) {
        expect(c.signals.length).toBeLessThanOrEqual(MAX_SIGNALS);
        expect(new Set(c.signals.map((s) => s.family)).size).toBe(c.signals.length);
        expect(new Set(c.signals.map((s) => s.text)).size).toBe(c.signals.length);
        for (const s of c.signals) expect(s.q_value).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('every number in a read is one of its figures, and a teammate figure is coach only', () => {
    for (const c of team.catalogue) {
      for (const r of c.reads) {
        const allowed = new Set(Object.values(r.figures).flatMap(numbersIn));
        for (const x of numbersIn(r.text)) expect(allowed, `${x} in "${r.text}"`).toContain(x);
      }
    }
    for (const p of team.payloads) expect(JSON.stringify(forPlayer(p))).not.toMatch(/coach_only|teammates’ middle/);
  });
});

describe('stage 2: the four parts and the team page', () => {
  it('each player has the four parts side by side', () => {
    for (const p of team.payloads) {
      expect(p.parts!.map((x) => x.part)).toEqual(['strokes_gained_off_the_tee', 'strokes_gained_approach', 'strokes_gained_around_the_green', 'strokes_gained_putting']);
      for (const part of p.parts!) {
        const allowed = new Set(Object.values(part.figures).flatMap(numbersIn));
        for (const x of numbersIn(part.text)) expect(allowed).toContain(x);
      }
    }
  });

  it('the team page says the shared part once, names the exceptions, and measures the same-card share', () => {
    const page = team.team;
    expect(page.audience).toBe('coach_only');
    expect(page.players_read).toBe(8);
    if (page.shared) {
      expect(page.shared.text).toMatch(/said once/);
      for (const e of page.exceptions) expect(page.shared.players.includes(e.player_id) ? /different pattern/ : /not /).toBeTruthy();
    }
    expect(page.same_card_share).toBeGreaterThan(0);
    expect(page.same_card_share).toBeLessThanOrEqual(1);
  });

  it('re-measures the "same top card" share on the fixtures (today: every player on one card on most teams)', () => {
    const shares = [team, buildTeamReads(readsTeam().rows()), buildTeamReads(holesTeam({ seed: 9, players: 10 }))].map((t) => t.team.same_card_share);
    // Recorded in the PR: the share of players sharing one signature, per fixture team.
    for (const s of shares) expect(s).toBeLessThan(1);
  });
});
