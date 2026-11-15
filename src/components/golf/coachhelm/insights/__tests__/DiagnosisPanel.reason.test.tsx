import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Diagnosis } from '@/lib/coachhelm/v2/insights/types';
import { DiagnosisPanel } from '../DiagnosisPanel';

/** READ-S1: this tooltip printed a stored row's confidence reason, the engine's bookkeeping included. */
const diagnosis = (confidence_reason: string): Diagnosis => ({ symptom: 'Symptom', root_cause: 'Cause', causality_level: 'observed_sequence', drivers: [], recommended_action: 'Action', confidence_reason });

afterEach(cleanup);

describe('the confidence word’s tooltip', () => {
  it('never carries a stored row’s bookkeeping', () => {
    render(<DiagnosisPanel diagnosis={diagnosis('27 observations; recency/variance not measured (sample-adequacy only); sample 90% of target')} category="approach" confidence={0.9} />);
    expect(screen.getByText('Solid read').getAttribute('title')).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/recency|variance|sample-adequacy/);
  });

  it('keeps a reason a person can use', () => {
    render(<DiagnosisPanel diagnosis={diagnosis('27 approaches. Enough for a solid read.')} category="approach" confidence={0.9} />);
    expect(screen.getByText('Solid read').getAttribute('title')).toBe('27 approaches. Enough for a solid read.');
  });
});
