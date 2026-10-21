// A worktree install must include devDependencies, whatever NODE_ENV says.
//
// 2026-10-11: the desktop health routine ran `scripts/new-worktree.sh
// health-routine --install` from a shell with NODE_ENV=production (npm then
// defaults `omit` to `dev`). The install "succeeded" with 277 of 977 packages:
// no vitest, no tsc, no eslint, no supabase CLI. `npm run check:types-drift`
// failed with "Repository Supabase CLI not found", and every gate a worktree
// exists to run would have failed the same way. A worktree install is for
// running gates, so it always asks for dev dependencies explicitly.

import { describe, it, expect } from 'vitest';
import { NPM_CI_ARGS } from '../ensure-worktree-deps.mjs';

describe('ensure-worktree-deps npm ci arguments', () => {
  it('runs npm ci', () => {
    expect(NPM_CI_ARGS[0]).toBe('ci');
  });

  it('includes dev dependencies even when NODE_ENV=production', () => {
    expect(NPM_CI_ARGS).toContain('--include=dev');
  });
});
