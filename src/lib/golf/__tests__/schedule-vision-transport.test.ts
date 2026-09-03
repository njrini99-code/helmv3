import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateObject, insert, recordAi } = vi.hoisted(() => ({
  generateObject: vi.fn(),
  insert: vi.fn(async () => ({ error: null })),
  recordAi: vi.fn(),
}));

vi.mock('ai', () => ({ generateObject }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert })),
  })),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/admin/provider-fault', () => ({ classifyProviderFault: vi.fn(() => null) }));
vi.mock('@/lib/observability/metrics', () => ({ recordAi }));

import { extractScheduleFromImage } from '@/lib/golf/schedule-vision';

describe('schedule vision AI SDK transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateObject.mockResolvedValue({
      object: {
        is_class_schedule: false,
        document_kind: 'not a schedule',
        term: '',
        classes: [],
        warnings: [],
        image_quality: 'good',
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it('sends images as canonical AI SDK v7 file parts', async () => {
    await extractScheduleFromImage([
      { base64: 'base64-image-data', mediaType: 'image/png' },
    ]);

    const request = generateObject.mock.calls[0]?.[0];
    const content = request.messages[0].content;

    expect(content[0]).toEqual({
      type: 'file',
      data: 'base64-image-data',
      mediaType: 'image/png',
    });
    expect(content[0]).not.toHaveProperty('image');
    expect(content[1]).toMatchObject({ type: 'text' });
  });
});

/**
 * Sentry AI observability opt-in. Phase A finding
 * (docs/observability/SENTRY_PHASE_A_FINDINGS.md §(a)): this is the
 * STRONGEST PII vector in the app — raw image bytes of a student's class
 * schedule, which can show their full name, university, course numbers/
 * times, and section/CRN data. recordInputs/recordOutputs must be false at
 * BOTH generateObject call sites (the primary extraction AND the day-only
 * verification pass), never left to the global integration default.
 */
describe('schedule vision — Sentry AI observability opt-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the primary extraction call opts in with recordInputs/recordOutputs explicitly false', async () => {
    generateObject.mockResolvedValueOnce({
      object: { is_class_schedule: false, document_kind: 'x', term: '', classes: [], warnings: [], image_quality: 'good' },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await extractScheduleFromImage([{ base64: 'img', mediaType: 'image/png' }]);

    const request = generateObject.mock.calls[0]?.[0];
    expect(request.experimental_telemetry).toEqual({
      isEnabled: true,
      functionId: 'golf.scheduleVision.extract',
      recordInputs: false,
      recordOutputs: false,
    });
  });

  it('records helm.ai.* success for the primary extraction', async () => {
    generateObject.mockResolvedValueOnce({
      object: { is_class_schedule: false, document_kind: 'x', term: '', classes: [], warnings: [], image_quality: 'good' },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await extractScheduleFromImage([{ base64: 'img', mediaType: 'image/png' }]);

    expect(recordAi).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'golf_schedule_vision',
        action: 'golf.scheduleVision.extract',
        outcome: 'success',
        inputTokens: 10,
        outputTokens: 5,
      }),
    );
  });

  it('the day-verification pass ALSO opts in with recordInputs/recordOutputs false, and records its own helm.ai.* success', async () => {
    generateObject
      .mockResolvedValueOnce({
        object: {
          is_class_schedule: true,
          document_kind: 'Banner list view',
          term: 'Fall 2026',
          classes: [
            {
              course_code: 'BIO 101', course_name: 'Intro Biology', section_kind: 'lecture',
              days: ['MON', 'WED'], start_time: '09:00', end_time: '09:50',
              location: 'Sci Hall 214', instructor: 'Staff', confidence: 0.9, note: '',
            },
          ],
          warnings: [],
          image_quality: 'good',
        },
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        object: { classes: [{ course_name: 'Intro Biology', days: ['MON', 'WED'] }] },
        usage: { inputTokens: 4, outputTokens: 2 },
      });

    await extractScheduleFromImage([{ base64: 'img', mediaType: 'image/png' }]);

    expect(generateObject).toHaveBeenCalledTimes(2);
    const verifyRequest = generateObject.mock.calls[1]?.[0];
    expect(verifyRequest.experimental_telemetry).toEqual({
      isEnabled: true,
      functionId: 'golf.scheduleVision.verify',
      recordInputs: false,
      recordOutputs: false,
    });
    expect(recordAi).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'golf.scheduleVision.verify', outcome: 'success' }),
    );
  });

  it('records helm.ai.* failure when the extraction call throws (non-retryable)', async () => {
    generateObject.mockRejectedValueOnce(new Error('schema validation failed'));

    await expect(
      extractScheduleFromImage([{ base64: 'img', mediaType: 'image/png' }]),
    ).rejects.toThrow('schema validation failed');

    expect(recordAi).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'golf_schedule_vision',
        action: 'golf.scheduleVision.extract',
        outcome: 'failure',
      }),
    );
  });
});
