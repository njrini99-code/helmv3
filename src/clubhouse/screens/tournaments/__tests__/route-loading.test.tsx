import { cleanup, render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * GAP-S-15: each Tournaments route's loading.tsx draws the boxes of the view it opens (its screen's own loading state), not
 * the home page's, so the page does not jump from one layout to another as it lands.
 */
const ROUTES: ReadonlyArray<[route: string, load: () => Promise<{ default: ComponentType }>, className: string | null]> = [
  ['tournaments', () => import('@/app/golf/(dashboard)/dashboard/tournaments/loading'), null],
  ['[id]', () => import('@/app/golf/(dashboard)/dashboard/tournaments/[id]/loading'), 'ch-tour-desk'],
  ['[id]/edit', () => import('@/app/golf/(dashboard)/dashboard/tournaments/[id]/edit/loading'), 'ch-tour-lu-form'],
  ['new', () => import('@/app/golf/(dashboard)/dashboard/tournaments/new/loading'), 'ch-tour-lu-form'],
  ['[id]/lineup', () => import('@/app/golf/(dashboard)/dashboard/tournaments/[id]/lineup/loading'), 'ch-tour-lu'],
  ['[id]/live', () => import('@/app/golf/(dashboard)/dashboard/tournaments/[id]/live/loading'), 'ch-tour-live'],
  ['compare', () => import('@/app/golf/(dashboard)/dashboard/tournaments/compare/loading'), 'ch-tour-cmp'],
  ['history', () => import('@/app/golf/(dashboard)/dashboard/tournaments/history/loading'), 'ch-tour-rev-hist'],
  ['links', () => import('@/app/golf/(dashboard)/dashboard/tournaments/links/loading'), 'ch-tour-rev'],
];

afterEach(cleanup);

describe('Tournaments route loading (CH-16401)', () => {
  it.each(ROUTES)('%s loads in its own view’s boxes', async (_route, load, className) => {
    const Loading = (await load()).default;
    const { container } = render(<Loading />);
    const root = container.querySelector('[aria-busy="true"]')!;
    expect(root).not.toBeNull();
    if (className) expect(root.classList.contains(className)).toBe(true);
    else expect(root.className).not.toMatch(/ch-tour-(desk|lu|live|cmp|rev)/);
  });
});
