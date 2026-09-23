import { describe, it, expect } from 'vitest';
import { compareEvidenceRevision } from './evidence-revision-status';

describe('compareEvidenceRevision', () => {
  it('returns "match" when stored and live are identical', () => {
    expect(compareEvidenceRevision('abc123', 'abc123')).toBe('match');
  });

  it('returns "changed" when stored and live differ', () => {
    expect(compareEvidenceRevision('abc123', 'def456')).toBe('changed');
  });

  it('returns "unknown" when stored is null (no revision was ever stamped)', () => {
    expect(compareEvidenceRevision(null, 'def456')).toBe('unknown');
  });

  it('returns "unknown" when stored is undefined', () => {
    expect(compareEvidenceRevision(undefined, 'def456')).toBe('unknown');
  });

  it('returns "unknown" when live is null (insight gone/malformed, can\'t verify)', () => {
    expect(compareEvidenceRevision('abc123', null)).toBe('unknown');
  });

  it('returns "unknown" when both are absent', () => {
    expect(compareEvidenceRevision(null, null)).toBe('unknown');
  });
});
