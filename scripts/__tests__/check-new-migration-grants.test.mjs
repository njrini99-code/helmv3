import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findCreatedPublicRelations,
  findUngrantedRelations,
  isGrantsExempt,
  parseQualifiedName,
} from '../db/check-new-migration-grants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts/db/check-new-migration-grants.mjs');

describe('parseQualifiedName', () => {
  it('defaults unqualified names to public', () => {
    expect(parseQualifiedName('golf_foo')).toEqual({ schema: 'public', name: 'golf_foo' });
  });
  it('handles quoted and spaced qualification', () => {
    expect(parseQualifiedName('"public" . "Golf_Foo"')).toEqual({ schema: 'public', name: 'Golf_Foo' });
    expect(parseQualifiedName('PUBLIC.Golf_Foo')).toEqual({ schema: 'public', name: 'golf_foo' });
  });
});

describe('findCreatedPublicRelations', () => {
  it('finds public tables in every spelling', () => {
    const sql = [
      'CREATE TABLE public.a (id uuid);',
      'create table if not exists b (id uuid);',
      'CREATE TABLE IF NOT EXISTS "public"."c" (id uuid);',
      'CREATE UNLOGGED TABLE public.d (id uuid);',
      'CREATE MATERIALIZED VIEW public.e AS SELECT 1;',
      'CREATE VIEW public.f AS SELECT 1;',
    ].join('\n');
    expect(findCreatedPublicRelations(sql)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('skips temp tables, other schemas, OR REPLACE views and comments', () => {
    const sql = [
      'CREATE TEMP TABLE scratch (id int);',
      'CREATE TEMPORARY TABLE scratch2 (id int);',
      'CREATE TABLE private.secret (id int);',
      'CREATE TABLE "storage"."thing" (id int);',
      'CREATE OR REPLACE VIEW public.v AS SELECT 1;',
      '-- CREATE TABLE public.only_in_prose (id int);',
      '/* CREATE TABLE public.only_in_block (id int); */',
    ].join('\n');
    expect(findCreatedPublicRelations(sql)).toEqual([]);
  });
});

describe('findUngrantedRelations', () => {
  it('flags a REVOKE-only migration (the pattern that relied on the auto-grant)', () => {
    const sql = [
      'CREATE TABLE public.golf_new (id uuid primary key);',
      'ALTER TABLE public.golf_new ENABLE ROW LEVEL SECURITY;',
      'REVOKE ALL ON public.golf_new FROM anon;',
    ].join('\n');
    expect(findUngrantedRelations(sql)).toEqual(['golf_new']);
  });

  it('flags a grant to authenticated only', () => {
    const sql = [
      'CREATE TABLE public.golf_new (id uuid primary key);',
      'GRANT SELECT ON public.golf_new TO authenticated;',
    ].join('\n');
    expect(findUngrantedRelations(sql)).toEqual(['golf_new']);
  });

  it('accepts an explicit service_role grant in any spelling', () => {
    const sql = [
      'CREATE TABLE public.a (id uuid primary key);',
      'CREATE TABLE "public"."b" (id uuid primary key);',
      'CREATE TABLE c (id uuid primary key);',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.a TO service_role;',
      'GRANT ALL ON "public"."b" TO "authenticated", "service_role";',
      'grant select on c to authenticated,\n  service_role;',
    ].join('\n');
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it('accepts a comma-separated table list', () => {
    const sql = [
      'CREATE TABLE public.a (id uuid);',
      'CREATE TABLE public.b (id uuid);',
      'GRANT SELECT ON TABLE public.a, public.b TO service_role;',
    ].join('\n');
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it('accepts GRANT ... ON ALL TABLES IN SCHEMA public', () => {
    const sql = [
      'CREATE TABLE public.a (id uuid);',
      'GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;',
    ].join('\n');
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it('does not count a sequence, function or default-privilege grant as a table grant', () => {
    const sql = [
      'CREATE TABLE public.a (id serial);',
      'GRANT USAGE, SELECT ON SEQUENCE public.a_id_seq TO service_role;',
      'GRANT EXECUTE ON FUNCTION public.a() TO service_role;',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;',
    ].join('\n');
    expect(findUngrantedRelations(sql)).toEqual(['a']);
  });

  it('ignores a grant that appears only in a comment', () => {
    const sql = [
      'CREATE TABLE public.a (id uuid);',
      '-- GRANT ALL ON public.a TO service_role;',
    ].join('\n');
    expect(findUngrantedRelations(sql)).toEqual(['a']);
  });

  it('honours a -- GRANTS: exempt comment anywhere in the file', () => {
    const sql = [
      '-- DECLARATIVE: exempt data backfill',
      '-- GRANTS: exempt staging table dropped at the end of this migration',
      'CREATE TABLE public.tmp_backfill (id uuid);',
    ].join('\n');
    expect(isGrantsExempt(sql)).toBe(true);
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it('returns nothing for a migration that creates no table', () => {
    expect(findUngrantedRelations('ALTER TABLE public.a ADD COLUMN b text;')).toEqual([]);
  });
});

describe('check-new-migration-grants.mjs CLI', () => {
  const run = (files) => {
    try {
      const stdout = execFileSync('node', [SCRIPT, '--files', ...files], { cwd: REPO_ROOT, stdio: 'pipe' });
      return { code: 0, out: stdout.toString() };
    } catch (err) {
      return { code: err.status, out: `${err.stdout}${err.stderr}` };
    }
  };

  it('exits 1 for an ungranted table and 0 once granted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grants-check-'));
    try {
      const bad = join(dir, 'bad.sql');
      const good = join(dir, 'good.sql');
      writeFileSync(bad, 'CREATE TABLE public.golf_x (id uuid);\nREVOKE ALL ON public.golf_x FROM anon;\n');
      writeFileSync(good, 'CREATE TABLE public.golf_x (id uuid);\nGRANT ALL ON public.golf_x TO service_role;\n');
      const failed = run([bad]);
      expect(failed.code).toBe(1);
      expect(failed.out).toContain('public.golf_x');
      expect(run([good]).code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes on this PR\'s own default-privileges migration', () => {
    expect(run(['supabase/migrations/20261003120000_public_default_privileges_explicit.sql']).code).toBe(0);
  });
});
