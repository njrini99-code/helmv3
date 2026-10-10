// The process-busy probe behind `npm run worktrees`. It replaced a per-checkout
// `lsof +D` directory walk with one `lsof -d cwd -Fpn` scan and a prefix match.
// A PARKABLE verdict carries standing deletion authority, so the matcher must
// stay at least as sensitive as the walk it replaced: any process whose cwd is
// at or under the checkout counts, and an unreadable scan is unknown, not "no".
import { describe, expect, it } from 'vitest';

import {
  hasCwdHolderIn,
  hasLiveProcessIn,
  listCwdHolders,
  parseCwdHolders,
} from '../../../scripts/lib/worktree-facts.mjs';

const SAMPLE = ['p101', 'fcwd', 'n/Users/me/worktrees/helmv3/alpha', 'p202', 'fcwd', 'n/Users/me/worktrees/helmv3/beta/src/lib', 'p303', 'fcwd', 'n/'].join('\n');
const identity = (p: string) => p;

describe('parseCwdHolders', () => {
  it('pairs each cwd with its pid', () => {
    expect(parseCwdHolders(SAMPLE)).toEqual([
      { pid: 101, path: '/Users/me/worktrees/helmv3/alpha' },
      { pid: 202, path: '/Users/me/worktrees/helmv3/beta/src/lib' },
      { pid: 303, path: '/' },
    ]);
  });

  it('ignores noise and empty output', () => {
    expect(parseCwdHolders('')).toEqual([]);
    expect(parseCwdHolders('garbage\nfcwd\n')).toEqual([]);
  });
});

describe('hasCwdHolderIn', () => {
  const holders = parseCwdHolders(SAMPLE);

  it('matches a process sitting exactly at the checkout root', () => {
    expect(hasCwdHolderIn(holders, '/Users/me/worktrees/helmv3/alpha', identity)).toBe(true);
  });

  it('matches a process in a subdirectory, as lsof +D did', () => {
    expect(hasCwdHolderIn(holders, '/Users/me/worktrees/helmv3/beta', identity)).toBe(true);
  });

  it('does not match a sibling that merely shares a name prefix', () => {
    expect(hasCwdHolderIn(parseCwdHolders('p1\nfcwd\nn/Users/me/worktrees/helmv3/alpha-two'), '/Users/me/worktrees/helmv3/alpha', identity)).toBe(false);
  });

  it('does not treat a process at / as inside every checkout', () => {
    expect(hasCwdHolderIn(parseCwdHolders('p1\nfcwd\nn/'), '/Users/me/worktrees/helmv3/alpha', identity)).toBe(false);
  });

  it('matches through a symlinked path via the realpath', () => {
    const real = (p: string) => (p === '/var/tmp/wt' ? '/private/var/tmp/wt' : p);
    expect(hasCwdHolderIn(parseCwdHolders('p1\nfcwd\nn/private/var/tmp/wt/src'), '/var/tmp/wt', real)).toBe(true);
  });

  it('still matches the literal path when the directory cannot be resolved', () => {
    const gone = () => {
      throw new Error('ENOENT');
    };
    expect(hasCwdHolderIn(holders, '/Users/me/worktrees/helmv3/alpha', gone)).toBe(true);
  });
});

describe('listCwdHolders / hasLiveProcessIn', () => {
  it('reads the output of a single lsof call', () => {
    const calls: string[][] = [];
    const exec = (_cmd: string, args: string[]) => {
      calls.push(args);
      return SAMPLE;
    };
    expect(hasLiveProcessIn('/Users/me/worktrees/helmv3/alpha', exec as never)).toBe(true);
    expect(hasLiveProcessIn('/Users/me/worktrees/helmv3/gamma', exec as never)).toBe(false);
    expect(calls[0]).toEqual(['-d', 'cwd', '-Fpn']);
  });

  it('keeps the output lsof printed when it exits 1 for a process it could not stat', () => {
    const exec = () => {
      throw Object.assign(new Error('exit 1'), { stdout: SAMPLE });
    };
    expect(listCwdHolders(exec as never)).toHaveLength(3);
  });

  it('answers null (unknown), never false, when lsof is missing or silent', () => {
    const missing = () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    };
    expect(listCwdHolders(missing as never)).toBeNull();
    expect(hasLiveProcessIn('/anywhere', missing as never)).toBeNull();
  });
});
