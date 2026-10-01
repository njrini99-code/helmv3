import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  ASK_EV_EMPTY,
  ASK_EV_FAILED,
  ASK_EV_JONAH,
  ASK_EV_PARTIAL,
  ASK_EV_RANKING,
  ASK_EV_SLOPE,
  ASK_MSGS_ABANDONED,
  ASK_MSGS_ACTION,
  ASK_MSGS_ANSWER,
  ASK_MSGS_CANCELLED,
  ASK_MSGS_CONFIRMED,
  ASK_MSGS_RECEIPT,
  ASK_MSGS_RECEIPT_FAILED,
  ASK_MSGS_REJECTED,
  ASK_PROPOSAL,
  ASK_RECEIPT_DONE,
  ASK_FOCUS_JONAH,
} from '../preview/fixtures-ask-thread';
import {
  REJECTED_TURN_NOTE,
  SMALL_SAMPLE_MAX,
  buildEvidencePanel,
  buildTurns,
  detailTable,
  evidenceAvailable,
  evidenceBlocks,
  failedAnswerChangedNothing,
  followUpsFor,
  formatValue,
  pairProposals,
  parseProse,
  pendingApproval,
  splitAtMentions,
  splitInline,
  stepLabel,
  type AskAssistantTurn,
} from '../data/coachhelm-chat-thread';

/** Ask CoachHelm (P013), the conversation's pure steps: what a thread of message parts means on screen. */

const asst = (turns: ReturnType<typeof buildTurns>, i = -1): AskAssistantTurn => {
  const t = turns.at(i);
  if (!t || t.role !== 'assistant') throw new Error('not an assistant turn');
  return t;
};
const parts = (m: UIMessage) => (m as unknown as { parts: Array<Record<string, unknown>> }).parts;
const tool = (toolCallId: string, approvalId: string, state: string, approved?: boolean) => ({
  type: 'tool-create_focus_area',
  toolCallId,
  state,
  input: {},
  approval: approved === undefined ? { id: approvalId } : { id: approvalId, approved },
});
const proposal = (key: string, label: string) => ({ type: 'data-action-proposal', id: `proposal-${key}`, data: { ...ASK_PROPOSAL, idempotency_key: key, affects: [{ kind: 'player', id: `p-${label}`, label }] } });
const msg = (id: string, role: 'user' | 'assistant', ps: unknown[]) => ({ id, role, parts: ps }) as unknown as UIMessage;

describe('pendingApproval: the action the coach still has to answer', () => {
  it('returns the approval id, never the tool-call id, with the action it is for', () => {
    expect(pendingApproval(ASK_MSGS_ACTION)).toEqual({ approvalId: 'approval-1', tool: 'create_focus_area', action: 'Create focus area' });
  });
  it('is null once the coach answered it', () => {
    expect(pendingApproval(ASK_MSGS_CONFIRMED)).toBeNull();
    expect(pendingApproval(ASK_MSGS_CANCELLED)).toBeNull();
  });
  it('is null when the thread moved past it, and when the last message is the coach', () => {
    expect(pendingApproval(ASK_MSGS_ABANDONED)).toBeNull();
    expect(pendingApproval([...ASK_MSGS_ACTION, msg('u9', 'user', [{ type: 'text', text: 'hi' }])])).toBeNull();
    expect(pendingApproval([])).toBeNull();
  });
  it('an approval-requested part with no approval id cannot be answered, so it does not block', () => {
    expect(pendingApproval([msg('a', 'assistant', [{ type: 'tool-create_task', state: 'approval-requested' }])])).toBeNull();
  });
  it('falls back to a plain name for the action when no proposal card came', () => {
    const only = msg('a', 'assistant', [{ type: 'tool-create_task', toolCallId: 'c', state: 'approval-requested', approval: { id: 'ap' } }]);
    expect(pendingApproval([only])).toEqual({ approvalId: 'ap', tool: 'create_task', action: 'Assign task' });
  });
});

