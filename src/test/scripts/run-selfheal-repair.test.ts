/**
 * The outer Repair runner's contract: a run that fails before Claude can speak
 * must still leave evidence — but only evidence the runner can actually prove.
 *
 * WHY THIS EXISTS. The 06:40 scheduled Repair run hung for 30 minutes, was
 * killed by the watchdog, and wrote NOTHING. `/admin/jobs` could not tell that
 * from a laptop that was asleep — the exact confusion the heartbeat exists to
 * prevent, reproduced one layer above it.
 *
 * THE RULE THAT MAKES IT SAFE. A fallback row is written ONLY after a
 * SUCCESSFUL read proves no heartbeat exists for this run:
 *
 *     heartbeat query failed   !=   heartbeat absent
 *
 * Writing on an unreadable store would manufacture failure rows during a
 * Supabase outage. Inventing bad news is no better than inventing good news,
 * and it is the same unknown-vs-none error this program keeps closing.
 *
 * Identity is a per-run UUID, never a timestamp window: timestamps cannot
 * distinguish "this run" from "a run that happened to overlap".
 */
import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  reconcileRepairRun,
  redactSecrets,
  truncateTail,
  TIMEOUT_EXIT_CODE,
} from '../../../scripts/lib/selfheal-repair-runner.mjs';

const RUNNER_SCRIPT = resolve(__dirname, '../../../scripts/run-selfheal-repair.mjs');

const RUN_ID = '11111111-2222-4333-8444-555555555555';
const STARTED = '2026-08-29T06:40:00.000Z';
const COMPLETED = '2026-08-29T07:10:00.000Z';

/** A fake heartbeat store. Unit tests never touch production Supabase. */
function store(opts: {
  lookup: { readable: true; found: boolean } | { readable: false; error: string };
  insert?: { ok: true } | { ok: false; error: string };
}) {
  const inserts: unknown[] = [];
  return {
    inserts,
    findByRunId: vi.fn(async () => opts.lookup),
    insertRunnerFailure: vi.fn(async (row: unknown) => {
      inserts.push(row);
      return opts.insert ?? { ok: true as const };
    }),
  };
}

const run = (childExit: number, s: ReturnType<typeof store>) =>
  reconcileRepairRun({ runId: RUN_ID, childExit, startedAt: STARTED, completedAt: COMPLETED, store: s as never });

