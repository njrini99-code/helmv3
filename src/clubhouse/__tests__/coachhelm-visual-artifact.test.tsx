import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAssistantTurn } from '../data/coachhelm-chat-thread';
import { ASK_VISUAL_SG } from '../preview/fixtures-ask-thread';
import { ValidatedVisualArtifact } from '@/lib/coachhelm/v3/chat/visuals/schema';
import { CoachVisualArtifact } from '../screens/coachhelm/chat/visual/CoachVisualArtifact';

afterEach(cleanup);
const artifact = ValidatedVisualArtifact.parse({ ...ASK_VISUAL_SG, highlightedMetricId: null });

describe('CH-13853: CoachVisualArtifact · sg_anatomy', () => {
  it('draws every leg with its figure and a name a screen reader can use', () => {
    render(<CoachVisualArtifact artifact={artifact} />);
    expect(screen.getByRole('button', { name: 'Approach: loses 0.9 strokes a round, over 8 rounds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Off the tee: gains 0.2 strokes a round, over 8 rounds' })).toBeInTheDocument();
    expect(document.querySelectorAll('.ch-th-va__row')).toHaveLength(4);
    expect(screen.getByText('Select a part of the game to see its sample.')).toBeInTheDocument();
  });

  it('opens the leg the model asked for, with its note marked as something to test', () => {
    render(<CoachVisualArtifact artifact={{ ...artifact, highlightedMetricId: 'sg_approach' }} />);
    expect(screen.getByRole('button', { name: /^Approach/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status').textContent).toContain('Approach loses 0.9 strokes a round over 8 rounds.');
    expect(screen.getByText('To test')).toBeInTheDocument();
  });

  it('a click selects a leg and a second click clears it, with no model call anywhere', () => {
    render(<CoachVisualArtifact artifact={artifact} />);
    const putting = screen.getByRole('button', { name: /^Putting/ });
    fireEvent.click(putting);
    expect(putting).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status').textContent).toContain('Putting loses 0.3 strokes a round over 8 rounds.');
    expect(screen.getByRole('button', { name: /^Approach/ }).className).toContain('is-quiet');
    fireEvent.click(putting);
    expect(putting).toHaveAttribute('aria-pressed', 'false');
  });

  it('the arrow keys move between legs', () => {
    render(<CoachVisualArtifact artifact={artifact} />);
    const rows = screen.getAllByRole('button').filter((b) => b.classList.contains('ch-th-va__row'));
    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1]!, { key: 'ArrowUp' });
    fireEvent.keyDown(rows[0]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[3]);
  });

  it('the same figures are a table, with a total, and an even leg draws no bar', () => {
    const even = { ...artifact, legs: artifact.legs.map((l) => (l.metricId === 'sg_around_green' ? { ...l, value: 0 } : l)) };
    render(<CoachVisualArtifact artifact={even} />);
    expect(document.querySelectorAll('.ch-th-va__bar')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /View as table/ }));
    const table = screen.getByRole('table');
    expect(table.textContent).toContain('Putting');
    expect(table.textContent).toContain('Total');
    expect(document.querySelector('.ch-th-va__chart')).toBeNull();
  });

  it('says so when the parts do not add up to the total, and when the data is partial', () => {
    render(<CoachVisualArtifact artifact={{ ...artifact, coverage: 'partial', total: { value: 0.8, sampleSize: 8, reconciles: false } }} />);
    expect(screen.getByText('Partial data')).toBeInTheDocument();
    expect(document.querySelector('.ch-th-va__total')?.textContent).toContain('differ from the total');
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
