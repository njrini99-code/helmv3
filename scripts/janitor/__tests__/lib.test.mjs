import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertClassifierResult, FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';
import { findingScore, rankFindings } from '../lib/rank.mjs';

test('assertClassifierResult: accepts a well-formed ZERO_FINDINGS_VERIFIED result', () => {
  const result = { classId: 'x', title: 'X', verdict: ZERO_FINDINGS_VERIFIED, evidenceCommand: 'echo hi' };
  assert.equal(assertClassifierResult(result, 'x'), result);
});

test('assertClassifierResult: accepts a well-formed NO_SIGNAL result', () => {
  const result = { classId: 'x', title: 'X', verdict: NO_SIGNAL, evidenceCommand: 'echo hi', note: 'why' };
  assert.equal(assertClassifierResult(result, 'x'), result);
});

test('assertClassifierResult: rejects FINDINGS with an empty findings array', () => {
  const result = { classId: 'x', verdict: FINDINGS, evidenceCommand: 'echo hi', findings: [] };
  assert.throws(() => assertClassifierResult(result, 'x'), /no findings array/);
});

test('assertClassifierResult: rejects a non-FINDINGS verdict that smuggles findings', () => {
  const result = { classId: 'x', verdict: ZERO_FINDINGS_VERIFIED, evidenceCommand: 'echo hi', findings: [{ id: '1' }] };
  assert.throws(() => assertClassifierResult(result, 'x'), /returned findings but verdict/);
});

test('assertClassifierResult: rejects an invalid verdict string', () => {
  const result = { classId: 'x', verdict: 'MAYBE', evidenceCommand: 'echo hi' };
  assert.throws(() => assertClassifierResult(result, 'x'), /invalid verdict/);
});

test('assertClassifierResult: rejects a missing evidenceCommand', () => {
  const result = { classId: 'x', verdict: ZERO_FINDINGS_VERIFIED };
  assert.throws(() => assertClassifierResult(result, 'x'), /did not name a command/);
});

test('assertClassifierResult: rejects a non-object result', () => {
  assert.throws(() => assertClassifierResult(null, 'x'), /non-object/);
  assert.throws(() => assertClassifierResult(undefined, 'x'), /non-object/);
});

test('findingScore: high confidence + small change scores highest', () => {
  const high = findingScore({ confidence: 'high', sizeOfChange: 'small' });
  const low = findingScore({ confidence: 'low', sizeOfChange: 'large' });
  assert.ok(high > low);
  assert.equal(high, 3 * 10 - 1); // 29
  assert.equal(low, 1 * 10 - 3); // 7
});

test('findingScore: unknown confidence/size falls back to the worst tier', () => {
  const score = findingScore({ confidence: 'nonsense', sizeOfChange: 'nonsense' });
  assert.equal(score, 1 * 10 - 3); // low confidence, large size
});

test('rankFindings: flattens across classes and sorts by score descending', () => {
  const results = [
    {
      classId: 'a',
      title: 'A',
      verdict: FINDINGS,
      findings: [{ id: '1', confidence: 'low', sizeOfChange: 'large' }],
    },
    {
      classId: 'b',
      title: 'B',
      verdict: FINDINGS,
      findings: [{ id: '1', confidence: 'high', sizeOfChange: 'small' }],
    },
    { classId: 'c', title: 'C', verdict: ZERO_FINDINGS_VERIFIED }, // no findings key at all — must not throw
  ];
  const ranked = rankFindings(results);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].classId, 'b'); // high-confidence, small change first
  assert.equal(ranked[1].classId, 'a');
});

test('rankFindings: stable tie-break by classId then id', () => {
  const results = [
    { classId: 'z', title: 'Z', verdict: FINDINGS, findings: [{ id: '1', confidence: 'medium', sizeOfChange: 'medium' }] },
    { classId: 'a', title: 'A', verdict: FINDINGS, findings: [{ id: '1', confidence: 'medium', sizeOfChange: 'medium' }] },
  ];
  const ranked = rankFindings(results);
  assert.equal(ranked[0].classId, 'a'); // equal score, 'a' sorts before 'z'
  assert.equal(ranked[1].classId, 'z');
});
