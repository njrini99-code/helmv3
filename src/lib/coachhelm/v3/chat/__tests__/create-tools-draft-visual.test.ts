import { describe, expect, it } from 'vitest';
import { CREATE_FLOWS, drillDiagram, drillFlow, lineupFlow } from '../create-tools';
import type { CoachChatContext } from '../context';
const ctx = { coach_id: 'c', team_id: 'team', timezone: 'UTC', roster: [{ id: 'p', name: 'Eli' }] } as CoachChatContext;

describe('proposal visual metadata', () => {
  it('extracts only explicit gate setup figures', () => {
    expect(drillDiagram('Gate drill')).toEqual({ kind: 'gate' });
    expect(drillDiagram('Gate drill', '8 balls on a 5 ft ring')).toEqual({ kind: 'gate', balls: 8, distance: 5, unit: 'ft' });
    expect(drillDiagram('Gate drill', 'Make 8 in a row')).toEqual({ kind: 'gate' });
    expect(drillDiagram('Ladder drill', '5 ft putts')).toBeUndefined();
  });
  it('supplies a drill visual without changing its write facts', () => {
    const p = drillFlow.plan(ctx, { name: 'Gate drill', area: 'putting', kind: 'skill', minutes: 15, setup: '8 balls on a 5 ft ring' });
    expect(p.visual).toMatchObject({ kind: 'drill', diagram: { balls: 8, distance: 5 }, minutes: 15 });
    expect(p.facts.find((f) => f.label === 'Setup')?.value).toBe('8 balls on a 5 ft ring');
  });
  it('leaves unknown round dates and lineup source absent', () => {
    const qualifier = CREATE_FLOWS.find((f) => f.name === 'create_qualifier')!;
    const p = qualifier.plan(ctx, { name: 'Fall', start_date: '2026-11-08', num_rounds: 2, selection_slots_total: 5, selection_slots_coach_pick: 1, player_ids: ['p'] } as never);
    expect(p.visual).toMatchObject({ kind: 'qual', players: ['Eli'] });
    expect(p.visual).not.toHaveProperty('roundDetails');
    const lineup = lineupFlow.plan(ctx, { tournament_id: 't', version: 1, entries: [{ player_id: 'p', role: 'lineup', slot: 1 }] });
    expect(lineup.visual).not.toHaveProperty('standings');
    expect(lineup.visual).not.toHaveProperty('locked');
  });
});