describe('pairProposals: each card with its own approval', () => {
  const two = msg('a', 'assistant', [tool('c1', 'ap-1', 'approval-responded', true), proposal('k1', 'Jonah'), tool('c2', 'ap-2', 'approval-requested'), proposal('k2', 'Eli')]);
  it('two proposals of one tool are not crossed: the n-th card takes the n-th part', () => {
    const paired = pairProposals(parts(two) as never, { isLast: true, busy: false });
    const views = [...paired.values()];
    expect(views.map((v) => [v.key, v.approvalId, v.status])).toEqual([
      ['k1', 'ap-1', 'confirmed'],
      ['k2', 'ap-2', 'live'],
    ]);
  });
  it('a card in a turn that is not the last has no live approval: it is abandoned, nothing was created', () => {
    const views = [...pairProposals(parts(two) as never, { isLast: false, busy: false }).values()];
    expect(views.map((v) => v.status)).toEqual(['confirmed', 'abandoned']);
  });
  it('a card that arrived before its approval waits while the turn streams, and is abandoned when it does not', () => {
    const card = msg('a', 'assistant', [proposal('k1', 'Jonah')]);
    expect([...pairProposals(parts(card) as never, { isLast: true, busy: true }).values()][0]?.status).toBe('preparing');
    expect([...pairProposals(parts(card) as never, { isLast: true, busy: false }).values()][0]?.status).toBe('abandoned');
  });
  it('a denial is cancelled; a receipt says confirmed even if the approval part is gone (a reload)', () => {
    const denied = msg('a', 'assistant', [tool('c1', 'ap-1', 'approval-responded', false), proposal('k1', 'Jonah')]);
    expect([...pairProposals(parts(denied) as never, { isLast: true, busy: false }).values()][0]?.status).toBe('cancelled');
    const reloaded = msg('a', 'assistant', [proposal('k1', 'Jonah'), { type: 'data-action-receipt', id: 'receipt-k1', data: ASK_RECEIPT_DONE }]);
    const v = [...pairProposals(parts(reloaded) as never, { isLast: false, busy: false }).values()][0];
    expect(v?.status).toBe('confirmed');
    expect(v?.receipt?.status).toBe('completed');
  });
});

describe('buildTurns: a thread as it is drawn', () => {
  it("strips the visible [Context: ...] prefix from the coach's line, and skips a turn with no text", () => {
    const turns = buildTurns([msg('u', 'user', [{ type: 'text', text: '[Context: player Jonah]\nWhy is he missing putts?' }]), msg('u2', 'user', [{ type: 'text', text: '  ' }])], { busy: false });
    expect(turns).toEqual([{ role: 'user', id: 'u', text: 'Why is he missing putts?' }]);
  });
  it('steps come from data-progress; a raw tool name is never shown', () => {
    expect(stepLabel('get_player_metrics')).toBe('Working');
    expect(stepLabel('Reading your roster')).toBe('Reading your roster');
    expect(stepLabel(undefined)).toBe('Working');
    const t = asst(buildTurns(ASK_MSGS_ANSWER, { busy: false }));
    expect(t.steps.map((s) => s.label)).toEqual(['Reading your roster', 'Reading the last 38 recorded rounds', 'Comparing putting by distance', 'Ranking the team']);
  });
  it('the first text block is the takeaway; later ones are body; Copy gets plain text without bold markers', () => {
    const t = asst(buildTurns(ASK_MSGS_ANSWER, { busy: false }));
    const texts = t.blocks.filter((b) => b.kind === 'text');
    expect(texts.map((b) => b.kind === 'text' && b.lead)).toEqual([true, false, false]);
    expect(t.answerText).toContain('Most of it is downhill putts from 4 to 6 feet.');
    expect(t.answerText).not.toContain('**');
  });
  it('a rejected turn keeps its note and its action cards, and hides its prose and evidence', () => {
    const t = asst(buildTurns(ASK_MSGS_REJECTED, { busy: false }));
    expect(t.note).toBe(REJECTED_TURN_NOTE);
    expect(t.blocks.map((b) => b.kind)).toEqual(['proposal']);
    expect(t.envelopes).toEqual([]);
    expect(t.answerText).toBe(t.note);
  });
  it('a verdict part with no note still says it, with the production sentence', () => {
    const m = msg('a', 'assistant', [{ type: 'text', text: 'made up' }, { type: 'data-turn-incomplete', id: 'x', data: {} }]);
    expect(asst(buildTurns([m], { busy: false })).note).toBe(REJECTED_TURN_NOTE);
  });
  it('only the last turn, while busy, is active', () => {
    const turns = buildTurns(ASK_MSGS_ACTION, { busy: true });
    expect(turns.filter((t) => t.role === 'assistant').map((t) => t.role === 'assistant' && t.active)).toEqual([false, true]);
  });
  it('a receipt pairs with its card by part id and shows as its own block', () => {
    const t = asst(buildTurns(ASK_MSGS_RECEIPT, { busy: false }));
    const card = t.blocks.find((b) => b.kind === 'proposal');
    expect(card?.kind === 'proposal' && card.view.status).toBe('confirmed');
    expect(t.blocks.some((b) => b.kind === 'receipt')).toBe(true);
  });
});

