import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RoundReviewSkeleton } from '../RoundsSkeleton';

/** F-0060 (audit 2026-10-29): the phone review skeleton's hero is the loaded hero's green, so it never flashes pale to green. */
describe('Round review skeleton hero (F-0060)', () => {
  it('the first phone block is a feature-toned skeleton', () => {
    render(<RoundReviewSkeleton />);
    const first = document.querySelector('.ch-rv-sk-phone > .ch-skel');
    expect(first?.classList.contains('ch-skel--feature')).toBe(true);
  });

  it('the feature skeleton is drawn on the feature ground', () => {
    const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');
    expect(shell).toMatch(/\.ch-skel\.ch-skel--feature \{[^}]*background: var\(--ch-feature-bg\);/);
  });
});
