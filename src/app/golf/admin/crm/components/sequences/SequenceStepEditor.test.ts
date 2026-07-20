import { describe, expect, it } from 'vitest';
import { resolveStepPreview } from './SequenceStepEditor';
import type { CrmEmailTemplate } from '@/app/golf/actions/crm-templates';

// resolveStepPreview mirrors scripts/process-sequence-batch.mjs's real send
// resolution exactly: `step.subject_override || tpl?.subject || ''` (and
// same for body), `tpl?.format || 'text'`. These tests pin that parity so a
// future edit to either side can't silently drift the preview from what
// actually sends.

function template(overrides: Partial<CrmEmailTemplate> = {}): CrmEmailTemplate {
  return {
    id: 'tpl-1',
    name: 'Founding 10 — First Touch',
    subject: 'Template subject',
    body: 'Template body',
    category: 'cold_outreach',
    format: 'html',
    merge_tags: null,
    is_default: false,
    usage_count: 0,
    last_used_at: null,
    ...overrides,
  };
}

describe('resolveStepPreview', () => {
  it('uses the template subject/body/format when no overrides are set', () => {
    expect(
      resolveStepPreview({ subjectOverride: '', bodyOverride: '' }, template()),
    ).toEqual({ subject: 'Template subject', body: 'Template body', format: 'html' });
  });

  it('trimmed override subject/body win over the template', () => {
    expect(
      resolveStepPreview(
        { subjectOverride: '  Override subject  ', bodyOverride: '  Override body  ' },
        template(),
      ),
    ).toEqual({ subject: 'Override subject', body: 'Override body', format: 'html' });
  });

  it('a whitespace-only override falls back to the template (matches .trim() || save gate)', () => {
    expect(
      resolveStepPreview({ subjectOverride: '   ', bodyOverride: '   ' }, template()),
    ).toEqual({ subject: 'Template subject', body: 'Template body', format: 'html' });
  });

  it('keeps the template format even when only the body is overridden', () => {
    expect(
      resolveStepPreview(
        { subjectOverride: '', bodyOverride: 'Override body' },
        template({ format: 'plain' }),
      ),
    ).toEqual({ subject: 'Template subject', body: 'Override body', format: 'plain' });
  });

  it('with no template selected, uses only the overrides and defaults format to text', () => {
    expect(
      resolveStepPreview(
        { subjectOverride: 'Only subject', bodyOverride: 'Only body' },
        null,
      ),
    ).toEqual({ subject: 'Only subject', body: 'Only body', format: 'text' });
  });

  it('with no template and no overrides, resolves to empty subject/body and text format', () => {
    expect(
      resolveStepPreview({ subjectOverride: '', bodyOverride: '' }, null),
    ).toEqual({ subject: '', body: '', format: 'text' });
  });
});
