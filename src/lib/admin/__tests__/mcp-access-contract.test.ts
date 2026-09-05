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

  it('records what a 401 from the local Sentry token means', () => {
    // Until 2026-09-03 the .env.local Sentry values were placeholders that
    // passed usableSecret(); since then they are real and can rotate. Either
    // way the next session must not re-derive the 401 from scratch.
    expect(text).toMatch(/Invalid token/);
    expect(text).toMatch(/rotate/);
    expect(text).toContain('usableSecret');
  });
});

/**
 * 2026-08-29, second finding in the same file. `AGENTS.md` said Supabase MCP
 * access "must remain project-scoped and read-only" while
 * `~/.claude/settings.json` separately authorized applying production
 * migrations through MCP. Both were in force and they contradicted, so neither
 * was enforced — and six ALLOW rules granting `apply_migration`/`execute_sql`
 * across THREE Supabase namespaces sat unnoticed underneath, two of them for a
 * plugin that is not installed on this machine.
 *
 * Project-scope DENY beating user-scope ALLOW was verified by probe, not
 * assumed: exactly the ten denied tools left the tool set while `list_tables`
 * still loaded.
 *
 * Same limit as above — this cannot see user scope and does not try to. It
 * pins the deny entries that neutralise those grants for this repo, and the
 * AGENTS.md sentence that names which namespace is sanctioned.
 */
const SETTINGS = resolve(__dirname, '../../../../.claude/settings.json');
const AGENTS = resolve(__dirname, '../../../../AGENTS.md');

describe('Supabase MCP is consolidated to one sanctioned namespace', () => {
  const deny: string[] = JSON.parse(readFileSync(SETTINGS, 'utf-8')).permissions.deny;
  const agents = readFileSync(AGENTS, 'utf-8');

  it('denies every project-mutating tool on the account-wide connector', () => {
    // The owner authorized migrations on mcp__supabase__* — the project-scoped
    // server — and nothing else. These ten were never authorized anywhere, and
    // several are account-level rather than project-level.
    const mutating = [
      'apply_migration',
      'create_branch',
      'create_project',
      'delete_branch',
      'deploy_edge_function',
      'merge_branch',
      'pause_project',
      'rebase_branch',
      'reset_branch',
      'restore_project',
    ];
    const missing = mutating
      .map((t) => `mcp__claude_ai_Supabase__${t}`)
      .filter((rule) => !deny.includes(rule));
    expect(missing, 'account-wide Supabase MCP tools left un-denied').toEqual([]);
  });

  it('denies the plugin namespace that was pre-authorized while absent', () => {
    // mcp__plugin_supabase_supabase__{apply_migration,execute_sql} were ALLOW
    // at user scope with no such plugin installed — a grant that would have
    // activated the moment anyone installed it. Denied at server level so a
    // future tool in that namespace cannot inherit the grant either.
    expect(deny).toContain('mcp__plugin_supabase_supabase');
  });

  it('keeps the account connector readable — it is the only one that works', () => {
    // #1671 was about a document killing the working path. Not repeating it.
    for (const readTool of ['list_tables', 'list_migrations', 'get_advisors', 'execute_sql']) {
      expect(deny).not.toContain(`mcp__claude_ai_Supabase__${readTool}`);
    }
  });

  it('AGENTS.md names the sanctioned namespace instead of an unenforced absolute', () => {
    expect(agents).toContain('mcp__supabase__*');
    expect(agents).toMatch(/owner-authorized|owner-authorised/i);
    // The bare absolute is what contradicted the live grant.
    expect(agents).not.toMatch(
      /Production Supabase MCP access must remain project-scoped and read-only\./,
    );
  });
});
