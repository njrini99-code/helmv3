import { cleanup, render, screen, within } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValidatedComposition } from '@/lib/coachhelm/v3/chat/visuals/composition';
import { buildAssistantTurn } from '../data/coachhelm-chat-thread';
import { ASK_COMPOSITION, ASK_EV_TEAM_COMPARE, ASK_MSGS_COMPOSE } from '../preview/fixtures-ask-thread';
import { CoachComposition, pagesOf } from '../screens/coachhelm/chat/visual/CoachComposition';

/**
 * A model-designed visual in the Clubhouse Ask (playbook docs/architecture/coachhelm-visual-playbook.md), in the yardage book's
 * look (docs/clubhouse/coachhelm-chat-v3/LOOK.md, direction A; owner 11 Nov): ruled sections of the answer's leaf drawn by the
 * studio, never a card in the card. A figure is type toned by colour, with no pill; no bar sits on a track; no "Table" key.
 */

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

describe('CoachComposition: the leaf anatomy', () => {
  it('the finding as its name, the answer as one large figure toned by its verdict, and one provenance line', () => {
    render(<CoachComposition composition={composition} />);
    const section = screen.getByRole('region', { name: composition.title });
    expect(screen.getByRole('heading', { name: composition.title })).toBeTruthy();
    expect(section.querySelector('.ch-aks-cv__lede')?.textContent).toBe(composition.lede);
    const value = section.querySelector('.ch-aks-fig[data-one] .ch-aks-fig__value')!;
    expect(value.textContent).toBe('−0.9');
    // The verdict is the figure's colour (a loss is amber); its words are kept for a reader who does not see colour. No pill.
    expect(value.getAttribute('data-tone')).toBe('loss');
    expect(screen.getByText('Loses to the baseline').className).toContain('ch-sr-only');
    expect(section.querySelector('[class*="chip"]')).toBeNull();
    expect(section.querySelector('.ch-aks-fig__label')?.textContent).toBe('Largest loss, approach');
    expect(section.querySelector('.ch-aks-fig__sub')?.textContent).toBe('Strokes gained: approach, over 8 rounds Loses to the baseline');
    // The sample in words, never "n=".
    expect(section.querySelector('.ch-aks-src')?.textContent).toBe('8 rounds · Sep 1 to Oct 20 · computed Oct 21');
    expect(section.textContent).not.toMatch(/\bn=/);
    // It is the leaf's own sections: no card in the card, so nothing to expand.
    expect(screen.queryByRole('button', { name: 'Expand' })).toBeNull();
    expect(section.getAttribute('data-opens')).toBe('figure');
  });

  it('draws each block with the studio: the legs sounded off the hole, a to-par trend on ruled paper, a labelled note', () => {
    render(<CoachComposition composition={composition} />);
    const parts = [...document.querySelectorAll('.ch-aks-hole__part')];
    expect(parts.map((g) => g.querySelector('.ch-aks-hole__name')?.textContent)).toEqual(['Off the tee', 'Approach', 'Aroundthe green', 'Putting']);
    expect(parts.map((g) => (g.classList.contains('is-gain') ? 'gain' : g.classList.contains('is-loss') ? 'loss' : null))).toEqual(['gain', 'loss', 'gain', 'loss']);
    expect([...document.querySelectorAll('.ch-aks-sg .ch-aks-title > *')].map((el) => el.textContent)).toEqual(['Tee to green', 'Strokes gained a round']);
    // A to-par score is signed, with E for even, in the trend's own words and in the rounds kept for a screen reader.
    expect(screen.getByRole('img', { name: /Score to par for Jonah Okafor: \+2 to −1 across 7 rounds\. Lower is better\./ })).toBeTruthy();
    expect([...document.querySelectorAll('.ch-aks-trend .ch-aks-title > *')].map((el) => el.textContent)).toEqual(['Score to par, last 7 rounds', 'Average +2']);
    expect([...document.querySelectorAll('.ch-aks-ruled table tbody tr')].map((r) => r.querySelector('th')!.textContent + ' ' + r.querySelector('td')!.textContent)).toContain('Oct 11 E');
    const note = document.querySelector('.ch-aks-note');
    expect(note?.getAttribute('data-claim')).toBe('hypothesis');
    expect(note?.querySelector('b')?.textContent).toBe('Hypothesis');
  });

  it('no figure has a "Table" key or a track; the trend keeps its rounds as a table for a screen reader', () => {
    render(<CoachComposition composition={composition} />);
    expect(screen.queryAllByRole('button', { name: /View as table/ })).toHaveLength(0);
    expect(document.querySelector('[class*="track"]')).toBeNull();
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(1);
    expect(tables[0]!.className).toBe('ch-sr-only');
    expect(tables[0]!.querySelectorAll('tbody tr')).toHaveLength(7);
  });

  it('split opens as two level pages in the model’s order, a note staying with its block; coverage notes are shown', () => {
    render(<CoachComposition composition={{ ...composition, coverageNotes: ['2 of 8 rounds have no putts recorded.'] }} />);
    expect(document.querySelector('.ch-aks-cv__pages')?.hasAttribute('data-spread')).toBe(true);
    const pages = [...document.querySelectorAll('.ch-aks-cv__page')].map((page) => [...page.querySelectorAll(':scope > .ch-aks-sec')].map((b) => b.getAttribute('data-type')));
    expect(pages).toEqual([
      ['headline', 'split'],
      ['trend', 'note'],
    ]);
    expect(document.querySelector('.ch-aks-cv__cover')?.textContent).toBe('Partial data 2 of 8 rounds have no putts recorded.');
  });

  it('a stack, a short composition and one with a table of players stay one page', () => {
    expect(pagesOf(composition.blocks, 'stack')).toEqual([[0, 1, 2, 3]]);
    expect(pagesOf(composition.blocks.slice(0, 2), 'split')).toEqual([[0, 1]]);
    expect(pagesOf([...composition.blocks, { type: 'compare', measurements: ASK_EV_TEAM_COMPARE.measurements } as never], 'split')).toEqual([[0, 1, 2, 3, 4]]);
  });
});

