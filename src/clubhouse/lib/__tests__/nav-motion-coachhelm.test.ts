import { describe, expect, it } from 'vitest';
import { chNavPath, classifyNav } from '../nav-motion';

const CH = '/golf/dashboard/coachhelm';
const tabRoots = [CH, '/golf/dashboard'];

describe('CoachHelm pages that live on one route', () => {
  it('names the read and a player page as their own pages', () => {
    expect(chNavPath(CH, '?view=read&player=p1&insight=i')).toBe(`${CH}?view=read`);
    expect(chNavPath(CH, '?view=player&player=p1')).toBe(`${CH}?view=player`);
  });

  it('keeps every other view, and every other route, on its path', () => {
    expect(chNavPath(CH, '?view=ask')).toBe(CH);
    expect(chNavPath(CH)).toBe(CH);
    expect(chNavPath('/golf/dashboard/stats/', '?view=read')).toBe('/golf/dashboard/stats');
  });

  it('pushes from the Board into a read and a player page', () => {
    expect(classifyNav({ from: CH, to: `${CH}?view=read&player=p1&insight=i`, tabRoots })).toBe('push');
    expect(classifyNav({ from: CH, to: `${CH}?view=player&player=p1`, tabRoots })).toBe('push');
  });

  it('pops on Back to the Board', () => {
    expect(classifyNav({ from: `${CH}?view=read`, to: CH, tabRoots, back: true })).toBe('pop');
  });

  it('still crossfades between the views that are not pages of their own', () => {
    expect(classifyNav({ from: CH, to: `${CH}?view=ask`, tabRoots })).toBe('fade');
  });
});
