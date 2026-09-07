import { describe, expect, it } from 'vitest';
import { classifySeedAge, classifyMajorVersionMatch } from '../checks/db-local.mjs';

describe('classifySeedAge', () => {
  it('PASSes at exactly the 30-day boundary', () => {
    expect(classifySeedAge(30).status).toBe('PASS');
  });

  it('WARNs just past the 30-day boundary', () => {
    expect(classifySeedAge(30.5).status).toBe('WARN');
  });

  it('PASSes for a fresh seed', () => {
    expect(classifySeedAge(1).status).toBe('PASS');
  });

  it('rounds the reported day count', () => {
    expect(classifySeedAge(45.6).days).toBe(46);
  });
});

describe('classifyMajorVersionMatch', () => {
  it('LOCAL_ONLY when the stack is not running', () => {
    expect(classifyMajorVersionMatch(17, null).status).toBe('LOCAL_ONLY');
  });

  it('BLOCKED when config.toml could not be read', () => {
    expect(classifyMajorVersionMatch(null, 17).status).toBe('BLOCKED');
  });

  it('PASS when both match', () => {
    expect(classifyMajorVersionMatch(17, 17).status).toBe('PASS');
  });

  it('DRIFT when they disagree', () => {
    expect(classifyMajorVersionMatch(17, 15).status).toBe('DRIFT');
  });
});
