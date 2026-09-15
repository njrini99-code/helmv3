import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PuttingZoom, type DistancePuttingProps } from './PuttingZoom';

function drawing(distanceView: DistancePuttingProps['distanceView'], width = 320) {
  return new DOMParser().parseFromString(renderToStaticMarkup(
    <PuttingZoom width={width} height={160} distanceView={distanceView} />,
  ), 'image/svg+xml');
}

describe('illustrated putting distances', () => {
  it('keeps the 12-foot start and 2-foot leave at the same scale across phone widths', () => {
    for (const width of [320, 375, 390, 430]) {
      const svg = drawing({ beforeFeet: 12, afterFeet: 2 }, width);
      const line = svg.querySelector('[data-putting-distance-line]')!;
      const length = Number(line.getAttribute('x2')) - Number(line.getAttribute('x1'));
      const radius = Number(svg.querySelector('[data-putting-radius="after"]')!.getAttribute('r'));
      expect(length / radius).toBeCloseTo(6, 10);
      expect(svg.querySelectorAll('[data-putting-ball]')).toHaveLength(1);
      expect(svg.documentElement.textContent).toContain('2 ft remaining');
      expect(svg.documentElement.textContent).not.toContain('Cup reference');
    }
  });
  it('does not turn a zero leave into a recorded make', () => {
    const unknown = drawing({ beforeFeet: 12, afterFeet: 0 });
    expect(unknown.querySelector('[data-putting-hole]')!.getAttribute('data-made')).toBe('false');
    expect(unknown.documentElement.textContent).not.toContain('Holed');
    const made = drawing({ beforeFeet: 12, afterFeet: 0, made: true });
    expect(made.documentElement.textContent).toContain('Holed');
    expect(made.querySelector('[data-putting-radius="after"]')).toBeNull();
  });
  it('keeps unknown starts absent and a longer rolled-off leave to scale', () => {
    const unknown = drawing({ beforeFeet: null });
    expect(unknown.querySelector('[data-putting-ball]')).toBeNull();
    expect(unknown.documentElement.textContent).toContain('Distance unknown');
    const rolled = drawing({ beforeFeet: 12, afterFeet: 21, rolledOff: true });
    const line = rolled.querySelector('[data-putting-distance-line]')!;
    const length = Number(line.getAttribute('x2')) - Number(line.getAttribute('x1'));
    const radius = Number(rolled.querySelector('[data-putting-radius="after"]')!.getAttribute('r'));
    expect(length / radius).toBeCloseTo(12 / 21, 10);
    expect(rolled.documentElement.textContent).toContain('21 ft remaining · off green');
  });
});
