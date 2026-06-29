import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentPill } from '@/components/golf/coachhelm/v3/IntentPill';

describe('IntentPill', () => {
  it('renders the right label + emoji for each narrative goal', () => {
    const cases = [
      { goal: 'bubble' as const,        label: 'Bubble',   emoji: '🔴' },
      { goal: 'maintain' as const,      label: 'Maintain', emoji: '🟢' },
      { goal: 'develop' as const,       label: 'Develop',  emoji: '🟡' },
      { goal: 'breakout' as const,      label: 'Breakout', emoji: '⭐' },
      { goal: 'rehabilitate' as const,  label: 'Rehab',    emoji: '🔵' },
    ];
    for (const c of cases) {
      const { unmount } = render(<IntentPill narrative_goal={c.goal} />);
      expect(screen.getByText(c.label)).toBeTruthy();
      expect(screen.getByText(c.emoji)).toBeTruthy();
      unmount();
    }
  });

  it('renders "No intent" with neutral styling when narrative_goal is null', () => {
    render(<IntentPill narrative_goal={null} />);
    expect(screen.getByText('No intent')).toBeTruthy();
    const pill = screen.getByTestId('intent-pill');
    expect(pill.getAttribute('data-intent')).toBe('none');
  });

  it('exposes data-intent attribute matching the goal', () => {
    render(<IntentPill narrative_goal="breakout" />);
    expect(screen.getByTestId('intent-pill').getAttribute('data-intent')).toBe('breakout');
  });

  it('renders as a button when onClick is provided', () => {
    const onClick = vi.fn();
    render(<IntentPill narrative_goal="develop" onClick={onClick} />);
    const pill = screen.getByTestId('intent-pill');
    expect(pill.tagName).toBe('BUTTON');
    fireEvent.click(pill);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders as a span (non-interactive) when no onClick', () => {
    render(<IntentPill narrative_goal="develop" />);
    expect(screen.getByTestId('intent-pill').tagName).toBe('SPAN');
  });

  it('honors size prop', () => {
    const { rerender } = render(<IntentPill narrative_goal="develop" size="sm" />);
    // size="sm" uses the canonical `text-eyebrow` utility (W1B sweep #148
    // replaced the old arbitrary `text-caption`).
    expect(screen.getByTestId('intent-pill').className).toContain('text-eyebrow');
    rerender(<IntentPill narrative_goal="develop" size="md" />);
    expect(screen.getByTestId('intent-pill').className).toContain('text-xs');
  });
});
