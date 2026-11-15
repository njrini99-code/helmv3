// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import { Pipeline } from '../Pipeline';
import { accessibleName, expectLabelInName } from '../../../__tests__/label-in-name';

afterEach(cleanup);

/**
 * F-0011 (WCAG 2.5.3, axe label-content-name-mismatch): a stage showed its count coin and its name ("1", "Watched") and
 * was named "Watched, 1 prospect" by an aria-label, so the words a voice-control user saw were not its name.
 */
describe('Recruiting pipeline · a stage is named by the word it shows', () => {
  const counts = { watched: 1, recruiting: 3, offered: 0, committed: 2 };
  it.each([false, true])('compact %s: the stage name first, then how many', (compact) => {
    render(<Pipeline counts={counts} total={6} stage={null} onPick={() => {}} compact={compact} />);
    const stages = screen.getAllByRole('button', { pressed: false });
    expect(stages).toHaveLength(4);
    for (const b of stages) {
      expect(b).not.toHaveAttribute('aria-label');
      expectLabelInName(b, b.querySelector('b')!.textContent!);
    }
    const watched = stages.find((b) => b.querySelector('b')!.textContent === 'Watched')!;
    expect(accessibleName(watched)).toMatch(/^Watched, 1 prospect\b/);
    const recruiting = stages.find((b) => b.querySelector('b')!.textContent === 'Recruiting')!;
    expect(accessibleName(recruiting)).toMatch(/^Recruiting, 3 prospects\b/);
  });
});
