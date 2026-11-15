import { describe, expect, it } from 'vitest';

import { codeOutputsOf, defaultGroundingCheck } from '../grounding';

const result = (type: string, stdout: unknown) => ({ type, tool_use_id: 'srvtoolu_1', content: { type: 'code_execution_result', stdout, stderr: '', return_code: 0, content: [] } });

describe('what the model’s code printed, for the figures check', () => {
  it('is read from the conversation’s own assistant messages, one read per run that printed something', () => {
    const messages = [
      { role: 'user', content: 'How many rounds had a back nine three worse than the front?' },
      { role: 'assistant', content: [{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'code_execution', input: { code: 'print(6, 20, 34)' } }, result('code_execution_tool_result', '6 of 20, 34 completed\n'), { type: 'text', text: 'Six rounds.' }] },
      { role: 'assistant', content: [result('bash_code_execution_tool_result', 'mean 74.25')] },
      // Not a run's output: a user turn, a run that printed nothing, a result with no text, a plain string.
      { role: 'user', content: [result('code_execution_tool_result', '999')] },
      { role: 'assistant', content: [result('code_execution_tool_result', '   '), result('code_execution_tool_result', null), { type: 'text', text: '555' }] },
      { role: 'assistant', content: 'A stored plain answer with 777 in it.' },
    ];
    const reads = codeOutputsOf(messages);
    expect(reads.map((r) => (r as { model_text?: string }).model_text)).toEqual(['6 of 20, 34 completed\n', 'mean 74.25']);
    expect(reads.every((r) => r.measurements.length === 0 && r.summary === '')).toBe(true);
  });

  it('a figure the code printed is held by the conversation; one the model then derives in its head is not', () => {
    const reads = codeOutputsOf([{ role: 'assistant', content: [result('code_execution_tool_result', '20 of the 34 rounds have nines')] }]);
    expect(defaultGroundingCheck({ text: 'Only 20 of the 34 completed rounds have a front and a back nine.', reads, question: '' })).toEqual({ grounded: true, unmatched: [] });
    expect(defaultGroundingCheck({ text: 'Only 20 of the 34 have nines, so 14 could not be checked.', reads, question: '' })).toEqual({ grounded: false, unmatched: ['14'] });
    expect(codeOutputsOf([])).toEqual([]);
  });

  it('a very long output is cut, never dropped', () => {
    const [read] = codeOutputsOf([{ role: 'assistant', content: [result('code_execution_tool_result', `74.2 ${'x'.repeat(30_000)}`)] }]);
    expect((read as { model_text?: string }).model_text).toHaveLength(20_000);
  });
});