describe('CoachComposition: motion only for a live answer', () => {
  it('a restored visual draws final: no live mark, no draw-in on the line', () => {
    render(<CoachComposition composition={composition} />);
    expect(document.querySelector('.ch-aks-cv')?.hasAttribute('data-live')).toBe(false);
    expect(document.querySelector('.ch-aks-ruled')?.hasAttribute('data-draw')).toBe(false);
    expect(document.querySelector('.ch-aks-ruled__path')?.getAttribute('pathLength')).toBeNull();
  });

  it('a visual that arrives in the live answer moves, and keeps that decision when the answer finishes', () => {
    const { rerender } = render(<CoachComposition composition={composition} live />);
    expect(document.querySelector('.ch-aks-cv')?.hasAttribute('data-live')).toBe(true);
    expect(document.querySelector('.ch-aks-ruled')?.hasAttribute('data-draw')).toBe(true);
    expect(document.querySelector('.ch-aks-ruled__path')?.getAttribute('pathLength')).toBe('1');
    rerender(<CoachComposition composition={composition} live={false} />);
    expect(document.querySelector('.ch-aks-cv')?.hasAttribute('data-live')).toBe(true);
  });

  it('reduced motion draws it final even when it arrives live', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
    render(<CoachComposition composition={composition} live />);
    expect(document.querySelector('.ch-aks-cv')?.hasAttribute('data-live')).toBe(false);
    expect(document.querySelector('.ch-aks-ruled')?.hasAttribute('data-draw')).toBe(false);
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
    expect(head).toEqual(['Player', 'Scoring average to par', 'Strokes gained: total', 'Putts per round']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    // To par is signed with E for even; strokes gained carries its sign.
    expect(rows.map((r) => r.querySelectorAll('td')[0]?.textContent?.replace(' (best)', ''))).toEqual(['+3.1', '+1.8', '−0.4', 'E', '+4.6']);
    // Lower is better for to par and putts, higher for strokes gained: Sofia is best on all three.
    const sofia = rows[2]!;
    expect(sofia.querySelectorAll('td[data-best]')).toHaveLength(3);
    expect(table.querySelectorAll('td[data-best]')).toHaveLength(3);
    // Strokes gained is coloured by its sign, and says what it is measured against.
    expect(rows[0]!.querySelectorAll('td')[1]?.getAttribute('data-tone')).toBe('loss');
    expect(sofia.querySelectorAll('td')[1]?.getAttribute('data-tone')).toBe('gain');
    expect(screen.getByText(/Strokes gained is against the baseline/)).toBeTruthy();
    expect(document.querySelector('.ch-aks-cmp .ch-aks-title')?.textContent).toBe('5 players');
  });
});

