import { describe, expect, it } from 'vitest';
import { BASEBALL_CAPABILITY_KEYS } from '@/lib/baseball/capabilities';

describe('can_manage_documents capability (#393)', () => {
  it('is part of the runtime capability key list', () => {
    expect(BASEBALL_CAPABILITY_KEYS).toContain('can_manage_documents');
  });
});
