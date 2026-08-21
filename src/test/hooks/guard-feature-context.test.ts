import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureRepo, runHook, type FixtureRepo } from './helpers/fixture-repo';

/**
 * `.claude/hooks/guard-feature-context.mjs` — PreToolUse / Write|Edit|MultiEdit.
 *
 * Spec §10 / §35: mapped file + not loaded -> BLOCK; mapped + loaded ->
 * ALLOW; unmapped GolfHelm file -> BLOCK/explicit gap (acknowledged via
 * knowledge:map's unmapped:true event -> ALLOW); non-Golf file -> unaffected.
 *
 * Uses the fixture repo (2 fake features, real glob syntax) so this test
 * does not depend on the real registry's specific feature ids.
 */
function appendEventRaw(fixture: FixtureRepo, sessionId: string, event: Record<string, unknown>) {
  const dir = join(fixture.dir, '.claude/session-state');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${sessionId}.jsonl`), `${JSON.stringify({ schema: 1, ts: new Date().toISOString(), ...event })}\n`);
}

describe('guard-feature-context.mjs', () => {
  let fixture: FixtureRepo;

  beforeAll(() => {
    fixture = createFixtureRepo();
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it('BLOCKS a mapped governed file when context has not been loaded', () => {
    const result = runHook(fixture, 'guard-feature-context.mjs', {
      session_id: 'sess-block-1',
      cwd: fixture.dir,
      tool_input: { file_path: join(fixture.dir, 'src/app/golf/actions/feature-a-one.ts') },
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('feature_a');
    expect(result.stderr).toContain('context this session has not loaded');
  });

  it('ALLOWS the same file once context_load recorded feature_a as loaded', () => {
    appendEventRaw(fixture, 'sess-allow-1', {
      type: 'context_load',
      source: 'read',
      path: 'memory/features/feature-a.md',
      feature_ids: ['feature_a'],
    });
    const result = runHook(fixture, 'guard-feature-context.mjs', {
      session_id: 'sess-allow-1',
      cwd: fixture.dir,
      tool_input: { file_path: join(fixture.dir, 'src/app/golf/actions/feature-a-one.ts') },
    });
    expect(result.code).toBe(0);
  });

  it('BLOCKS a governed file that maps to NO feature (explicit gap), and names the gap', () => {
    const result = runHook(fixture, 'guard-feature-context.mjs', {
      session_id: 'sess-gap-1',
      cwd: fixture.dir,
      tool_input: { file_path: join(fixture.dir, 'src/app/golf/actions/totally-unmapped.ts') },
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('NO feature');
    expect(result.stderr).toContain('explicit gap');
  });

  it('ALLOWS that same unmapped file once the gap is acknowledged (unmapped:true context_load)', () => {
    appendEventRaw(fixture, 'sess-gap-ack-1', {
      type: 'context_load',
      source: 'bash',
      command: 'npm run knowledge:map -- --files src/app/golf/actions/totally-unmapped.ts',
      path: 'src/app/golf/actions/totally-unmapped.ts',
      feature_ids: [],
      unmapped: true,
    });
    const result = runHook(fixture, 'guard-feature-context.mjs', {
      session_id: 'sess-gap-ack-1',
      cwd: fixture.dir,
      tool_input: { file_path: join(fixture.dir, 'src/app/golf/actions/totally-unmapped.ts') },
    });
    expect(result.code).toBe(0);
  });

  it('ALLOWS a non-governed file unconditionally, regardless of session state', () => {
    const result = runHook(fixture, 'guard-feature-context.mjs', {
      session_id: 'sess-never-seen-before',
      cwd: fixture.dir,
      tool_input: { file_path: join(fixture.dir, 'src/components/ui/button.tsx') },
    });
    expect(result.code).toBe(0);
  });

  it('ALLOWS writes to memory/** unconditionally (the memory-update-IS-the-fix carve-out)', () => {
    const result = runHook(fixture, 'guard-feature-context.mjs', {
      session_id: 'sess-never-seen-before-2',
      cwd: fixture.dir,
      tool_input: { file_path: join(fixture.dir, 'memory/features/feature-a.md') },
    });
    expect(result.code).toBe(0);
  });

  it('does not fire when tool_input has no file_path', () => {
    const result = runHook(fixture, 'guard-feature-context.mjs', {
      session_id: 'sess-no-path',
      cwd: fixture.dir,
      tool_input: {},
    });
    expect(result.code).toBe(0);
  });
});
