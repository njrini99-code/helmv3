import { describe, it, expect } from 'vitest';
import { isUuid } from '@/lib/utils/uuid';

describe('isUuid', () => {
  it('accepts canonical UUIDs in either case', () => {
    expect(isUuid('fe4d305f-6313-40fb-b525-3b0622108ade')).toBe(true);
    expect(isUuid('FE4D305F-6313-40FB-B525-3B0622108ADE')).toBe(true);
    expect(isUuid('0b000000-0000-4000-b000-000000000004')).toBe(true);
  });

  it('rejects what a hand-typed URL can carry', () => {
    expect(isUuid('not-a-real-uuid-12345')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('fe4d305f-6313-40fb-b525-3b0622108ade ')).toBe(false);
    expect(isUuid("fe4d305f-6313-40fb-b525-3b0622108ade' OR 1=1")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
