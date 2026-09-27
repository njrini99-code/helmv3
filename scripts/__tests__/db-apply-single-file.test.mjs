/**
 * scripts/db/apply.mjs — the single-file apply body and its two refusals.
 *
 * This path's first real execution is against production: `--apply` is denied
 * to agents in .claude/settings.json, the DB password lives only in GitHub
 * secrets, and `supabase db query --local` cannot run a multi-statement file
 * at all (it uses the extended query protocol — "cannot insert multiple
 * commands into a prepared statement"). So nothing about the linked transport
 * is rehearsable locally, and the pure body-building step is the only part
 * that can be pinned by a test. It is also the part that would silently ship a
 * wrong ledger row, so it is the part worth pinning.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildApplyBody, hasConcurrently, isValidMigrationFilename } from '../db/apply.mjs';
import { linkedQueryArgs, parseQueryRows } from '../db/query-json.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

describe('buildApplyBody', () => {
  const basename = '20260907160000_golf_team_chat_membership_management.sql';
  const fileText = readFileSync(resolve(REPO_ROOT, 'supabase/migrations', basename), 'utf-8');
  const body = buildApplyBody(basename, fileText);

  it('sends the reviewed migration verbatim, with nothing removed or reordered', () => {
    // The whole point of this path is that what executes is what was reviewed.
    // Anything that rewrote the file (statement splitting, comment stripping,
    // a begin/commit wrapper) would break this.
    expect(body.startsWith(fileText.replace(/\s*$/, ''))).toBe(true);
  });

  it('appends exactly one statement: the ledger row db push would have written', () => {
    const appended = body.slice(fileText.replace(/\s*$/, '').length);
    expect(appended).toContain(
      "insert into supabase_migrations.schema_migrations (version, name)\nvalues ('20260907160000', 'golf_team_chat_membership_management');",
    );
    // One statement, not two. Counting semicolons in the appended tail only —
    // the migration itself has many.
    expect(appended.split(';').length - 1).toBe(1);
  });

  it('adds no begin/commit — the Management API already wraps the body in one transaction', () => {
    // Probed with set_config(..., is_local := true): a value set by the first
    // statement is visible to the second, so the body shares one transaction.
    // An explicit `commit;` here would close that outer transaction early,
    // and the ledger row would land outside the migration's atomicity.
    const appended = body.slice(fileText.replace(/\s*$/, '').length);
    expect(appended.toLowerCase()).not.toMatch(/\bbegin\s*;/);
    expect(appended.toLowerCase()).not.toMatch(/\bcommit\s*;/);
  });

  it('derives version and name the way db push records them', () => {
    const body2 = buildApplyBody('20991231235959_some_other_thing.sql', '-- x\nselect 1;\n');
    expect(body2).toContain("values ('20991231235959', 'some_other_thing');");
  });
});

describe('the two refusals', () => {
  it('rejects any basename that could carry a quote into the ledger INSERT', () => {
    // buildApplyBody interpolates rather than parameterises, so this guard is
    // the escaping. These are the shapes that would otherwise reach it.
    expect(isValidMigrationFilename("20260907160000_x'; drop table y; --.sql")).toBe(false);
    expect(isValidMigrationFilename('20260907160000_Mixed_Case.sql')).toBe(false);
    expect(isValidMigrationFilename('2026090716000_too_short.sql')).toBe(false);
    expect(isValidMigrationFilename('20260907160000_ok_name.sql')).toBe(true);
  });

  it('refuses CONCURRENTLY, which cannot run inside the API transaction', () => {
    expect(hasConcurrently('create index concurrently idx on t (a);')).toBe(true);
    expect(hasConcurrently('CREATE INDEX CONCURRENTLY idx ON t (a);')).toBe(true);
  });

  it('does not trip on the word appearing only in a comment', () => {
    // The migration headers in this repo are long prose blocks; a rollback
    // note mentioning CONCURRENTLY must not block an otherwise fine file.
    expect(hasConcurrently('-- ROLLBACK: rebuild the index CONCURRENTLY by hand.\nselect 1;')).toBe(false);
  });
});

// The db-apply workflow reported FAIL after three migrations that had applied
// (runs 35930285975, 35930955395, 35937766770): the CLI prints `{rows: [...]}`
// only when it detects an AI agent, and a bare array on the Actions runner, so
// `parsed.rows ?? []` read every ledger and VERIFY result there as 0 rows.
describe('reading supabase db query JSON', () => {
  it('pins --agent no, so the output shape does not depend on who runs it', () => {
    const args = linkedQueryArgs('select 1;');
    expect(args.slice(0, 3)).toEqual(['db', 'query', '--linked']);
    expect(args[args.indexOf('--agent') + 1]).toBe('no');
    expect(args[args.indexOf('--output-format') + 1]).toBe('json');
    expect(args.at(-1)).toBe('select 1;');
  });

  it('reads the bare array a non-agent run prints (the CI shape)', () => {
    expect(parseQueryRows('[\n  {\n    "version": "20260922120000"\n  }\n]\n')).toEqual([
      { version: '20260922120000' },
    ]);
  });

  it('reads the {rows} envelope an agent-detected run prints', () => {
    const raw = JSON.stringify({ boundary: 'abc', rows: [{ '?column?': 1 }], warning: 'untrusted' });
    expect(parseQueryRows(raw)).toEqual([{ '?column?': 1 }]);
  });

  it('returns [] only for a genuinely empty result', () => {
    expect(parseQueryRows('[]\n')).toEqual([]);
    expect(parseQueryRows(JSON.stringify({ boundary: 'abc', rows: [], warning: 'w' }))).toEqual([]);
  });

  it('throws on an error document instead of reading it as zero rows', () => {
    // Zero rows is a PASS for the preflight ledger check, so any unrecognised
    // shape defaulting to [] would let a version already in the ledger through.
    const err = '{"_tag":"Error","error":{"code":"LegacyDbConnectError","message":"failed to connect"}}';
    expect(() => parseQueryRows(err)).toThrow(/unexpected response shape/);
    expect(() => parseQueryRows('{"rows": null}')).toThrow(/unexpected response shape/);
    expect(() => parseQueryRows('SELECT 1')).toThrow(/did not return JSON/);
    expect(() => parseQueryRows('')).toThrow(/did not return JSON/);
  });

  it('is the only way apply.mjs and seed-from-prod.mjs read query output', () => {
    for (const rel of ['scripts/db/apply.mjs', 'scripts/db/seed-from-prod.mjs']) {
      const code = readFileSync(resolve(REPO_ROOT, rel), 'utf-8')
        .split('\n')
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .join('\n');
      expect(code, rel).not.toMatch(/\.rows\b/);
      expect(code, rel).not.toContain("'--output-format'");
      expect(code, rel).toContain('linkedQueryArgs(');
      expect(code, rel).toContain('parseQueryRows(');
    }
  });
});
