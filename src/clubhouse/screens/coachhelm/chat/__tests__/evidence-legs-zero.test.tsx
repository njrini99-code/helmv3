import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** A2: an Ask strokes-gained leg that prints as 0.0 is neither a gain nor a loss, so it draws no bar and no tone. */

vi.mock('../../../../lib/rail-fold', () => ({ afterRailMove: (f: () => void) => f() }));

import type { AskEvidence } from '../../../../data/coachhelm-chat-thread';
import { AskEvidenceBlock } from '../Evidence';

afterEach(cleanup);

const legs = (rows: Array<[string, number, string]>) =>
  ({ kind: 'legs', title: 'Strokes gained', source: null, rows: rows.map(([label, value, display]) => ({ label, value, display })), takeaway: '', table: { columns: [], rows: [] } }) as unknown as AskEvidence;

describe('Ask strokes gained legs (A2)', () => {
  it('tone each leg on its printed value', () => {
    render(<AskEvidenceBlock block={legs([['putting', -0.04, '0.0'], ['approach', 0.3, '+0.3'], ['tee', -1.2, '−1.2']])} />);
    const signs = [...document.querySelectorAll('.ch-th-leg')].map((el) => el.getAttribute('data-sign'));
    expect(signs).toEqual([null, 'gain', 'loss']);
    expect(document.querySelectorAll('.ch-th-leg')[0]!.querySelector('.ch-th-leg__track > span')).toBeNull();
  });
});
