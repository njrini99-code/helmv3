import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** A2: an Ask strokes-gained leg that prints as 0.0 is neither a gain nor a loss, so it draws no stem and no tone. */

vi.mock('../../../../lib/rail-fold', () => ({ afterRailMove: (f: () => void) => f() }));

import type { AskEvidence } from '../../../../data/coachhelm-chat-thread';
import { AskEvidenceBlock } from '../Evidence';

afterEach(cleanup);

const legs = (rows: Array<[string, number, string]>) =>
  ({ kind: 'legs', title: 'Strokes gained', source: null, rows: rows.map(([label, value, display]) => ({ label, value, display })), takeaway: '', table: { columns: [], rows: [] } }) as unknown as AskEvidence;

describe('Ask strokes gained legs (A2)', () => {
  it('tone each leg on its printed value', () => {
    render(<AskEvidenceBlock block={legs([['putting', -0.04, '0.0'], ['approach', 0.3, '+0.3'], ['tee', -1.2, '−1.2']])} />);
    // On the hole the legs stand tee to green, whatever order the read gave them in.
    const parts = [...document.querySelectorAll('.ch-aks-hole__part')];
    expect(parts.map((g) => g.querySelector('.ch-aks-hole__name')?.textContent)).toEqual(['Off the tee', 'Approach', 'Putting']);
    expect(parts.map((g) => (g.classList.contains('is-gain') ? 'gain' : g.classList.contains('is-loss') ? 'loss' : null))).toEqual(['loss', 'gain', null]);
    expect(parts[2]!.querySelector('.ch-aks-hole__stem')).toBeNull();
    expect(parts[2]!.querySelector('.ch-aks-hole__value')?.textContent).toBe('0.0');
  });

  it('legs that are not the four parts of one game are ruled rows, toned the same way', () => {
    render(<AskEvidenceBlock block={legs([['total', -0.04, '0.0'], ['approach', 0.3, '+0.3'], ['putting', -1.2, '−1.2']])} />);
    expect(document.querySelector('.ch-aks-hole')).toBeNull();
    expect([...document.querySelectorAll('.ch-aks-sg__val')].map((el) => el.getAttribute('data-tone'))).toEqual([null, 'gain', 'loss']);
  });
});
