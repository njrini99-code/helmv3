// The audit sign-in script refuses everything but demo accounts on staging, before it touches the network.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { isDemoEmail } from '../session.mjs';

const SCRIPT = resolve(process.cwd(), 'scripts/clubhouse/audit/session.mjs');
const run = (...args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, SUPABASE_BIN: '/nonexistent' } });

describe('who counts as a demo account', () => {
  it('takes the demo domains and a helmsportslabs.com address with "demo" in it', () => {
    expect(isDemoEmail('coach@demo.helmsportslabs.com', '')).toBe(true);
    expect(isDemoEmail('demo@golfhelmdemo.com', '')).toBe(true);
    expect(isDemoEmail('demo.jackson.hale@helmsportslabs.com', '')).toBe(true);
  });

  it('refuses every other address, staff and personal ones included', () => {
    expect(isDemoEmail('nick@helmsportslabs.com', '')).toBe(false);
    expect(isDemoEmail('someone@gmail.com', '')).toBe(false);
    expect(isDemoEmail('demo@gmail.com', '')).toBe(false);
    expect(isDemoEmail('', '')).toBe(false);
  });

  it('takes an exact address only when it is listed locally', () => {
    expect(isDemoEmail('tester@example.com', 'tester@example.com, other@example.com')).toBe(true);
    expect(isDemoEmail('tester@example.com', '')).toBe(false);
  });
});

describe('the command line', () => {
  it('prints its help and exits 0', () => {
    const r = run('--help');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/demo accounts on Demo University Golf only/);
  });

  it('refuses a production base before asking for any key', () => {
    const r = run('--role', 'coach', '--base', 'https://helmsportslabs.com');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/REFUSED: that base is production/);
  });

  it('refuses arguments that name the production project', () => {
    const r = run('--role', 'coach', '--base', 'https://qmnssrrolpinvwjjnufo.supabase.co');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/REFUSED: production appears in the arguments/);
  });

  it('refuses a base that is neither a preview nor local dev', () => {
    const r = run('--role', 'player', '--base', 'https://example.com');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/base must be the Vercel preview/);
  });
});
