import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Card, CardBody, CardFooter, CardHeader, CardMetric, featureCount } from '../Card';
import { Surface } from '../Surface';

describe('Card kernel', () => {
  it('a pressable card is one button named by its face, with no heading inside it', () => {
    const open = vi.fn();
    render(
      <Card kind="metric" bar="green" onPress={open} ctl="CTL-P003-019">
        <CardHeader eyebrow="Lowest average" title="ignored as heading" />
        <CardMetric value="73.4" unit="season" />
      </Card>,
    );
    const b = screen.getByRole('button');
    expect(b.textContent).toContain('Lowest average');
    expect(b.textContent).toContain('73.4');
    expect(b.querySelector('h2, h3')).toBeNull();
    expect(b.getAttribute('data-card-bar')).toBe('green');
    expect(b.getAttribute('data-ctl')).toBe('CTL-P003-019');
    expect(b.hasAttribute('data-ch-press-scale')).toBe(true);
    fireEvent.click(b);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('a pressable card drops any second control in it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Card onPress={() => {}}>
        <CardHeader eyebrow="Leaders" actions={<button type="button">More</button>} />
        <CardFooter action={<button type="button">Open</button>}>note</CardFooter>
      </Card>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a static card is a section with a real heading', () => {
    render(
      <Card kind="entity">
        <CardHeader title="Next qualifier" meta="Thursday" />
        <CardBody>5 of 6 confirmed</CardBody>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Next qualifier');
  });

  it('a green bar only goes on paper: a feature card is already green', () => {
    const { container } = render(<Card tone="feature" bar="green"><CardHeader eyebrow="Team" /></Card>);
    const card = container.querySelector('.ch-card')!;
    expect(card.getAttribute('data-card-bar')).toBeNull();
    expect(featureCount(container)).toBe(1);
  });

  it('loading draws the card shape, busy, and is not pressable', () => {
    const { container } = render(<Card kind="chart" state="loading" onPress={() => {}} label="Loading trend" />);
    const card = container.querySelector('.ch-card')!;
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.tagName).toBe('SECTION');
    expect(container.querySelector('.ch-card__skel-block')).not.toBeNull();
  });

  it('empty and failed keep the header and put the message where the body was', () => {
    render(
      <Card state="failed" message="Could not load scores.">
        <CardHeader eyebrow="Best last 3" />
        <CardMetric value="71.0" />
      </Card>,
    );
    expect(screen.getByText('Best last 3')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Could not load scores.');
    expect(screen.queryByText('71.0')).toBeNull();
  });

  it('a figure carries its unit for a screen reader and tones only a real gain or loss', () => {
    const { container } = render(<Card><CardMetric value="−0.6" unit="SG a round" tone="loss" /></Card>);
    const v = container.querySelector('.ch-card__value')!;
    expect(v.textContent).toBe('−0.6 SG a round');
    expect(v.className).toContain('is-loss');
    expect(v.className).toContain('ch-num');
  });

  it('warns when a card is drawn inside a card', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Surface title="Outer"><Card><CardHeader eyebrow="Inner" /></Card></Surface>);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('Card inside a card'))).toBe(true);
    warn.mockRestore();
  });
});
