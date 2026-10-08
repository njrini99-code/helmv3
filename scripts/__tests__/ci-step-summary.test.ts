import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs module, scripts/ is outside tsconfig.
import { firstErrorLine, stepNames, summarize } from '../github/step-summary.mjs';

const WORKFLOW = `jobs:
  static-checks:
    name: Static checks
    steps:
      - name: Checkout
        uses: actions/checkout@abc

      - name: Schema invariants
        id: schema_invariants
        continue-on-error: true
        run: ./x.sh

      - id: row_caps
        name: PostgREST row caps
        run: node y.mjs

  lint:
    steps:
      - name: Other job
        id: other
        run: z
`;

const tmp: string[] = [];
afterEach(() => {
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('stepNames', () => {
  it('maps ids to names for one job only, in either key order', () => {
    const m = stepNames(WORKFLOW, 'static-checks');
    expect(m.get('schema_invariants')).toBe('Schema invariants');
    expect(m.get('row_caps')).toBe('PostgREST row caps');
    expect(m.has('other')).toBe(false);
  });

  it('is empty for an unknown job', () => {
    expect(stepNames(WORKFLOW, 'nope').size).toBe(0);
  });
});

describe('firstErrorLine', () => {
  it('prefers a ::error:: workflow command', () => {
    expect(firstErrorLine('warming up\n::error file=a.ts::bad thing happened\nmore')).toBe('bad thing happened');
    expect(firstErrorLine('##[error]Process completed with exit code 1.')).toBe('Process completed with exit code 1.');
  });

  it('falls back to the first line that looks like an error, then to the last line', () => {
    expect(firstErrorLine('ok\nsrc/a.ts(3,1): error TS2322: nope\nok')).toContain('error TS2322');
    expect(firstErrorLine('one\ntwo\nthree')).toBe('three');
    expect(firstErrorLine('')).toBe('');
  });
});

describe('summarize', () => {
  const names = new Map([['a', 'Alpha'], ['b', 'Beta']]);

  it('passes when every step succeeded', () => {
    const r = summarize({ outcomes: { a: { outcome: 'success' } }, names, logs: new Map() });
    expect(r.ok).toBe(true);
    expect(r.markdown).toBe('');
  });

  it('names the failing step and quotes its first error; a skipped step counts as failed', () => {
    const r = summarize({
      outcomes: { a: { outcome: 'success' }, b: { outcome: 'failure' }, c: { outcome: 'skipped' } },
      names,
      logs: new Map([['b', 'fine\n::error::schema drift in table x\n']]),
    });
    expect(r.ok).toBe(false);
    expect(r.text).toContain('FAILED  b -> failure');
    expect(r.markdown).toContain('Beta (`b`)');
    expect(r.markdown).toContain('schema drift in table x');
    expect(r.markdown).toContain('did not run');
  });

  it('leaves ignored plumbing steps out of the verdict', () => {
    const r = summarize({
      outcomes: { a: { outcome: 'success' }, filter: { outcome: 'skipped' }, gate: { outcome: 'failure' } },
      names,
      logs: new Map(),
      ignore: new Set(['filter', 'gate']),
    });
    expect(r.ok).toBe(true);
  });

  it('escapes table pipes in a quoted error', () => {
    const r = summarize({ outcomes: { b: { outcome: 'failure' } }, names, logs: new Map([['b', '::error::a | b']]) });
    expect(r.markdown).toContain('a \\| b');
  });
});

describe('step-shell.sh', () => {
  const SHELL = resolve(process.cwd(), 'scripts/github/step-shell.sh');

  it('passes the script exit code through and tees the output to <id>.log', () => {
    const dir = mkdtempSync(join(tmpdir(), 'step-shell-'));
    tmp.push(dir);
    const script = join(dir, 's.sh');
    writeFileSync(script, 'echo hello\necho "::error::boom"\nexit 7\n');
    const r = spawnSync('bash', [SHELL, script], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', RUNNER_TEMP: dir, GITHUB_ACTION: 'my_step' } });
    expect(r.status).toBe(7);
    expect(r.stdout).toContain('hello');
    expect(readFileSync(join(dir, 'step-logs', 'my_step.log'), 'utf8')).toContain('::error::boom');
  });

  it('keeps -e semantics: the first failing command stops the script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'step-shell-'));
    tmp.push(dir);
    const script = join(dir, 's.sh');
    writeFileSync(script, 'false\necho unreachable\n');
    const r = spawnSync('bash', [SHELL, script], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', RUNNER_TEMP: dir, GITHUB_ACTION: 's' } });
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('unreachable');
  });
});
