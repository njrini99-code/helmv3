import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { editableFields } from '../editable';

/** A field's kind comes from the task's own schema, so the card's editor and the server's check cannot disagree. */
describe('what kind of field a card offers', () => {
  const schema = z.object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start: z.string().regex(/^\d{1,2}:\d{2}$/),
    strict_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    at: z.string().datetime(),
    title: z.string().max(120),
    body: z.string().max(2000),
    code: z.string().regex(/^[A-Z]{3}\d{3}$/),
  });
  const kinds = Object.fromEntries(editableFields(schema, ['day', 'start', 'strict_start', 'at', 'title', 'body', 'code'], {}).map((f) => [f.key, f.type]));

  it('reads a day, a time of day and an instant from their patterns', () => {
    expect(kinds).toMatchObject({ day: 'date', start: 'time', at: 'datetime' });
  });

  it('recognises a 24-hour time written as a stricter pattern', () => {
    expect(kinds.strict_start).toBe('time');
  });

  it('leaves any other text as text, long or short', () => {
    expect(kinds).toMatchObject({ title: 'text', body: 'long_text', code: 'text' });
  });
});