describe('reconcileRepairRun — the runner records only what it can prove', () => {
  it('Claude wrote its own heartbeat: the runner writes nothing', async () => {
    const s = store({ lookup: { readable: true, found: true } });
    const result = await run(0, s);

    expect(result).toEqual({ kind: 'heartbeat-present', childExit: 0 });
    expect(s.insertRunnerFailure).not.toHaveBeenCalled();
  });

  it('TIMEOUT with no heartbeat: one fallback row, marked as a timeout', async () => {
    const s = store({ lookup: { readable: true, found: false } });
    const result = await run(TIMEOUT_EXIT_CODE, s);

    expect(result).toEqual({ kind: 'fallback-written', childExit: 124, timeout: true });
    expect(s.insertRunnerFailure).toHaveBeenCalledTimes(1);
    expect(s.inserts[0]).toMatchObject({
      runId: RUN_ID,
      childExit: 124,
      timeout: true,
      durationMs: 30 * 60 * 1000,
    });
    expect((s.inserts[0] as { errorMessage: string }).errorMessage).toMatch(/timeout/i);
  });

  it('non-zero exit with no heartbeat: fallback, but NOT labelled a timeout', async () => {
    // The distinction the operator needs: a crash is not a hang, and treating
    // every runner failure as a timeout would hide which one happened.
    const s = store({ lookup: { readable: true, found: false } });
    const result = await run(1, s);

    expect(result).toEqual({ kind: 'fallback-written', childExit: 1, timeout: false });
    expect(s.inserts[0]).toMatchObject({ childExit: 1, timeout: false });
  });

  it('exit 0 with no heartbeat is still a FAILURE', async () => {
    // Exiting cleanly without writing the contract's final heartbeat means the
    // run did not complete its contract, whatever the exit code claimed.
    const s = store({ lookup: { readable: true, found: false } });
    const result = await run(0, s);

    expect(result).toEqual({ kind: 'fallback-written', childExit: 0, timeout: false });
    expect((s.inserts[0] as { errorMessage: string }).errorMessage).toMatch(/without writing the final Repair heartbeat/);
  });

  it('heartbeat store UNREADABLE: nothing is written, and the state says unknown', async () => {
    // The heart of it. A failed read is not proof of absence, and writing on it
    // would manufacture failure rows during a Supabase outage.
    const s = store({ lookup: { readable: false, error: 'permission denied' } });
    const result = await run(TIMEOUT_EXIT_CODE, s);

    expect(result).toEqual({
      kind: 'heartbeat-state-unknown',
      childExit: 124,
      error: 'permission denied',
    });
    expect(s.insertRunnerFailure).not.toHaveBeenCalled();
  });

  it('a failed fallback WRITE is reported, not silently swallowed', async () => {
    const s = store({
      lookup: { readable: true, found: false },
      insert: { ok: false, error: 'insert denied' },
    });
    const result = await run(TIMEOUT_EXIT_CODE, s);

    expect(result).toEqual({ kind: 'fallback-failed', childExit: 124, error: 'insert denied' });
  });

  it('the run is identified by run_id, and only that run_id is looked up', async () => {
    // Not a timestamp window: timestamps cannot tell "this run" from "a run
    // that happened to overlap", and inferring absence from a range is how a
    // healthy run earns a spurious failure row.
    const s = store({ lookup: { readable: true, found: true } });
    await run(0, s);

    expect(s.findByRunId).toHaveBeenCalledWith(RUN_ID);
  });

  it('a runner-failure row carries the redacted, truncated tail — without changing the existing result shape', async () => {
    // toMatchObject, not toEqual: the tests above assert the RESULT's exact
    // shape with toEqual and must never gain new keys just because a caller
    // now sometimes passes childOutputTail. The inserted ROW is a different
    // object and is where the new field actually lives.
    const s = store({ lookup: { readable: true, found: false } });
    const result = await reconcileRepairRun({
      runId: RUN_ID,
      childExit: 1,
      startedAt: STARTED,
      completedAt: COMPLETED,
      childOutputTail: 'Error: boom\nHELM_DEMO_SERVICE_KEY=sbp_demo0123456789abcdef',
      store: s as never,
    });

    expect(result).toEqual({ kind: 'fallback-written', childExit: 1, timeout: false });
    expect(s.inserts[0]).toMatchObject({
      childExit: 1,
      childOutputTail: expect.stringContaining('Error: boom'),
    });
    const tail = (s.inserts[0] as { childOutputTail: string }).childOutputTail;
    expect(tail).not.toContain('sbp_demo0123456789abcdef');
    expect(tail).toContain('[REDACTED]');
  });

  it('omitting childOutputTail keeps the inserted row exactly as it was before this field existed', async () => {
    const s = store({ lookup: { readable: true, found: false } });
    await run(1, s);

    expect(s.inserts[0]).not.toHaveProperty('childOutputTail');
  });
});

