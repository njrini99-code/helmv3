import { describe, expect, it } from 'vitest';
import { buildAssistantTurn, detailTable, evidenceBlocks, formatValue, headingOf, humanCell, parseProse, workReceipt } from '../data/coachhelm-chat-thread';
import { ASK_EV_EVENTS, ASK_EV_ROSTER, ASK_EV_TASKS, ASK_EV_TEAM_COMPARE, ASK_EV_TEAM_SG, ASK_MSGS_STAGING } from '../preview/fixtures-ask-thread';

/** The 2026-10-29 staging transcript (owner: "its the coachhelm chat. its ass"), item by item. */

describe('1. an old answer’s pipe table is a table, not raw pipes', () => {
  it('parses the header, the rows and which columns are figures', () => {
    const blocks = parseProse('Here it is:\n\n| Player | SG Total | Rounds |\n|---|:--:|---|\n| Jonah | -0.4 | 4 |\n| Eli | +0.3 | 3 |\n\nAfter.');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    const t = blocks[1]!;
    if (t.kind !== 'table') throw new Error('table expected');
    expect(t.header).toEqual(['Player', 'SG Total', 'Rounds']);
    expect(t.rows).toEqual([
      ['Jonah', '-0.4', '4'],
      ['Eli', '+0.3', '3'],
    ]);
    expect(t.numeric).toEqual([false, true, true]);
  });

  it('a pipe line with no divider under it stays text', () => {
    expect(parseProse('a | b | c').map((b) => b.kind)).toEqual(['paragraph']);
  });

  it('the staging answer draws its table as one table block', () => {
    const turn = buildAssistantTurn(ASK_MSGS_STAGING[1]!, { isLast: true, busy: false });
    if (turn.role !== 'assistant') throw new Error('assistant turn expected');
    const text = turn.blocks.find((b) => b.kind === 'text' && b.text.includes('|---'));
    expect(text && text.kind === 'text' && parseProse(text.text).some((b) => b.kind === 'table')).toBe(true);
  });
});

describe('3. no raw data in an evidence table', () => {
  it('dates, timestamps, enums and booleans read as words', () => {
    expect(humanCell('2026-10-29')).toBe('Oct 29');
    expect(humanCell('2026-10-30T19:00:00Z', 'America/New_York')).toBe('Oct 30, 3 PM');
    expect(humanCell('in_progress')).toBe('In progress');
    expect(humanCell('pending')).toBe('Pending');
    expect(humanCell(false)).toBe('No');
    expect(humanCell('Book the bus for the Oct 6 qualifier')).toBe('Book the bus for the Oct 6 qualifier');
  });

  it('headings are human labels, acronyms kept', () => {
    expect(headingOf('requires_rsvp')).toBe('RSVP required');
    expect(headingOf('due_date')).toBe('Due');
    expect(headingOf('sg_total')).toBe('SG total');
    expect(headingOf('priority')).toBe('Priority');
  });

  it('the tasks read: words for every cell, and a flag false on every row is left out', () => {
    const t = detailTable(ASK_EV_TASKS.detail, ASK_EV_TASKS.summary)!;
    expect(t.columns).toEqual(['Title', 'Due', 'Status', 'Priority']);
    expect(t.rows[0]).toEqual(['Book the bus for the Oct 6 qualifier', 'Oct 29', 'Pending', 'High']);
    expect(t.rows[1]![2]).toBe('In progress');
    expect(JSON.stringify(t.rows)).not.toMatch(/\d{4}-\d{2}-\d{2}|_|false/);
  });

  it('the events read keeps when they start, in the team’s zone, and says RSVP in words', () => {
    const t = detailTable(ASK_EV_EVENTS.detail, ASK_EV_EVENTS.summary)!;
    expect(t.columns).toEqual(['Title', 'Type', 'Starts', 'Ends']);
    expect(t.rows[0]!.slice(0, 3)).toEqual(['Team practice', 'Practice', 'Oct 30, 3 PM']);
  });
});

describe('5. a roster count says its figure once', () => {
  it('no "5 players" under the 5, and none in the source line', () => {
    const [tiles] = evidenceBlocks(ASK_EV_ROSTER);
    if (!tiles || tiles.kind !== 'tiles') throw new Error('tiles expected');
    expect(tiles.tiles[0]).toMatchObject({ label: 'Active roster', value: '5', sub: null });
    expect(tiles.source ?? '').not.toMatch(/players/);
  });

  it('the work receipt is one quiet line: how long and how many steps', () => {
    expect(workReceipt(6, 52.7)).toBe('Worked for 53s · 6 steps');
    expect(workReceipt(3, 6.04)).toBe('Worked for 6.0s · 3 steps');
    expect(workReceipt(1, null)).toBe('1 step');
  });
});

describe('6. a team read is a ranking with bars, or a team table', () => {
  it('a ranking: rank, name, sample in words, value, a signed bar for strokes gained', () => {
    const [b] = evidenceBlocks(ASK_EV_TEAM_SG);
    if (!b || b.kind !== 'ranking') throw new Error('ranking expected');
    expect(b.signed).toBe(true);
    expect(b.rows.map((r) => [r.label, r.of, r.display, r.tone])).toEqual([
      ['Jonah Okafor', '4 rounds', '−0.4', 'loss'],
      ['Eli Brandt', '3 rounds', '+0.3', 'good'],
      ['Sofia Alvarez', '4 rounds', '+1.2', 'good'],
      ['Theo Marchetti', '3 rounds', '+0.6', 'good'],
      ['Priya Natarajan', '3 rounds', '−1.1', 'loss'],
    ]);
    expect(Math.max(...b.rows.map((r) => r.pct))).toBe(100);
  });

  it('five players across three metrics: players as rows, the best per metric by its direction', () => {
    const [b] = evidenceBlocks(ASK_EV_TEAM_COMPARE);
    if (!b || b.kind !== 'compare') throw new Error('compare expected');
    expect(b.title).toBe('The team across scoring, strokes gained and putting');
    expect(b.team.playersAsRows).toBe(true);
    expect(b.team.best).toEqual(['p-sofia', 'p-sofia', 'p-sofia']);
    expect(b.team.players[0]).toMatchObject({ label: 'Jonah Okafor', sample: '4 rounds' });
  });
});

describe('7. to par is signed, strokes gained carries its sign', () => {
  const toPar = { metric_id: 'scoring_average_vs_par', metric_label: 'Scoring average to par' };
  it('"+3.1", "−0.4", "E"', () => {
    expect(formatValue(3.1, 'score', toPar)).toBe('+3.1');
    expect(formatValue(-0.4, 'score', toPar)).toBe('−0.4');
    expect(formatValue(0, 'score', toPar)).toBe('E');
    expect(formatValue(2, 'score', { metric_id: 'score_to_par', metric_label: 'Score to par' })).toBe('+2');
  });
  it('a score that is not to par, and a change between two figures, keep their plain form', () => {
    expect(formatValue(72, 'score', { metric_id: 'scoring_average', metric_label: 'Scoring average' })).toBe('72');
    expect(formatValue(3.1, 'score')).toBe('3.1');
    expect(formatValue(0.3, 'strokes')).toBe('+0.3');
  });
});
