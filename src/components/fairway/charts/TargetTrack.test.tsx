import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TargetTrack } from './TargetTrack';

const left = (el: Element | null) => parseFloat((el as HTMLElement).style.left);

describe('TargetTrack', () => {
  it('names every number in one image label, printed by the registry', () => {
    render(<TargetTrack metricId="putts_per_round" baseline={32.1} current={31.4} target={30} sample={8} daysLeft={12} />);
    expect(
      screen.getByRole('img', {
        name: 'Putts per round: started 32.1, now 31.4, target 30.0, 12 days left',
      }),
    ).toBeTruthy();
    expect(screen.getByText('12 days left')).toBeTruthy();
  });

  it('fills from baseline to current in green when the move is toward the target', () => {
    const { container } = render(<TargetTrack metricId="putts_per_round" baseline={32} current={31} target={30} sample={8} />);
    expect(container.firstElementChild!.getAttribute('data-progress')).toBe('toward');
    const fill = container.querySelector('[data-fill]') as HTMLElement;
    expect(fill.className).toContain('bg-accent-fill');
    const base = left(container.querySelector('[data-mark="baseline"]'));
    const now = left(container.querySelector('[data-mark="current"]'));
    const target = left(container.querySelector('[data-mark="target"]'));
    // Lower is the goal here: target left of current left of baseline.
    expect(target).toBeLessThan(now);
    expect(now).toBeLessThan(base);
    expect(parseFloat(fill.style.left)).toBeCloseTo(now, 1);
    expect(parseFloat(fill.style.width)).toBeCloseTo(base - now, 1);
  });

  it('turns amber when the metric moved away from the target', () => {
    const { container } = render(<TargetTrack metricId="fairway_pct" baseline={50} current={46} target={60} sample={8} />);
    expect(container.firstElementChild!.getAttribute('data-progress')).toBe('away');
    expect(container.querySelector('[data-fill]')!.className).toContain('bg-fw-warning');
  });

  it('says the target is met once current passes it', () => {
    render(<TargetTrack metricId="fairway_pct" baseline={50} current={62} target={60} sample={8} daysLeft={0} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('target met');
    expect(screen.getByText('Due today')).toBeTruthy();
  });

  it('draws no current mark under the floor and says how many more', () => {
    const { container } = render(<TargetTrack metricId="putts_per_round" baseline={32} current={31} target={30} sample={1} />);
    expect(container.querySelector('[data-mark="current"]')).toBeNull();
    expect(container.firstElementChild!.getAttribute('data-progress')).toBe('none');
    expect(container.textContent).toContain('Needs 2 more rounds');
  });
});
