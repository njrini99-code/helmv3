import { describe, expect, it } from 'vitest';
import { classifyMigration } from '../db/check-migration-headers.mjs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

describe('classifyMigration', () => {
  it('does not need headers for an additive-only migration', () => {
    const { needsHeaders } = classifyMigration('CREATE TABLE public.foo (id uuid primary key);');
    expect(needsHeaders).toBe(false);
  });

  it('needs headers for INSERT', () => {
    expect(classifyMigration('INSERT INTO public.foo (id) VALUES (1);').needsHeaders).toBe(true);
  });

  it('needs headers for DROP TABLE', () => {
    expect(classifyMigration('DROP TABLE public.foo;').needsHeaders).toBe(true);
  });

  it('needs headers for ALTER TABLE', () => {
    expect(classifyMigration('ALTER TABLE public.foo ADD COLUMN bar text;').needsHeaders).toBe(true);
  });

  it('ignores keywords mentioned only in prose comments', () => {
    const sql = [
      '-- This migration does NOT drop table anything, unlike the old approach',
      '-- which used to DELETE FROM public.foo in a maintenance script.',
      'CREATE TABLE public.foo (id uuid primary key);',
    ].join('\n');
    expect(classifyMigration(sql).needsHeaders).toBe(false);
  });

  it('detects a present ROLLBACK/VERIFY header pair', () => {
    const sql = [
      '-- ROLLBACK: DELETE FROM public.foo WHERE id = 1;',
      '-- VERIFY: SELECT 1 FROM public.foo WHERE id = 1;',
      'INSERT INTO public.foo (id) VALUES (1);',
    ].join('\n');
    const { needsHeaders, hasRollback, hasVerify } = classifyMigration(sql);
    expect(needsHeaders).toBe(true);
    expect(hasRollback).toBe(true);
    expect(hasVerify).toBe(true);
  });
});

describe('check-migration-headers.mjs against the real repo', () => {
  it('passes against the current baseline (ratchet, not a snapshot)', () => {
    expect(() =>
      execFileSync('node', ['scripts/db/check-migration-headers.mjs'], { cwd: REPO_ROOT, stdio: 'pipe' }),
    ).not.toThrow();
  });
});
