import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAssistantTurn } from '../data/coachhelm-chat-thread';
import { ASK_VISUAL_SG } from '../preview/fixtures-ask-thread';
import { ValidatedVisualArtifact } from '@/lib/coachhelm/v3/chat/visuals/schema';
import { CoachVisualArtifact } from '../screens/coachhelm/chat/visual/CoachVisualArtifact';

afterEach(cleanup);
const artifact = ValidatedVisualArtifact.parse({ ...ASK_VISUAL_SG, highlightedMetricId: null });

// The look is the yardage book's (LOOK.md, direction A; owner 11 Nov): the legs are sounded off the hole drawn tee to green,
// a stem above the baseline for a gain and below it for a loss. No bar on a grey track, no "Table" key, nothing to select.
describe('CH-13853: CoachVisualArtifact · sg_anatomy', () => {
  it('draws every leg on the hole, with a name a screen reader can use', () => {
    render(<CoachVisualArtifact artifact={artifact} />);
    expect(screen.getByRole('button', { name: 'Approach: loses 0.9 strokes a round, over 8 rounds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Off the tee: gains 0.2 strokes a round, over 8 rounds' })).toBeInTheDocument();
    expect(document.querySelectorAll('.ch-aks-hole__part')).toHaveLength(4);
    // The figure printed at each stem carries its sign, and its tone is its colour.
    expect([...document.querySelectorAll('.ch-aks-hole__value')].map((t) => t.textContent)).toEqual(['+0.2', '−0.9', '+0.1', '−0.3']);
    expect([...document.querySelectorAll('.ch-aks-hole__part')].map((g) => (g.classList.contains('is-gain') ? 'gain' : g.classList.contains('is-loss') ? 'loss' : 'even'))).toEqual(['gain', 'loss', 'gain', 'loss']);
    // Each leg says its own sample, so nothing has to be selected to read it.
    expect(screen.queryByText('Select a part of the game to see its sample.')).toBeNull();
    expect(document.querySelector('[class*="track"]')).toBeNull();
  });

  it('marks the leg the model asked for, with its note marked as something to test', () => {
    render(<CoachVisualArtifact artifact={{ ...artifact, highlightedMetricId: 'sg_approach' }} />);
    const on = [...document.querySelectorAll('.ch-aks-hole__part.is-on')];
    expect(on).toHaveLength(1);
    expect(on[0]!.querySelector('.ch-aks-hole__name')?.textContent).toBe('Approach');
    expect(screen.getByText('To test')).toBeInTheDocument();
    expect(screen.getByText('To test').closest('p')?.textContent).toBe('To test Worth testing against his approach distances before changing anything');
  });

  it('a tap on a leg fills the composer with a question about it, with no model call anywhere', () => {
    const filled: string[] = [];
    const onFill = (e: Event) => filled.push((e as CustomEvent<string>).detail);
    window.addEventListener('ch-ask-fill', onFill);
    render(<CoachVisualArtifact artifact={artifact} />);
    const putting = screen.getByRole('button', { name: /^Putting/ });
    fireEvent.click(putting);
    window.removeEventListener('ch-ask-fill', onFill);
    expect(filled).toEqual(['Ask about this: strokes gained putting, −0.3']);
    // A key, not a toggle: nothing is pressed, nothing else dims.
    expect(putting).not.toHaveAttribute('aria-pressed');
    expect(putting.getAttribute('data-ask-ref')).toBe('strokes_gained:va-preview0001:sg_putting');
  });

  it('the keyboard reaches the legs in the order the hole is played', () => {
    render(<CoachVisualArtifact artifact={artifact} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent?.split(':')[0])).toEqual(['Off the tee', 'Approach', 'Around the green', 'Putting']);
  });

  it('an even leg draws no stem, the total is said, and there is no Table key', () => {
    const even = { ...artifact, legs: artifact.legs.map((l) => (l.metricId === 'sg_around_green' ? { ...l, value: 0 } : l)) };
    render(<CoachVisualArtifact artifact={even} />);
    expect(document.querySelectorAll('.ch-aks-hole__stem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Around the green: is even with the baseline, over 8 rounds' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View as table/ })).toBeNull();
    expect(document.querySelector('.ch-aks-va__total')?.textContent).toBe('Total −0.9 a round · the four parts add up to it');
  });

  it('says so when the parts do not add up to the total, and when the data is partial', () => {
    render(<CoachVisualArtifact artifact={{ ...artifact, coverage: 'partial', total: { value: 0.8, sampleSize: 8, reconciles: false } }} />);
    expect(screen.getByText('Partial data')).toBeInTheDocument();
    expect(document.querySelector('.ch-aks-va__total')?.textContent).toContain('differ from the total');
  });
});

describe('the thread builds a visual block', () => {
  const evidence = (id: string, ref?: string) => ({ type: 'data-evidence', id, data: { tool: 'get_player_metrics', envelope: { summary: 's', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-10-21T00:00:00Z' }, ...(ref ? { ref } : {}) } });
  const msg = (parts: unknown[]) => ({ id: 'a1', role: 'assistant', parts }) as unknown as UIMessage;
  const visual = { type: 'data-visual-artifact', id: 'visual-1', data: ASK_VISUAL_SG };

  it('stands in for the reads it was built from, and keeps the ones it was not', () => {
    const turn = buildAssistantTurn(msg([evidence('x1', 'e1'), evidence('x2', 'e2'), visual]), { isLast: false, busy: false });
    if (turn.role !== 'assistant') throw new Error('assistant turn expected');
    expect(turn.blocks.map((b) => b.kind)).toEqual(['evidence', 'visual']);
  });

  it('ignores a stored artifact that does not parse, and keeps the evidence it would have replaced', () => {
    const bad = { type: 'data-visual-artifact', id: 'visual-2', data: { kind: 'sg_anatomy', legs: [] } };
    const turn = buildAssistantTurn(msg([evidence('x1', 'e1'), bad]), { isLast: false, busy: false });
    if (turn.role !== 'assistant') throw new Error('assistant turn expected');
    expect(turn.blocks.map((b) => b.kind)).toEqual(['evidence']);
  });
});
