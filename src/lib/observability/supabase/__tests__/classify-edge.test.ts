import { describe, it, expect } from 'vitest';
import { classifyEdgeFunctionError, type ClassifyEdgeContext } from '../classify-edge';

const baseCtx: ClassifyEdgeContext = {
  feature: 'push_notifications',
  action: 'send_push',
  functionName: 'send-apns-push',
};

describe('classifyEdgeFunctionError', () => {
  it('FunctionsHttpError with a 5xx status is critical/unexpected', () => {
    const result = classifyEdgeFunctionError(
      { name: 'FunctionsHttpError', message: 'non-2xx status code', context: { status: 500 } },
      baseCtx,
    );
    expect(result.code).toBe('http_error');
    expect(result.httpStatus).toBe(500);
    expect(result.severity).toBe('critical');
  });

  it('FunctionsHttpError with a 4xx status is warning/unexpected, not critical', () => {
    const result = classifyEdgeFunctionError(
      { name: 'FunctionsHttpError', message: 'non-2xx status code', context: { status: 400 } },
      baseCtx,
    );
    expect(result.httpStatus).toBe(400);
    expect(result.severity).toBe('warning');
  });

  it('FunctionsHttpError with an unreadable context (not a Response-like object) still classifies, httpStatus null', () => {
    const result = classifyEdgeFunctionError({ name: 'FunctionsHttpError', context: null }, baseCtx);
    expect(result.httpStatus).toBeNull();
    expect(result.severity).toBe('warning');
  });

  it('FunctionsRelayError is error/unexpected/retryable-conditional', () => {
    const result = classifyEdgeFunctionError({ name: 'FunctionsRelayError', message: 'relay error' }, baseCtx);
    expect(result.code).toBe('relay_error');
    expect(result.severity).toBe('error');
    expect(result.retryability).toBe('conditional');
  });

  it('FunctionsFetchError is error/unexpected/retryable-conditional', () => {
    const result = classifyEdgeFunctionError({ name: 'FunctionsFetchError', message: 'fetch failed' }, baseCtx);
    expect(result.code).toBe('fetch_error');
    expect(result.severity).toBe('error');
  });

  it('an unrecognized error name lands in the unknown-expectedness bucket, not dropped', () => {
    const result = classifyEdgeFunctionError({ name: 'SomeOtherError', message: 'weird' }, baseCtx);
    expect(result.expectedness).toBe('unknown');
  });

  it('never throws on a malformed error object', () => {
    expect(() => classifyEdgeFunctionError({} as never, baseCtx)).not.toThrow();
    expect(() => classifyEdgeFunctionError({ name: undefined, context: undefined }, baseCtx)).not.toThrow();
  });
});