describe('followUpsFor: only what the evidence supports, at most three', () => {
  it('nothing without evidence, and nothing from a failed read', () => {
    expect(followUpsFor([])).toEqual([]);
    expect(followUpsFor([ASK_EV_FAILED])).toEqual([]);
    // Even with figures on it: a read that failed supports nothing.
    expect(followUpsFor([{ ...ASK_EV_RANKING, coverage: 'unavailable' as const }])).toEqual([]);
  });
  it("a player's putting evidence offers a focus area and a practice for that player", () => {
    expect(followUpsFor([ASK_EV_RANKING])).toEqual(['Create a focus area for Jonah Okafor on putting', 'Build a putting practice for Jonah Okafor']);
  });
  it('de-duplicates across envelopes and stops at three', () => {
    const envs = [ASK_EV_RANKING, ASK_EV_JONAH, { ...ASK_EV_PARTIAL, measurements: ASK_EV_RANKING.measurements.map((m) => ({ ...m, entity: { ...m.entity, label: 'Eli Brandt' } })), coverage: 'complete' as const }];
    const out = followUpsFor(envs);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(new Set(out).size).toBe(out.length);
  });
  it('a card in the turn replaces the follow-ups', () => {
    expect(asst(buildTurns(ASK_MSGS_ACTION, { busy: false })).followUps).toEqual([]);
    expect(asst(buildTurns(ASK_MSGS_ANSWER, { busy: false })).followUps.length).toBeGreaterThan(0);
  });
});

describe('failedAnswerChangedNothing: only say "Nothing was changed." when it is true', () => {
  it('true when the last message is the coach, or an answer with no write', () => {
    expect(failedAnswerChangedNothing([msg('u', 'user', [{ type: 'text', text: 'hi' }])])).toEqual({ changedNothing: true, unconfirmedWrite: false });
    expect(failedAnswerChangedNothing(ASK_MSGS_ANSWER).changedNothing).toBe(true);
    expect(failedAnswerChangedNothing(ASK_MSGS_ACTION).changedNothing).toBe(true);
  });
  it('false when the last turn holds a receipt', () => {
    expect(failedAnswerChangedNothing(ASK_MSGS_RECEIPT_FAILED).changedNothing).toBe(false);
  });
  it('false, and flagged, when the coach confirmed and no receipt came: the write may have run', () => {
    expect(failedAnswerChangedNothing(ASK_MSGS_CONFIRMED)).toEqual({ changedNothing: false, unconfirmedWrite: true });
  });
});