describe('redactSecrets — never let a captured tail leak a credential', () => {
  it('redacts bare prefix-shaped credentials that never appear as a KEY= assignment', () => {
    const out = redactSecrets(
      'fetch failed for https://x.supabase.co?apikey=sb_secret_abcdefghij0123456789 ' +
        'using ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 and Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123',
    );
    expect(out).not.toContain('sb_secret_abcdefghij0123456789');
    expect(out).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
    expect(out).toContain('[REDACTED]');
    // Ordinary words that merely start with a prefix letter run are untouched.
    expect(redactSecrets('skipped sk8 park, shorts ok')).toBe('skipped sk8 park, shorts ok');
  });

  it('redacts a JWT-shaped token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = redactSecrets(`token in the log: ${jwt}`);

    expect(out).not.toContain(jwt);
    expect(out).toContain('[REDACTED]');
  });

  it('redacts a JWT-shaped token to EXACTLY "[REDACTED]", not a mangled offset like "18=[REDACTED]"', () => {
    // Regression test: SECRET_PATTERNS[0] (the JWT pattern) has zero capturing
    // groups, so String.replace's callback receives (match, offset, string) —
    // NOT (match, group1). A truthiness check on the second callback argument
    // (`group1 ? ... : '[REDACTED]'`) therefore treats the match's numeric
    // string OFFSET as a truthy "group1" for any match not at index 0, and
    // produces "<offset>=[REDACTED]" instead of a clean "[REDACTED]". This
    // JWT starts at index 18 in the fixture below, which is exactly the shape
    // a real leak takes — a token appearing mid-line in claude's
    // stream-json/verbose output, never at position 0. `toContain` alone
    // cannot catch this because the substring "[REDACTED]" is still present
    // inside the mangled "18=[REDACTED]" text.
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const line = `token in the log: ${jwt}`;

    expect(redactSecrets(line)).toBe('token in the log: [REDACTED]');
  });

  it('redacts a JWT-shaped token at offset 0 too (the one input that accidentally worked before the fix)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

    expect(redactSecrets(jwt)).toBe('[REDACTED]');
  });

  it('redacts a JWT that is NOT preceded by a KEY=/TOKEN=-shaped assignment', () => {
    // The existing HELM_DEMO_SERVICE_KEY= fixture below places the JWT
    // immediately after an assignment, so the second (key/value) pattern's
    // own correct second pass overwrites the first pass's garbage — masking
    // the bug rather than proving the fix. This fixture has no assignment
    // prefix, so only the JWT pattern ever touches it.
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const line = `Error: request failed, saw bearer ${jwt} in header`;

    expect(redactSecrets(line)).toBe('Error: request failed, saw bearer [REDACTED] in header');
  });

  it('redacts a key/token/secret assignment-like pattern, keeping the key name for context', () => {
    const out = redactSecrets('HELM_DEMO_SERVICE_KEY=sbp_abcdef0123456789');

    expect(out).not.toContain('sbp_abcdef0123456789');
    expect(out).toContain('HELM_DEMO_SERVICE_KEY=[REDACTED]');
  });

  it('redacts a quoted key/value assignment cleanly, without a dangling quote', () => {
    const out = redactSecrets('HELM_DEMO_SERVICE_KEY="sbp_abcdef0123456789"');

    expect(out).not.toContain('sbp_abcdef0123456789');
    expect(out).toBe('HELM_DEMO_SERVICE_KEY=[REDACTED]');
  });

  it('leaves ordinary text untouched', () => {
    const text = 'Error: connect ECONNREFUSED 127.0.0.1:54321\nat processTicksAndRejections';
    expect(redactSecrets(text)).toBe(text);
  });

  it('is a no-op on empty input', () => {
    expect(redactSecrets('')).toBe('');
  });
});

describe('truncateTail — bound a captured tail without unbounded growth', () => {
  it('keeps the LAST maxBytes bytes, not the first', () => {
    const text = 'A'.repeat(100) + 'TAIL-MARKER';
    const out = truncateTail(text, 20);

    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).toContain('TAIL-MARKER');
    expect(out).not.toContain('A'.repeat(50));
  });

  it('returns text unchanged when already under the limit', () => {
    const text = 'short and fine';
    expect(truncateTail(text, 4096)).toBe(text);
  });

  it('does not throw or corrupt output when the cut point lands inside a multi-byte UTF-8 character', () => {
    const text = 'x'.repeat(10) + '💥'.repeat(10);
    expect(() => truncateTail(text, 15)).not.toThrow();
  });
});

