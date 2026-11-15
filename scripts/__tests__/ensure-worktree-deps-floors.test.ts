// The disk floors in scripts/ensure-worktree-deps.mjs: an install keeps the
// 12 GiB machine reserve plus a 5 GiB budget; a clone (about 25 MiB) has its
// own 2 GiB reserve, so a full-size floor never leaves a worktree with no
// node_modules (2026-11-15: a clone refused at 12.4 GiB free).
import { describe, expect, it } from 'vitest';
import { cloneDecision, installDecision } from '../ensure-worktree-deps.mjs';

describe('disk floors', () => {
  it('lets a clone through at 12.4 GiB free', () => {
    expect(cloneDecision(12.4).ok).toBe(true);
  });
  it('refuses a clone below its own floor, and says it is a clone', () => {
    const d = cloneDecision(1.9);
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/a clone needs 2\.5 GiB/);
  });
  it('still refuses an install at 12.4 GiB free', () => {
    const d = installDecision(12.4);
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/an install needs 17 GiB/);
  });
  it('fails closed when free space cannot be measured', () => {
    expect(cloneDecision(null).ok).toBe(false);
    expect(installDecision(undefined).ok).toBe(false);
  });
});