describe('evidenceBlocks: the shape decides the drawing, and nothing is dropped', () => {
  it('a failed read is "could not read this", never "no data"; an empty read is its own thing', () => {
    expect(evidenceBlocks(ASK_EV_FAILED)).toEqual([{ kind: 'unavailable', note: 'The rounds query failed.' }]);
    expect(evidenceBlocks(ASK_EV_EMPTY)[0]?.kind).toBe('empty');
  });
  it('a bucket series is bars with the sample beside each, the weak side flagged amber', () => {
    const [b] = evidenceBlocks(ASK_EV_SLOPE);
    expect(b?.kind).toBe('bars');
    if (b?.kind !== 'bars') return;
    expect(b.rows.map((r) => [r.label, r.display, r.of, r.tone])).toEqual([
      ['Uphill', '81%', 'of 44', 'good'],
      ['Flat', '76%', 'of 51', 'good'],
      ['Downhill', '58%', 'of 31', 'loss'],
    ]);
    expect(b.table.columns).toEqual(['Range', 'Make rate from 4 to 6 feet, by slope', 'Sample']);
    expect(b.source).toBe('126 attempts · Sep 1 to Sep 29 · computed Sep 29');
  });
  it('three players on one metric are a ranking; two players are a comparison table', () => {
    const [r] = evidenceBlocks(ASK_EV_RANKING);
    expect(r?.kind).toBe('ranking');
    if (r?.kind === 'ranking') expect(r.rows.map((x) => [x.rank, x.label, x.display, x.of])).toEqual([[1, 'Jonah Okafor', '6', 'of 9'], [2, 'Eli Brandt', '4', 'of 8'], [3, 'Sofia Alvarez', '2', 'of 7']]);
    const two = { ...ASK_EV_RANKING, measurements: ASK_EV_RANKING.measurements.slice(0, 2) };
    expect(evidenceBlocks(two)[0]?.kind).toBe('compare');
  });
  it('fewer than three rounds is a table, three or more is a trend with a reference', () => {
    const s = ASK_EV_JONAH.series[0]!;
    const few = { ...ASK_EV_JONAH, measurements: [], series: [{ ...s, points: s.points.slice(0, 2) }] };
    expect(evidenceBlocks(few)[0]?.kind).toBe('table');
    const [t] = evidenceBlocks({ ...ASK_EV_JONAH, measurements: [] });
    expect(t?.kind).toBe('trend');
    if (t?.kind === 'trend') expect(t.reference?.label).toBe('Average');
  });
  it('strokes gained by leg is a diverging chart; a true minus and a plus', () => {
    const sg = { ...ASK_EV_PARTIAL, coverage: 'complete' as const, coverage_note: null, measurements: [
      { ...ASK_EV_PARTIAL.measurements[0]!, metric_id: 'sg_putting', metric_label: 'Strokes gained: putting', unit: 'strokes' as const, value: -1.9 },
      { ...ASK_EV_PARTIAL.measurements[0]!, metric_id: 'sg_approach', metric_label: 'Strokes gained: approach', unit: 'strokes' as const, value: 0.3 },
    ] };
    const [b] = evidenceBlocks(sg);
    expect(b?.kind).toBe('legs');
    if (b?.kind === 'legs') {
      expect(b.rows.map((r) => [r.label, r.display])).toEqual([['putting', '−1.90'], ['approach', '+0.30']]);
      expect(b.takeaway).toBe('Largest loss: Strokes gained: putting at −1.90.');
    }
  });
  it('a single team figure is a tile; a partial read keeps its note', () => {
    const [b] = evidenceBlocks(ASK_EV_PARTIAL);
    expect(b?.kind).toBe('tiles');
    expect(b && 'note' in b ? b.note : null).toBe('6 of 8 players have a round in the last 30 days. The other 2 are left out.');
  });
  it('a benchmark shows only with its source and version, and never when it is omitted for the cohort', () => {
    const m = ASK_EV_PARTIAL.measurements[0]!;
    const withBench = { ...ASK_EV_PARTIAL, coverage: 'complete' as const, measurements: [{ ...m, benchmark: { source: 'PGA Tour expected strokes', version: '2026-06-06', value: 29, omitted_for_cohort: false } }] };
    expect(evidenceBlocks(withBench)[0] && 'bench' in evidenceBlocks(withBench)[0]! ? (evidenceBlocks(withBench)[0] as { bench: string | null }).bench : null).toBe('PGA Tour expected strokes, 2026-06-06: 29');
    const omitted = { ...withBench, measurements: [{ ...withBench.measurements[0]!, benchmark: { ...withBench.measurements[0]!.benchmark!, omitted_for_cohort: true } }] };
    expect((evidenceBlocks(omitted)[0] as { bench: string | null }).bench).toBeNull();
  });
  it('a kind with no chart (a list of records) is its table; an envelope with nothing drawable is still a row, never nothing', () => {
    const records = { summary: '2 open signals for Jonah.', measurements: [], series: [], coverage: 'complete' as const, coverage_note: null, as_of: '2026-09-29T00:00:00.000Z', detail: { player: { name: 'Jonah' }, insights: [{ insight_id: 'x', title: 'Downhill putts', value_display: '58%', created_at: '2026-09-01' }, { insight_id: 'y', title: 'Lag putting', value_display: '2.1', created_at: '2026-09-02' }] } };
    const [t] = evidenceBlocks(records);
    expect(t?.kind).toBe('table');
    if (t?.kind === 'table') expect(t.table).toEqual({ caption: '2 open signals for Jonah.', columns: ['Title', 'Value display'], rows: [['Downhill putts', '58%'], ['Lag putting', '2.1']] });
    const nothing = { ...records, detail: undefined };
    const out = evidenceBlocks(nothing);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('table');
  });
  it('detailTable leaves ids, raw timestamps and the timezone out, and caps rows', () => {
    const t = detailTable({ rows: Array.from({ length: 12 }, (_, i) => ({ id: i, player_id: 'p', created_at: 'x', timezone: 'UTC', name: `N${i}` })) }, 'cap');
    expect(t?.columns).toEqual(['Name']);
    expect(t?.rows).toHaveLength(8);
    expect(detailTable(null, 'c')).toBeNull();
  });
  it('values use a true minus and an em dash for none', () => {
    expect(formatValue(-3, 'score')).toBe('−3');
    expect(formatValue(-0.5, 'strokes')).toBe('−0.50');
    expect(formatValue(58.4, 'percent')).toBe('58%');
    expect(formatValue(null, 'percent')).toBe('—');
    expect(formatValue(12, 'feet')).toBe('12 ft');
  });
});

