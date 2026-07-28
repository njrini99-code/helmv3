import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateObject, insert } = vi.hoisted(() => ({
  generateObject: vi.fn(),
  insert: vi.fn(async () => ({ error: null })),
}));

vi.mock('ai', () => ({ generateObject }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert })),
  })),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/admin/provider-fault', () => ({ classifyProviderFault: vi.fn(() => null) }));

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
