// scripts/pr-land.mjs's merge step: GitHub's asynchronous merge API (GA 2026-10-01). The PUT pins the squash to the head commit
// whose required checks were read; these cases cover what each answer means and the polling loop, with gh, sleep and the clock faked.

import { describe, it, expect } from 'vitest';
import {
  asyncMerge,
  classifyAsyncMergeResult,
  classifyAsyncMergeStart,
  parseGhApiInclude,
} from '../../../scripts/pr-land.mjs';

const include = (status: number, body: unknown) => `HTTP/2.0 ${status} OK\nContent-Type: application/json\n\n${JSON.stringify(body)}`;

function fakeGh(put: string, polls: Array<{ ok: boolean; body?: unknown }>) {
  const calls: string[][] = [];
  const run = (args: string[]) => {
    calls.push(args);
    if (args.includes('PUT')) return { ok: true, stdout: put };
    const next = polls.shift() ?? { ok: true, body: { status: 'pending' } };
    return { ok: next.ok, stdout: next.ok ? JSON.stringify(next.body) : '' };
  };
  let t = 0;
  return { calls, run, sleep: async (ms: number) => void (t += ms), now: () => t };
}

describe('parseGhApiInclude', () => {
  it('reads the status line and the JSON body', () => {
    expect(parseGhApiInclude(include(202, { uuid: 'u1' }))).toEqual({ status: 202, body: { uuid: 'u1' } });
  });
  it('a body that is not JSON is null, not a throw', () => {
    expect(parseGhApiInclude('HTTP/2.0 502 Bad Gateway\n\n<html>')).toEqual({ status: 502, body: null });
  });
});

describe('classifyAsyncMergeStart', () => {
  it('202 and 409 both poll the uuid they carry', () => {
    expect(classifyAsyncMergeStart({ status: 202, body: { uuid: 'a' } })).toEqual({ kind: 'poll', uuid: 'a' });
    expect(classifyAsyncMergeStart({ status: 409, body: { uuid: 'b' } })).toEqual({ kind: 'poll', uuid: 'b' });
  });
  it('a 202 without a uuid is an error, never a silent success', () => {
    expect(classifyAsyncMergeStart({ status: 202, body: {} }).kind).toBe('error');
  });
  it('200 is already settled; 404 means no async endpoint here', () => {
    expect(classifyAsyncMergeStart({ status: 200, body: { status: 'merged', sha: 'm' } })).toEqual({ kind: 'done', status: 'merged', sha: 'm' });
    expect(classifyAsyncMergeStart({ status: 404, body: null })).toEqual({ kind: 'unsupported' });
  });
  it('a refusal (422: head moved, checks, protection) carries its message', () => {
    expect(classifyAsyncMergeStart({ status: 422, body: { message: 'Head sha mismatch' } })).toEqual({ kind: 'error', message: 'HTTP 422: Head sha mismatch' });
  });
});

describe('classifyAsyncMergeResult', () => {
  it('pending keeps polling, merged succeeds, failed and enqueued stop', () => {
    expect(classifyAsyncMergeResult({ status: 'pending' })).toEqual({ kind: 'pending' });
    expect(classifyAsyncMergeResult({ status: 'merged', sha: 'm' })).toEqual({ kind: 'merged', sha: 'm' });
    expect(classifyAsyncMergeResult({ status: 'failed', message: 'conflict' })).toEqual({ kind: 'failed', message: 'failed: conflict' });
    expect(classifyAsyncMergeResult({ status: 'enqueued' }).kind).toBe('failed');
  });
});

describe('asyncMerge', () => {
  const base = { repo: 'o/r', prNumber: 7, headSha: 'abc123', pollMs: 10, timeoutMs: 100 };

  it('pins the squash to the checked head, without bypassing rules, and waits for the merge', async () => {
    const gh = fakeGh(include(202, { uuid: 'u1' }), [{ ok: true, body: { status: 'pending' } }, { ok: true, body: { status: 'merged', sha: 'mc' } }]);
    expect(await asyncMerge({ ...base, ...gh })).toEqual({ ok: true, sha: 'mc' });
    const put = gh.calls[0]!;
    expect(put).toEqual(expect.arrayContaining(['PUT', 'repos/o/r/pulls/7/merge-async', 'merge_method=squash', 'merge_action=direct_merge', 'sha=abc123', 'bypass_rules=false']));
    expect(gh.calls[1]).toEqual(['api', 'repos/o/r/pulls/7/merge-async/u1']);
  });

  it('a transient poll error polls again', async () => {
    const gh = fakeGh(include(202, { uuid: 'u1' }), [{ ok: false }, { ok: true, body: { status: 'merged', sha: 'mc' } }]);
    expect(await asyncMerge({ ...base, ...gh })).toEqual({ ok: true, sha: 'mc' });
  });

  it('a failed merge reports GitHub\'s message', async () => {
    const gh = fakeGh(include(202, { uuid: 'u1' }), [{ ok: true, body: { status: 'failed', message: 'merge conflict' } }]);
    expect(await asyncMerge({ ...base, ...gh })).toEqual({ ok: false, message: 'failed: merge conflict' });
  });

  it('gives up at the deadline, naming the request', async () => {
    const gh = fakeGh(include(202, { uuid: 'u9' }), []);
    const r = await asyncMerge({ ...base, ...gh });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/still pending .*u9/);
  });

  it('no endpoint: says so, so the caller falls back to gh pr merge', async () => {
    const gh = fakeGh(include(404, { message: 'Not Found' }), []);
    expect(await asyncMerge({ ...base, ...gh })).toEqual({ ok: false, unsupported: true });
  });
});