describe('scripts/run-selfheal-repair.mjs — the tail is captured before reconcile, and the log still sees everything', () => {
  it('a child that writes stderr then exits immediately: the marker is forwarded live AND reconcile runs to completion after close', () => {
    // No NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the child's
    // env, so productionStore() takes its "unreadable" branch and makes no
    // network call — this test writes nothing to Supabase, real or fake.
    const marker = 'SELFHEAL_TEST_STDERR_MARKER_4f9c';
    const result = spawnSync(
      process.execPath,
      [
        RUNNER_SCRIPT,
        '10',
        '--',
        process.execPath,
        '-e',
        `process.stderr.write(${JSON.stringify(marker)}); process.exit(3);`,
      ],
      {
        env: { PATH: process.env.PATH ?? '' } as unknown as NodeJS.ProcessEnv,
        encoding: 'utf8',
        timeout: 15_000,
      },
    );

    // The child's own exit code (3) survives through run-bounded.mjs and the
    // runner's own process.exit(childExit) — proof the runner did not hang
    // waiting on 'close' (bounded by CLOSE_GRACE_MS) and did not swallow the
    // exit code while reconciling.
    expect(result.status).toBe(3);
    // Piping to capture a tail must never silence the log: the marker still
    // reaches this process's own stderr in real time, exactly as `>> log
    // 2>&1` in the plist expects.
    expect(result.stderr).toContain(marker);
    // Reconcile ran (and therefore had the tail available) after 'close' —
    // it did not error out or hang; with no readable store this is
    // 'heartbeat-state-unknown', not silence.
    expect(result.stderr).toContain('heartbeat-state-unknown');
  });

  it('a child that writes several MB to stdout before exiting: the pipe does not drop the tail end or deadlock', () => {
    // The unit tests above prove truncateTail keeps the last N bytes of a
    // string already in memory. They do NOT prove the live pipe — a child
    // writing far more than one 64KB pipe buffer's worth of stdout, the way
    // `claude --output-format stream-json --verbose` does over a real run —
    // never blocks on a full pipe and never loses the final chunk the way a
    // naive `stdio: 'pipe'` consumer can if it stops reading. 2MB is well
    // past any single OS pipe buffer, so this exercises real backpressure,
    // not just the truncation math.
    const endMarker = 'SELFHEAL_TEST_END_MARKER_8a2e';
    const bulkBytes = 2 * 1024 * 1024; // 2MB, comfortably over a 64KB pipe buffer
    const childScript = [
      `const bulk = 'x'.repeat(65536);`,
      `let written = 0;`,
      // Gate `process.exit` on the LAST write's own callback, not on the loop
      // finishing: `process.stdout.write` to a pipe is async, and Node
      // guarantees per-stream write callbacks fire in issue order — so
      // waiting for the final chunk's callback proves every earlier chunk
      // was already handed to the pipe. Exiting right after the synchronous
      // loop (no callback) is exactly the bug this fixture exists to catch:
      // it truncates the write on a real OS pipe before the buffered data
      // drains.
      `while (written < ${bulkBytes}) {`,
      `  written += bulk.length;`,
      `  const isLast = written >= ${bulkBytes};`,
      `  process.stdout.write(bulk, isLast ? () => { process.stderr.write(${JSON.stringify(endMarker)}); process.exit(3); } : undefined);`,
      `}`,
    ].join(' ');

    const result = spawnSync(
      process.execPath,
      [RUNNER_SCRIPT, '10', '--', process.execPath, '-e', childScript],
      {
        env: { PATH: process.env.PATH ?? '' } as unknown as NodeJS.ProcessEnv,
        encoding: 'utf8',
        timeout: 15_000,
        // Default spawnSync maxBuffer is 1MB — smaller than the 2MB this
        // fixture forwards through run-selfheal-repair.mjs's own stdout.
        // Raise it so the TEST's own capture isn't what truncates the output
        // under inspection.
        maxBuffer: 8 * 1024 * 1024,
      },
    );

    // The child's real exit code survives a full 2MB pass through the pipe —
    // proof the runner did not hang or misreport while draining a backed-up
    // pipe (CLOSE_GRACE_MS bounds the wait either way).
    expect(result.status).toBe(3);
    // The bulk stdout output still reaches this process's own stdout live —
    // piping to capture a tail must never silence the log.
    expect(result.stdout.length).toBeGreaterThanOrEqual(bulkBytes);
    // The LAST thing the child wrote (on stderr, after all the stdout) still
    // arrives — the exact failure mode a lost-final-chunk bug would produce.
    expect(result.stderr).toContain(endMarker);
    expect(result.stderr).toContain('heartbeat-state-unknown');
  });
});
