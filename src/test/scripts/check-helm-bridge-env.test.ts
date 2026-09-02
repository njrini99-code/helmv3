import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The script printed PASS over eight 11-character placeholders. Run it for
 * real, in a directory with no env files so only the env we hand it counts.
 */
const SCRIPT = resolve(__dirname, '../../../scripts/check-helm-bridge-env.mjs');

const WELL_FORMED: Record<string, string> = {
  SENTRY_READ_TOKEN: `sntrys_${'a'.repeat(48)}`,
  SENTRY_ORG: 'helm-xs',
  SENTRY_PROJECT: 'javascript-nextjs',
  VERCEL_API_TOKEN: 'A1b2C3d4E5f6G7h8I9j0K1l2',
  VERCEL_PROJECT_ID: 'prj_abc123DEF456',
  INTERNAL_LOG_KEY: 'k'.repeat(32),
  INNGEST_SIGNING_KEY: `signkey-prod-${'0f'.repeat(32)}`,
  INNGEST_EVENT_KEY: 'E'.repeat(86),
};

function run(env: Record<string, string>, ...args: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), 'bridge-env-'));
  // A minimal PATH only — no inherited secrets from the test runner's env.
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    // This repo's ProcessEnv augmentation requires NODE_ENV; the script does
    // not read it, and the point is to hand it ONLY the values under test.
    env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv,
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout}\n${result.stderr}` };
}

describe('scripts/check-helm-bridge-env.mjs', () => {
  it('FAILS on eight 11-character placeholders — the exact wall the old floor waved through', () => {
    const eleven = Object.fromEntries(Object.keys(WELL_FORMED).map((k) => [k, 'abcdefghijk']));
    const { status, out } = run(eleven);
    expect(status).toBe(1);
    expect(out).toMatch(/malformed Sentry read token/);
    expect(out).toMatch(/malformed Inngest signing key/);
    expect(out).toMatch(/expected signkey-<env>-<hex>/);
    expect(out).not.toMatch(/passed/);
    // Never the value.
    expect(out).not.toContain('abcdefghijk');
  });

  it('passes on well-formed values', () => {
    const { status, out } = run(WELL_FORMED);
    expect(status).toBe(0);
    expect(out).toMatch(/Helm Bridge env check passed/);
  });

  it('--drift: nothing set at all is a skip, not a failure (CI without secrets)', () => {
    const { status, out } = run({}, '--drift');
    expect(status).toBe(0);
    expect(out).toMatch(/skip No Helm Bridge integration env/);
  });

  it('--drift: a placeholder counts as provisioned-and-wrong, so it fails', () => {
    const { status, out } = run({ ...WELL_FORMED, VERCEL_API_TOKEN: 'your-vercel-token' }, '--drift');
    expect(status).toBe(1);
    expect(out).toMatch(/placeholder Vercel API token/);
    expect(out).toMatch(/DRIFT/);
  });

  it('warns on a DSN that is set but cannot be a DSN, without failing the check', () => {
    const { status, out } = run({ ...WELL_FORMED, NEXT_PUBLIC_SENTRY_DSN: 'abcdefghijk' });
    expect(status).toBe(0);
    expect(out).toMatch(/warn NEXT_PUBLIC_SENTRY_DSN is set but malformed/);
  });
});
