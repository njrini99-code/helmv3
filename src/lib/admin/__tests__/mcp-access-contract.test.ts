/**
 * `.claude/rules/shipping.md` is loaded every session and is the ONLY place the
 * repo describes MCP access. That makes one sentence in it load-bearing.
 *
 * WHAT WENT WRONG, 2026-08-29. The file said:
 *
 *     `.mcp.json` declares exactly one server
 *
 * True of the file. Read as "one MCP server exists" — and nothing anywhere
 * corrected it, because a grep for "Sentry MCP" across the whole repo returned
 * nothing. So the working model became: MCP means Supabase, everything else is
 * env credentials.
 *
 * ET-4 then sat blocked for two days on "we cannot reach Sentry without a
 * token", while an authenticated Sentry MCP was available the entire time. The
 * `.env.local` Sentry credentials that model pointed at turn out to be invalid
 * placeholders, so the fallback it implied did not work either.
 *
 * It is this program's own pattern, aimed at itself: a narrowly-true statement
 * read as a stronger claim.
 *
 * WHAT THIS TEST IS. Prose assertions are weak, so this checks only the two
 * things that actually carry the meaning: that the one-server claim is scoped
 * to the repo, and that Sentry's real access path is named somewhere a session
 * will see it. It cannot prove the docs are good — only that this specific
 * correction has not been reverted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SHIPPING = resolve(__dirname, '../../../../.claude/rules/shipping.md');
const text = readFileSync(SHIPPING, 'utf-8');

describe('MCP access documentation — the repo file is not the tool inventory', () => {
  it('has the section at all (guards the fixture itself)', () => {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain('.mcp.json');
  });

  it('never claims one server exists without scoping it to this repo', () => {
    // The exact unscoped sentence that caused it. If it returns, so does the
    // wrong model.
    expect(text).not.toMatch(/`\.mcp\.json` declares exactly one server,/);
    expect(text).toMatch(/declares exactly one server\s*\n?\*in this repo\*/);
  });

  it('says explicitly that account-level connectors are not listed here', () => {
    expect(text).toMatch(/is not the list of MCP tools you have/i);
  });

  it('names the Sentry MCP as the working Sentry read path', () => {
    expect(text).toMatch(/Sentry MCP/);
    expect(text).toContain('helm-xs');
  });

  it('records that the local .env.local Sentry credentials do not work', () => {
    // Without this, the next session re-derives the 401 from scratch.
    expect(text).toMatch(/Invalid token|NOT usable/);
    expect(text).toContain('usableSecret');
  });
});
