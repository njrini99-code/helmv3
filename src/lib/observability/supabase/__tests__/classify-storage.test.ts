import { describe, it, expect } from 'vitest';
import { classifyStorageError, type ClassifyStorageContext } from '../classify-storage';

const baseCtx: ClassifyStorageContext = {
  operation: 'download',
  feature: 'player_profile',
  action: 'load_avatar',
  bucketClass: 'player_avatar',
};

describe('classifyStorageError — missing object is context-sensitive (brief §11)', () => {
  it('NoSuchKey is unexpected/error by default (a required document missing)', () => {
    const result = classifyStorageError({ code: 'NoSuchKey', statusCode: '404' }, baseCtx);
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('error');
  });

  it('NoSuchKey is expected/info when the caller declares the object might not exist', () => {
    const result = classifyStorageError({ code: 'NoSuchKey', statusCode: '404' }, { ...baseCtx, expectedMissingObject: true });
    expect(result.expectedness).toBe('expected');
    expect(result.severity).toBe('info');
  });

  it('the SAME code differs by context, same asymmetry as classify.ts', () => {
    const unexpected = classifyStorageError({ code: 'NoSuchBucket' }, baseCtx);
    const expected = classifyStorageError({ code: 'NoSuchBucket' }, { ...baseCtx, expectedMissingObject: true });
    expect(unexpected.expectedness).not.toBe(expected.expectedness);
  });
});

describe('classifyStorageError — always-unexpected codes', () => {
  it('DatabaseTimeout is always critical — infrastructure incident regardless of context', () => {
    const result = classifyStorageError({ code: 'DatabaseTimeout' }, { ...baseCtx, expectedMissingObject: true });
    expect(result.severity).toBe('critical');
    expect(result.family).toBe('infrastructure');
  });

  it('AccessDenied on the user\'s own path is always unexpected — no escape hatch', () => {
    const result = classifyStorageError({ code: 'AccessDenied' }, baseCtx);
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('error');
  });
});

describe('classifyStorageError — idempotent upsert conflict', () => {
  it('ResourceAlreadyExists is unexpected by default', () => {
    const result = classifyStorageError({ code: 'ResourceAlreadyExists' }, baseCtx);
    expect(result.expectedness).toBe('unexpected');
  });

  it('ResourceAlreadyExists is routine_recovery when declared idempotent', () => {
    const result = classifyStorageError({ code: 'ResourceAlreadyExists' }, { ...baseCtx, expectedAlreadyExists: true });
    expect(result.expectedness).toBe('routine_recovery');
  });
});

describe('classifyStorageError — fallbacks and safety', () => {
  it('falls back to statusCode (string) when code is absent', () => {
    const result = classifyStorageError({ statusCode: '500' }, baseCtx);
    expect(result.family).toBe('infrastructure');
    expect(result.httpStatus).toBe(500);
  });

  it('never persists a raw code/status as anything but the closed fields', () => {
    const result = classifyStorageError({ code: 'EntityTooLarge' }, baseCtx);
    expect(result.storageCode).toBe('EntityTooLarge');
    expect(result.family).toBe('capacity');
  });

  it('never throws on a malformed input', () => {
    expect(() => classifyStorageError(null as never, baseCtx)).not.toThrow();
    expect(classifyStorageError(null as never, baseCtx).code).toBe('classifier_failure');
  });
});
