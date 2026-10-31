import { describe, it, expect } from 'vitest';
import { auditNumericClaims, collectEnvelopeNumbers } from '../provenance';
import type { ToolEnvelope } from '../provenance';

// Owner, 2026-10-31: "create a travel plan for me" was withheld with
// unsupported ["60"]. get_upcoming_events read 60 days ahead and found nothing;
// its summary said "Nothing scheduled in the next 60 days." and the model said
// the same, but only `detail` ({ events: [] }) fed the audit.
const empty: ToolEnvelope = {
  summary: 'Nothing scheduled in the next 60 days.',
  measurements: [],
  series: [],
  detail: { events: [] },
  coverage: 'empty',
  coverage_note: null,
  as_of: '2026-10-31T02:42:00.000Z',
};

const audit = (text: string, envelope: ToolEnvelope) => auditNumericClaims(text, [], [], collectEnvelopeNumbers(envelope));

describe('numbers a tool states in its own summary are supported', () => {
  it('the read window in an empty schedule summary', () => {
    expect(audit('I checked your calendar and nothing is scheduled for the next 60 days.', empty)).toEqual([]);
  });

  it('counts in a summary', () => {
    const tasks: ToolEnvelope = { ...empty, summary: '14 open tasks, 13 overdue.', detail: { tasks: [] } };
    expect(audit('You have 14 open tasks and 13 are overdue.', tasks)).toEqual([]);
  });

  it('a number in neither the summary nor the detail is still flagged', () => {
    expect(audit('Nothing is scheduled for the next 90 days.', empty).map((c) => c.text)).toEqual(['90']);
  });
});
