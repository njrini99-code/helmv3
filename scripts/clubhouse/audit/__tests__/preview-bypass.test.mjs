// The preview-wall helper takes only the project's automation secret, and only for the run's preview, before any network.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { automationSecret } from '../preview-bypass.mjs';

const SCRIPT = resolve(process.cwd(), 'scripts/clubhouse/audit/preview-bypass.mjs');
const run = (...args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

describe('which secret it takes from the project', () => {
  it('takes the automation-bypass entry and skips share links', () => {
    const map = {
      shareLinkSecretAAAAAAAAAAAAAAAAA: { scope: 'shareable-link', expires: 1 },
      automationSecretBBBBBBBBBBBBBBBB: { scope: 'automation-bypass', isEnvVar: true },
    };
    expect(automationSecret(map)).toBe('automationSecretBBBBBBBBBBBBBBBB');
  });

  it('returns null when the project has none', () => {
    expect(automationSecret({ s: { scope: 'shareable-link' } })).toBeNull();
    expect(automationSecret(null)).toBeNull();
    expect(automationSecret(undefined)).toBeNull();
  });
});

describe('the command line', () => {
  it('prints its help and exits 0', () => {
    const r = run('--help');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/never printed/);
  });

  it('refuses production before touching the network', () => {
    for (const base of ['https://helmsportslabs.com', 'https://helmv3.vercel.app', 'https://helmv3-nick-rinis-projects.vercel.app']) {
      const r = run('--check', '--base', base);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/REFUSED/);
    }
  });

  it('refuses a base that is not a Vercel preview', () => {
    const r = run('--check', '--base', 'http://localhost:3000');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/REFUSED: not a Vercel preview/);
  });
});