describe('CoachComposition: the headline compares with the level, the team and the Tour (owner, 2026-11-08)', () => {
  const girRef = (kind: 'level' | 'team' | 'tour', value: number | null, over: Record<string, unknown> = {}) => ({ kind, label: kind, value, place_percent: null, place_of: null, note: null, ...over });
  const gir = (comparisons: unknown[], benchmark: unknown) => ({
    ...JSON.parse(JSON.stringify(ASK_COMPOSITION.blocks[0]!.measurement)),
    metric_id: 'gir_pct', metric_label: 'Greens in regulation', unit: 'percent', value: 58.1, direction: 'higher_better', denominator: null, comparisons, benchmark,
  });
  const headline = (m: unknown) => ValidatedComposition.parse({ ...ASK_COMPOSITION, blocks: [{ type: 'headline', measurement: m, label: null }] });
  const lines = () => Array.from(document.querySelectorAll('.ch-aks-fig__ref')).map((li) => li.textContent);

  it('lists all three under the figure, level first and the Tour last, each with where the player sits', () => {
    const m = gir([girRef('level', 61.5, { place_percent: 30, place_of: 70 }), girRef('team', 57.2, { place: 6, place_of: 9 }), girRef('tour', 66)], { source: 'Division III average 2024', version: '2024', value: 61.5, omitted_for_cohort: false });
    render(<CoachComposition composition={headline(m)} />);
    expect(lines()).toEqual(['Level 62% · ahead of 30% of 70 college players on Helm (all rounds)', 'Team 57% · 6th of 9', 'Tour 66%']);
    // Behind its benchmark: the figure is amber, and the words are there for a reader who does not see colour.
    expect(document.querySelector('.ch-aks-fig__value')?.getAttribute('data-tone')).toBe('loss');
    expect(screen.getByText('Behind Division III average 2024').className).toContain('ch-sr-only');
    expect(document.querySelector('.ch-aks-fig__vs')?.textContent).toBe('Compared with');
  });

  it('states a missing figure instead of dropping it or showing one alone', () => {
    const m = gir([girRef('level', null, { missing_reason: 'not set' }), girRef('team', null, { missing_reason: 'no team average yet' }), girRef('tour', 66)], { source: 'PGA Tour 2024', version: '2024', value: 66, omitted_for_cohort: false });
    render(<CoachComposition composition={headline(m)} />);
    const l = lines();
    expect(l).toHaveLength(3);
    expect(l[0]).toBe('Level: not set');
    expect(l[1]).toBe('Team: no team average yet');
    expect(l[2]).toBe('Tour 66%');
  });

  it('draws no comparison list for a figure the standards do not cover', () => {
    render(<CoachComposition composition={headline(gir([], null))} />);
    expect(document.querySelector('.ch-aks-fig__ref')).toBeNull();
    expect(document.querySelector('.ch-aks-fig__vs')).toBeNull();
    expect(document.querySelector('.ch-aks-fig__value')?.hasAttribute('data-tone')).toBe(false);
  });
});