describe('buildEvidencePanel: the figures behind an action card', () => {
  it("draws the player's tiles with the made count, the team figure beside them, and a trend against the team line", () => {
    const m = buildEvidencePanel(ASK_MSGS_ACTION, ASK_FOCUS_JONAH);
    expect(m.empty).toBe(false);
    expect(m.tiles.map((t) => [t.label, t.value, t.sub])).toEqual([
      ['Downhill, 4 to 6 feet', '33%', '3 of 9'],
      ['Team, Downhill, 4 to 6 feet', '58%', '18 of 31'],
      ['Uphill, 4 to 6 feet', '78%', '7 of 9'],
    ]);
    expect(m.trend?.reference).toEqual({ label: 'Team 58%', value: 58 });
    expect(m.table?.rows[0]).toEqual(['Sep 5', '50%', '2']);
  });
  it('says so when the sample is small, at the threshold and under it, and not above it', () => {
    expect(SMALL_SAMPLE_MAX).toBe(12);
    expect(buildEvidencePanel(ASK_MSGS_ACTION, ASK_FOCUS_JONAH).smallSample).toBe('Small sample: 9 attempts. Treat it as a direction, not a verdict.');
    const big = structuredClone(ASK_MSGS_ACTION);
    const ev = (parts(big[1]!) as Array<{ type: string; data?: { envelope: typeof ASK_EV_JONAH } }>).find((p) => p.type === 'data-evidence' && p.data?.envelope.summary.startsWith('Jonah'));
    ev!.data!.envelope.measurements[0]!.sample_size = SMALL_SAMPLE_MAX;
    expect(buildEvidencePanel(big, ASK_FOCUS_JONAH).smallSample).toBe('Small sample: 12 attempts. Treat it as a direction, not a verdict.');
    ev!.data!.envelope.measurements[0]!.sample_size = SMALL_SAMPLE_MAX + 1;
    expect(buildEvidencePanel(big, ASK_FOCUS_JONAH).smallSample).toBeNull();
  });
  it('is empty for a player the conversation has no figures for, and only reads up to the card', () => {
    const other = { ...ASK_FOCUS_JONAH, playerId: 'p-ava', label: 'Ava Lindqvist' };
    expect(buildEvidencePanel(ASK_MSGS_ACTION, other).empty).toBe(true);
    expect(evidenceAvailable(ASK_MSGS_ACTION, other)).toBe(false);
    expect(evidenceAvailable(ASK_MSGS_ACTION, ASK_FOCUS_JONAH)).toBe(true);
    // The same card pointed at the first turn: the later evidence does not count.
    expect(buildEvidencePanel(ASK_MSGS_ACTION, { ...ASK_FOCUS_JONAH, messageId: 'u1' }).tiles).toHaveLength(0);
  });
  it('matches by name when the card carries no player id, and later evidence for a metric replaces earlier', () => {
    const byName = buildEvidencePanel(ASK_MSGS_ACTION, { messageId: 'a2', key: 'k', label: 'Jonah Okafor, downhill' });
    expect(byName.tiles.length).toBeGreaterThan(0);
    const later = msg('a9', 'assistant', [{ type: 'data-evidence', id: 'e9', data: { envelope: { ...ASK_EV_JONAH, series: [], measurements: [{ ...ASK_EV_JONAH.measurements[0]!, value: 40, denominator: 10, sample_size: 10 }] } } }]);
    const m = buildEvidencePanel([...ASK_MSGS_ACTION, later], { ...ASK_FOCUS_JONAH, messageId: 'a9' });
    expect(m.tiles[0]).toMatchObject({ value: '40%', sub: '4 of 10' });
  });
});

