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
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildApplyBody,
  extractVerifyQueries,
  hasConcurrently,
  isValidMigrationFilename,
} from '../db/apply.mjs';

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

describe('extractVerifyQueries joins continuation lines', () => {
  it('joins a query split across lines into ONE statement', () => {
    const q = extractVerifyQueries(
      ['-- VERIFY: select 1 from pg_proc p', "-- VERIFY:  where p.proname = 'x';"].join('\n'),
    );
    expect(q).toEqual(["select 1 from pg_proc p where p.proname = 'x';"]);
  });

  it('separates queries at the semicolon, not at the newline', () => {
    const q = extractVerifyQueries(
      ['-- VERIFY: select 1', '-- VERIFY:  from a;', '-- VERIFY: select 2', '-- VERIFY:  from b;'].join('\n'),
    );
    expect(q).toEqual(['select 1 from a;', 'select 2 from b;']);
  });

  it('emits an unterminated trailing fragment so a malformed block fails loudly', () => {
    // Swallowing it would turn a broken VERIFY into a silently passing gate,
    // which is the failure class this whole function exists to close.
    expect(extractVerifyQueries('-- VERIFY: select 1 from a')).toEqual(['select 1 from a']);
  });

  it('extracts the real migration as 3 queries, not 13 fragments', () => {
    const text = readFileSync(
      resolve(REPO_ROOT, 'supabase/migrations/20260907160000_golf_team_chat_membership_management.sql'),
      'utf-8',
    );
    expect(extractVerifyQueries(text)).toHaveLength(3);
  });
});

describe('-- VERIFY: blocks are whole queries, repo-wide', () => {
  // apply.mjs extracts ONE QUERY PER LINE. A VERIFY block written across
  // continuation lines therefore becomes fragments: measured on
  // 20260907160000 before this was fixed, 3 intended queries became 13
  // fragments, 10 of them syntax errors — and fragment 1
  // (`select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace`)
  // returned thousands of rows and PASSED while verifying nothing.
  //
  // The consequence is the worst shape a gate can have: production commits
  // correctly, then the run reports FAIL with a ROLLBACK recipe in the header.
  const dir = resolve(REPO_ROOT, 'supabase/migrations');
  const files = readdirSync(dir).filter((f) => /^\d{14}_.*\.sql$/.test(f));

  const withVerify = files
    .map((f) => ({ file: f, queries: extractVerifyQueries(readFileSync(resolve(dir, f), 'utf-8')) }))
    .filter((x) => x.queries.length > 0);

  it('finds migrations carrying VERIFY blocks (else this suite proves nothing)', () => {
    expect(withVerify.length).toBeGreaterThan(0);
  });

  it.each(withVerify)('$file: every extracted VERIFY is one complete statement', ({ queries }) => {
    for (const q of queries) {
      expect(q, `not terminated — this is a continuation fragment: ${q}`).toMatch(/;$/);
      expect(q.split(';').length - 1, `more than one statement: ${q}`).toBe(1);
      expect(q.toLowerCase(), `does not start a statement: ${q}`).toMatch(/^\s*(select|with)\b/);
    }
  });
});
