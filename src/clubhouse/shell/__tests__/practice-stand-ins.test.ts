import { describe, expect, it } from 'vitest';
import { phonePushedTop, phoneRootName } from '../nav';

/**
 * What the shell's phone bar says for a Practice address before its page arrives (CH-1402). The bar must not say one
 * thing while the page loads and another once it lands.
 */
describe('Practice: the phone bar while a page loads', () => {
  it('a plan and its builder: no stand-in words, because the title is the plan’s own name and the address does not carry it', () => {
    for (const role of ['coach', 'player'] as const) {
      expect(phonePushedTop('/golf/dashboard/practice/plan/abc', role)).toEqual({ back: 'Practice', title: '' });
    }
    expect(phonePushedTop('/golf/dashboard/practice/plan/abc/edit', 'coach')).toEqual({ back: 'Practice', title: '', parent: '/golf/dashboard/practice' });
    expect(phonePushedTop('/golf/dashboard/practice/plan/abc/edit', 'player')).toBeNull();
  });

  it('Drills, Groups and Templates are named by their own names, as their pages’ bars name them', () => {
    expect(phoneRootName('/golf/dashboard/practice/drills')).toBe('Drills');
    expect(phoneRootName('/golf/dashboard/practice/groups')).toBe('Groups');
    expect(phoneRootName('/golf/dashboard/practice/templates/')).toBe('Templates');
  });

  it('every other address keeps its section’s name', () => {
    for (const path of ['/golf/dashboard/practice', '/golf/dashboard/practice/drills/abc', '/golf/dashboard/practice/plan/abc', '/golf/dashboard/roster', '/golf/dashboard']) {
      expect(phoneRootName(path)).toBeNull();
    }
  });
});
