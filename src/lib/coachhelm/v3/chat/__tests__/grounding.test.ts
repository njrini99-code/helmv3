import { describe, expect, it } from 'vitest';

import { checkGrounding, groundingCheck } from '../grounding';
import type { ToolEnvelope } from '../provenance';

/**
 * The figures-against-reads check on the cases the reruns of 11 Nov 2026 flagged without cause, and the ones they were right to flag.
 * It only logs; these pin what "a number no read returned" means.
 */
const read = (model_text: string): ToolEnvelope => ({ summary: '', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '', model_text }) as ToolEnvelope;

describe('the figures check: what is and is not a figure from nowhere', () => {
  it('a number the coach typed is theirs to hear back, when the check is given the question', () => {
    const reads = [read('Cole Bennett: 5 finished rounds under the line, scores 68, 70, 71, 73, 74.')];
    const text = 'Cole Bennett has the most finished rounds under 75 since 1 September, with 5.';
    expect(groundingCheck({ text, reads, question: 'Which player has the most finished rounds under 75 since September 1, and how many?' })).toEqual({ grounded: true, unmatched: [] });
    // Without the question it is a figure from nowhere: the route passed none until 11 Nov 2026.
    expect(checkGrounding(text, reads).unmatched).toEqual(['75']);
  });

  it('how long a round or an event is, is a format and not a statistic', () => {
    for (const text of ['Either no rounds have been posted yet, or none are finished and 18 holes.', 'Those figures use 18-hole rounds, so a 9-hole practice round counts toward neither.', 'Qualifying is 54 holes over three days.']) {
      expect(checkGrounding(text, []), text).toEqual({ grounded: true, unmatched: [] });
    }
    // A number of holes that is not a round's length is still a figure.
    expect(checkGrounding('He made bogey or worse on 23 holes.', []).unmatched).toEqual(['23']);
  });

  it('a total, a difference of two counts or a spread the model worked out itself is still unmatched', () => {
    const rounds = [read('3 tournament rounds. 16 qualifier rounds. 4 practice rounds.')];
    expect(checkGrounding('The team has played 3 tournament, 16 qualifier and 4 practice rounds, which is 23 in all.', rounds).unmatched).toEqual(['23']);
    const two = [read('Cole Bennett: 22 rounds. Owen Carter: 2 rounds.')];
    expect(checkGrounding('Cole Bennett has played 20 more rounds than Owen Carter: 22 rounds to 2.', two).unmatched).toEqual(['20']);
    // The same figures said as the read gave them are matched.
    expect(checkGrounding('Cole Bennett has played 22 rounds to Owen Carter\'s 2.', two)).toEqual({ grounded: true, unmatched: [] });
    // When the read itself gives the total, saying it is matched.
    expect(checkGrounding('That is 23 finished rounds in all.', [read('23 finished rounds. By kind of round, of those 23: 4 practice, 16 qualifier, 3 tournament.')])).toEqual({ grounded: true, unmatched: [] });
  });
});
