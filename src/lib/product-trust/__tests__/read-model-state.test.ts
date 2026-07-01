// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  resolveReadModelLoadState,
  readModelStateLabel,
} from '@/lib/product-trust/read-model-state';

describe('resolveReadModelLoadState', () => {
  it('distinguishes empty success from unauthorized', () => {
    expect(
      resolveReadModelLoadState({ authorized: true, error: null, hasData: false }),
    ).toBe('empty');
    expect(
      resolveReadModelLoadState({ authorized: false, error: null, hasData: false }),
    ).toBe('unauthorized');
  });

  it('distinguishes load failure from empty success', () => {
    expect(
      resolveReadModelLoadState({
        authorized: true,
        error: 'Could not load roster',
        hasData: false,
      }),
    ).toBe('error');
    expect(
      resolveReadModelLoadState({ authorized: true, error: null, hasData: false }),
    ).toBe('empty');
  });

  it('marks partial loads when some feeds succeed', () => {
    expect(
      resolveReadModelLoadState({
        authorized: true,
        error: 'Some risk signals could not be loaded.',
        hasData: true,
        partial: true,
      }),
    ).toBe('partial');
  });

  it('marks ready when authorized data loaded cleanly', () => {
    expect(
      resolveReadModelLoadState({ authorized: true, error: null, hasData: true }),
    ).toBe('ready');
  });
});

describe('readModelStateLabel', () => {
  it('uses different copy for empty vs error vs unauthorized', () => {
    const empty = readModelStateLabel('empty');
    const error = readModelStateLabel('error');
    const unauthorized = readModelStateLabel('unauthorized');
    expect(empty).not.toEqual(error);
    expect(empty).not.toEqual(unauthorized);
    expect(error).not.toEqual(unauthorized);
  });
});
