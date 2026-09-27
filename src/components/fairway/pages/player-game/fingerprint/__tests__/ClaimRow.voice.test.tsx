/**
 * FP-03: the player's own Fingerprint never prints coach-voiced engine copy
 * ("have the player …"); the coach view keeps the stored text.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClaimRow } from '../ClaimRow';
import type { ClaimView } from '../fingerprint-model';

const claim: ClaimView = {
  id: 'i-1',
  title: 'Approaches finish short from 150–175',
  body: 'Recommended: have the player call the carry number that covers the flag, then review the next ten approaches from here together.',
  value: '62%',
  comparison: null,
  tone: 'bad',
  window: 'last 90 days',
  sample: '21 samples',
  confidence: 'Fair read',
  impact: null,
  tags: [],
  movement: null,
  acknowledged: false,
  drills: [],
};

function renderRow(mode: 'coach' | 'player') {
  return render(
    <ul>
      <ClaimRow claim={claim} mode={mode} readOnly />
    </ul>,
  );
}

describe('ClaimRow voice (FP-03)', () => {
  it('player mode reads the recommendation in the second person', () => {
    const { container } = renderRow('player');
    expect(container.textContent).not.toMatch(/the player/i);
    expect(container.textContent).toContain('Recommended: Call the carry number');
    expect(container.textContent).toContain('with your coach.');
  });

  it('coach mode keeps the stored text', () => {
    const { container } = renderRow('coach');
    expect(container.textContent).toContain('have the player call the carry number');
  });
});