describe('prose: paragraphs, lists, bold and roster names', () => {
  it('splits paragraphs and lists, and drops a heading marker rather than honouring it', () => {
    expect(parseProse('## Heading\nline two\n\n- one\n- two\n\nLast')).toEqual([
      { kind: 'paragraph', text: 'Heading line two' },
      { kind: 'list', items: ['one', 'two'] },
      { kind: 'paragraph', text: 'Last' },
    ]);
  });
  it('bold first, then roster names: longest first, on word boundaries', () => {
    expect(splitInline('**Nick Rini** and Nicky and Nick', ['Nick', 'Nick Rini'])).toEqual([
      { text: 'Nick Rini', bold: true, mention: 'Nick Rini' },
      { text: ' and Nicky and ', bold: false },
      { text: 'Nick', bold: false, mention: 'Nick' },
    ]);
  });
  it('a name that is not on the roster is text, and a lone asterisk is a character', () => {
    expect(splitInline('Wake Forest shot 3* under', ['Jonah Okafor'])).toEqual([{ text: 'Wake Forest shot 3* under', bold: false }]);
  });
  it('an @mention in the coach\'s line is found, longest name first, and "@Jonah" alone is not "@Jonah Okafor"', () => {
    expect(splitAtMentions('Create a focus area for @Jonah Okafor on putts', ['Jonah', 'Jonah Okafor'])).toEqual([
      { text: 'Create a focus area for ' },
      { text: '@Jonah Okafor', mention: 'Jonah Okafor' },
      { text: ' on putts' },
    ]);
    expect(splitAtMentions('hello', [])).toEqual([{ text: 'hello' }]);
  });
});
