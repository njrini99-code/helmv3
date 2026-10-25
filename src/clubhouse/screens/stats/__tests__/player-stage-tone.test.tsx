import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerStage, type StageRound } from '../PlayerStage';

/** A2: a round whose gap to the average prints as 0.0 is neither better nor worse; it is "at the average". */

afterEach(cleanup);

const round = (label: string, score: number): StageRound => ({ label, score, toPar: score - 72, holes: 18 });

describe('PlayerStage tone (A2)', () => {
  it('a round 0.04 off the average is at it, with no better or worse tone', () => {
    // Average 72.04: 72 is 0.04 under it (prints 0.0), 70 and 74.12 are clearly either side.
    render(<PlayerStage rounds={[round('Oct 1', 72), round('Oct 2', 70), round('Oct 3', 74.12)]} first="Theo" coach={false} teamAvg={null} meta="3 rounds" />);
    const cols = [...document.querySelectorAll('.ch-fm__c')];
    expect(cols[0]!.className).not.toMatch(/is-(up|down|gain|loss)/);
    expect(cols[0]!.getAttribute('aria-label')).toMatch(/at the average/);
    expect(cols[1]!.className).toMatch(/is-(up|gain)/);
    expect(cols[2]!.className).toMatch(/is-(down|loss)/);
  });
});
