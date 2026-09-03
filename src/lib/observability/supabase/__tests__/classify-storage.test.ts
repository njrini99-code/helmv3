import { describe, it, expect } from 'vitest';
import { classifyStorageError, type ClassifyStorageContext } from '../classify-storage';

const baseCtx: ClassifyStorageContext = {
  feature: 'documents',
  action: 'delete_document',
};

describe('classifyStorageError — missing object (context-sensitive)', () => {
  it('NoSuchKey defaults to unexpected/warning when the caller states nothing', () => {
    const result = classifyStorageError({ code: 'NoSuchKey', message: 'The specified key does not exist.' }, baseCtx);
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('warning');
  });

  it('NoSuchKey/NoSuchBucket become expected/info when the caller declares expectedMissingObject (avatar probe)', () => {
    for (const code of ['NoSuchKey', 'NoSuchBucket']) {
      const result = classifyStorageError({ code }, { ...baseCtx, expectedMissingObject: true });
      expect(result.expectedness, code).toBe('expected');
      expect(result.severity, code).toBe('info');
    }
  });
});

describe('classifyStorageError — ResourceAlreadyExists (context-sensitive)', () => {
  it('defaults to unexpected/warning (possible race)', () => {
    const result = classifyStorageError({ code: 'ResourceAlreadyExists' }, baseCtx);
    expect(result.expectedness).toBe('unexpected');
  });

  it('becomes routine_recovery when the caller declares an idempotent upsert', () => {
    const result = classifyStorageError({ code: 'ResourceAlreadyExists' }, { ...baseCtx, idempotentUpsert: true });
    expect(result.expectedness).toBe('routine_recovery');
  });

  it('KeyAlreadyExists and BucketAlreadyExists follow the same rule', () => {
    for (const code of ['KeyAlreadyExists', 'BucketAlreadyExists']) {
      const result = classifyStorageError({ code }, { ...baseCtx, idempotentUpsert: true });
      expect(result.expectedness, code).toBe('routine_recovery');
    }
  });
});

describe('classifyStorageError — DatabaseTimeout is always critical', () => {
  it('is critical regardless of any context flag', () => {
    const withoutCtx = classifyStorageError({ code: 'DatabaseTimeout' }, baseCtx);
    expect(withoutCtx.severity).toBe('critical');
    const withEverything = classifyStorageError(
      { code: 'DatabaseTimeout' },
      { ...baseCtx, expectedMissingObject: true, idempotentUpsert: true, accessDeniedOnOwnPath: true },
    );
    expect(withEverything.severity).toBe('critical');
  });
});

describe('classifyStorageError — AccessDenied default is INVERTED from classify.ts 42501', () => {
  it('defaults to expected/info (routine RLS boundary on someone else’s object)', () => {
    const result = classifyStorageError({ code: 'AccessDenied' }, baseCtx);
    expect(result.expectedness).toBe('expected');
    expect(result.severity).toBe('info');
  });

  it('becomes error/unexpected when the caller declares accessDeniedOnOwnPath', () => {
    const result = classifyStorageError({ code: 'AccessDenied' }, { ...baseCtx, accessDeniedOnOwnPath: true });
    expect(result.expectedness).toBe('unexpected');
    expect(result.severity).toBe('error');
  });
});

describe('classifyStorageError — other documented codes', () => {
  it('EntityTooLarge and InvalidMimeType are expected/info (routine validation)', () => {
    for (const code of ['EntityTooLarge', 'InvalidMimeType']) {
      const result = classifyStorageError({ code }, baseCtx);
      expect(result.expectedness, code).toBe('expected');
    }
  });

  it('InvalidJWT is error/unexpected', () => {
    const result = classifyStorageError({ code: 'InvalidJWT' }, baseCtx);
    expect(result.severity).toBe('error');
    expect(result.expectedness).toBe('unexpected');
  });

  it('SignatureDoesNotMatch and InvalidUploadSignature are error/unexpected', () => {
    for (const code of ['SignatureDoesNotMatch', 'InvalidUploadSignature']) {
      const result = classifyStorageError({ code }, baseCtx);
      expect(result.severity, code).toBe('error');
    }
  });

  it('InternalError and S3Error are critical/unexpected (infra faults)', () => {
    for (const code of ['InternalError', 'S3Error']) {
      const result = classifyStorageError({ code }, baseCtx);
      expect(result.severity, code).toBe('critical');
    }
  });

  it('ResourceLocked and LockTimeout are warning/retryable', () => {
    for (const code of ['ResourceLocked', 'LockTimeout']) {
      const result = classifyStorageError({ code }, baseCtx);
      expect(result.severity, code).toBe('warning');
      expect(result.retryability, code).toBe('conditional');
    }
  });

  it('SlowDown is warning/retryable:yes', () => {
    const result = classifyStorageError({ code: 'SlowDown' }, baseCtx);
    expect(result.retryability).toBe('yes');
  });

  it('a malformed-request code (InvalidBucketName) is warning/unexpected', () => {
    const result = classifyStorageError({ code: 'InvalidBucketName' }, baseCtx);
    expect(result.severity).toBe('warning');
    expect(result.expectedness).toBe('unexpected');
  });

  it('TusError (not in the current docs table) lands in the unknown-expectedness bucket, not dropped', () => {
    const result = classifyStorageError({ code: 'TusError' }, baseCtx);
    expect(result.expectedness).toBe('unknown');
  });
});

describe('classifyStorageError — code-first, status/message as fallback only', () => {
  it('a code wins even when status would classify differently', () => {
    const result = classifyStorageError({ code: 'ResourceAlreadyExists', status: 500 }, { ...baseCtx, idempotentUpsert: true });
    expect(result.expectedness).toBe('routine_recovery');
  });

  it('falls back to status only when code is absent', () => {
    const result = classifyStorageError({ code: null, status: 404 }, baseCtx);
    expect(result.httpStatus).toBe(404);
    expect(result.storageCode).toBeNull();
    expect(result.expectedness).toBe('unexpected');
  });

  it('falls back to message matching only when code and status are both absent', () => {
    const result = classifyStorageError({ code: null, status: null, message: 'The specified key does not exist.' }, baseCtx);
    expect(result.code).toBe('unknown_missing_object');
  });

  it('never throws on a malformed error object', () => {
    expect(() => classifyStorageError({} as never, baseCtx)).not.toThrow();
  });
});
