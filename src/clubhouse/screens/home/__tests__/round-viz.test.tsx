import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PuttsViz } from '../RoundViz';

afterEach(cleanup);

const bar = (putts: number) => {
  const { container } = render(<PuttsViz putts={putts} />);
  return container.querySelector('.ch-rviz--putts i')!.className;
};

describe('the putts bar speaks the tone vocabulary (CONS-20)', () => {
  it('at or under 36 is a gain, over it a loss: never is-over', () => {
    expect(bar(30)).toBe('is-gain');
    expect(bar(36)).toBe('is-gain');
    expect(bar(37)).toBe('is-loss');
    expect(bar(38)).toBe('is-loss');
  });

  it('the loss side is painted, in the chart loss ink', () => {
    const css = readFileSync(join(__dirname, '../../../styles/home.css'), 'utf8');
    expect(css).toMatch(/.ch-rviz--putts i\.is-loss \{\s*background: var\(--ch-chart-loss-fill\);/);
    expect(css).not.toMatch(/\.ch-rviz--putts i\.is-over\b/);
  });
});
