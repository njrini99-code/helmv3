import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValidatedComposition } from '@/lib/coachhelm/v3/chat/visuals/composition';
import { buildAssistantTurn } from '../data/coachhelm-chat-thread';
import { ASK_COMPOSITION, ASK_EV_TEAM_COMPARE, ASK_MSGS_COMPOSE } from '../preview/fixtures-ask-thread';
import { CoachComposition } from '../screens/coachhelm/chat/visual/CoachComposition';

/** A model-designed visual in the Clubhouse Ask (playbook docs/architecture/coachhelm-visual-playbook.md). */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const composition = ValidatedComposition.parse(ASK_COMPOSITION);
const msg = (parts: unknown[]) => ({ id: 'a1', role: 'assistant', parts }) as unknown as UIMessage;
const evidence = (id: string, ref: string) => ({ type: 'data-evidence', id, data: { tool: 'get_player_metrics', envelope: { summary: 's', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-10-21T00:00:00Z' }, ref } });

describe('the thread builds a composition block', () => {
  it('draws the composition in place of the reads it draws in full, and keeps the others', () => {
    const turn = buildAssistantTurn(msg([evidence('x1', 'e1'), evidence('x2', 'e2'), evidence('x3', 'e3'), { type: 'data-visual-composition', id: 'visual-vc', data: ASK_COMPOSITION }]), { isLast: false, busy: false });
    if (turn.role !== 'assistant') throw new Error('assistant turn expected');
    expect(turn.blocks.map((b) => b.kind)).toEqual(['evidence', 'composition']);
  });

  it('the preview answer: prose, the composition, prose, and no plain card for the two reads it drew', () => {
    const turn = buildAssistantTurn(ASK_MSGS_COMPOSE[1]!, { isLast: true, busy: false });
    if (turn.role !== 'assistant') throw new Error('assistant turn expected');
    expect(turn.blocks.map((b) => b.kind)).toEqual(['text', 'composition', 'text']);
  });

  it('ignores a stored composition that does not parse, and keeps the evidence it would have hidden', () => {
    const turn = buildAssistantTurn(msg([evidence('x1', 'e1'), { type: 'data-visual-composition', id: 'v', data: { kind: 'compose', blocks: [] } }]), { isLast: false, busy: false });
    if (turn.role !== 'assistant') throw new Error('assistant turn expected');
    expect(turn.blocks.map((b) => b.kind)).toEqual(['evidence']);
  });
});

describe('CoachComposition: the card anatomy', () => {
  it('entity, the finding as a title, the takeaway, the answer as a number with its verdict, and one provenance line', () => {
    render(<CoachComposition composition={composition} />);
    const card = screen.getByRole('region', { name: composition.title });
    expect(card.querySelector('.ch-th-cv__entity')?.textContent).toBe('Jonah Okafor');
    expect(screen.getByRole('heading', { name: composition.title })).toBeTruthy();
    expect(card.querySelector('.ch-th-cv__hero-n')?.textContent).toBe('−0.9');
    expect(screen.getByText('Loses to the baseline')).toBeTruthy();
    // The sample in words, never "n=".
    expect(card.querySelector('.ch-th-cv__src')?.textContent).toBe('8 rounds · Sep 1 to Oct 20 · computed Oct 21');
    expect(card.textContent).not.toMatch(/\bn=/);
  });

  it('draws each block with the thread’s own pieces: strokes gained legs, a to-par trend, a labelled note', () => {
    render(<CoachComposition composition={composition} />);
    const legs = screen.getByRole('list', { name: 'Strokes gained by part of the game' });
    expect(within(legs).getAllByRole('listitem').map((l) => l.getAttribute('data-sign'))).toEqual(['gain', 'loss', 'gain', 'loss']);
    // A to-par score is signed, with E for even, on the trend's own words.
    expect(screen.getByRole('group', { name: /Score to par for Jonah Okafor: \+2 to −1 across 7 rounds\..*Oct 11 E/ })).toBeTruthy();
    const note = document.querySelector('.ch-th-cv__note');
    expect(note?.getAttribute('data-kind')).toBe('hypothesis');
    expect(note?.querySelector('.ch-th-cv__kind')?.textContent).toBe('Hypothesis');
  });

  it('every figure has a quiet "View as table" that swaps in the same figures', () => {
    render(<CoachComposition composition={composition} />);
    const toggles = screen.getAllByRole('button', { name: 'View as table' });
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]!);
    expect(toggles[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('table').textContent).toContain('Strokes gained: approach');
  });

  it('split sets figure blocks two-up and keeps the headline and the note full width; coverage notes are shown', () => {
    render(<CoachComposition composition={{ ...composition, coverageNotes: ['2 of 8 rounds have no putts recorded.'] }} />);
    const blocks = [...document.querySelectorAll('.ch-th-cv__block')];
    expect(blocks.map((b) => [b.getAttribute('data-type'), b.hasAttribute('data-wide')])).toEqual([
      ['headline', true],
      ['split', false],
      ['trend', false],
      ['note', true],
    ]);
    expect(document.querySelector('.ch-th-cv__cover')?.textContent).toBe('Partial data 2 of 8 rounds have no putts recorded.');
  });
});

describe('CoachComposition: motion only for a live answer', () => {
  it('a restored visual draws final: no live mark, no draw-in on the line', () => {
    render(<CoachComposition composition={composition} />);
    expect(document.querySelector('.ch-th-cv')?.hasAttribute('data-live')).toBe(false);
    expect(document.querySelector('.ch-line')?.hasAttribute('data-draw')).toBe(false);
    expect(document.querySelector('.ch-line__path')?.getAttribute('pathLength')).toBeNull();
  });

  it('a visual that arrives in the live answer moves, and keeps that decision when the answer finishes', () => {
    const { rerender } = render(<CoachComposition composition={composition} live />);
    expect(document.querySelector('.ch-th-cv')?.hasAttribute('data-live')).toBe(true);
    expect(document.querySelector('.ch-line')?.hasAttribute('data-draw')).toBe(true);
    expect(document.querySelector('.ch-line__path')?.getAttribute('pathLength')).toBe('1');
    rerender(<CoachComposition composition={composition} live={false} />);
    expect(document.querySelector('.ch-th-cv')?.hasAttribute('data-live')).toBe(true);
  });

  it('reduced motion draws it final even when it arrives live', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
    render(<CoachComposition composition={composition} live />);
    expect(document.querySelector('.ch-th-cv')?.hasAttribute('data-live')).toBe(false);
  });
});

describe('CoachComposition: a team table', () => {
  const team = ValidatedComposition.parse({
    ...ASK_COMPOSITION,
    artifactId: 'vc-team',
    title: 'Sofia leads the team on every measure',
    lede: null,
    layout: 'stack',
    blocks: [{ type: 'compare', measurements: ASK_EV_TEAM_COMPARE.measurements }],
    evidenceRefs: ['e9'],
  });

  it('five players across three metrics: players are rows, metrics columns, the best in each marked by its direction', () => {
    render(<CoachComposition composition={team} />);
    const table = screen.getByRole('table');
    const head = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(head).toEqual(['Player', 'Scoring average to par', 'SG total', 'Putts per round']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    // To par is signed with E for even; strokes gained carries its sign.
    expect(rows.map((r) => r.querySelectorAll('td')[0]?.textContent?.replace(' (best)', ''))).toEqual(['+3.1', '+1.8', '−0.4', 'E', '+4.6']);
    // Lower is better for to par and putts, higher for strokes gained: Sofia is best on all three.
    const sofia = rows[2]!;
    expect(sofia.querySelectorAll('.is-best')).toHaveLength(3);
    expect(document.querySelectorAll('.ch-th-team__v.is-best')).toHaveLength(3);
    // Strokes gained is coloured by its sign, and says what it is measured against.
    expect(rows[0]!.querySelectorAll('td')[1]?.getAttribute('data-tone')).toBe('loss');
    expect(sofia.querySelectorAll('td')[1]?.getAttribute('data-tone')).toBe('good');
    expect(screen.getByText(/Strokes gained is against the baseline/)).toBeTruthy();
    expect(document.querySelector('.ch-th-cv__entity')?.textContent).toBe('5 players');
  });
});
