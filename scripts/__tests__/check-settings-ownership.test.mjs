// Settings ownership (A6 "so it does not happen again"): a repo-specific
// permission rule in USER scope has a blast radius of every other repo this
// machine touches; a project-scope rule gating an uninstalled plugin
// namespace governs nothing; a rule file naming an unrecorded connector id
// cannot be reasoned about when that id rotates. Each pure classifier is
// tested directly (no real $HOME touched), plus one end-to-end run() pass
// against tmp fixtures proving the whole module wires together and degrades
// to WARN/UNKNOWN — never a manufactured FAIL — when state is absent.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  findUserScopeLeaks,
  findUninstalledPluginRules,
  findUnrecordedConnectorIds,
  run,
} from '../check-settings-ownership.mjs';
import { Status } from '../repo-doctor/result.mjs';

describe('findUserScopeLeaks', () => {
  it('flags a repo-marker inside a permission rule', () => {
    const hits = findUserScopeLeaks({ permissions: { allow: ['Bash(node scripts/x.mjs) # golf_teams'], deny: [] } });
    expect(hits).toHaveLength(1);
    expect(hits[0].reason).toContain('golf_');
  });
  it('flags a hook command path naming the repo', () => {
    const hits = findUserScopeLeaks({
      hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ command: 'node /Users/x/helmv3/.claude/hooks/guard.mjs' }] }] },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe('hooks.PreToolUse[0].hooks[0].command');
  });
  it('flags an env var containing the literal repo root path', () => {
    const hits = findUserScopeLeaks({ env: { SOME_VAR: '/Users/me/Downloads/helmv3/scratch' } }, { repoRoot: '/Users/me/Downloads/helmv3' });
    expect(hits.length).toBeGreaterThan(0);
  });
  it('flags an mcp__<uuid>__ rule whose connector id is marked repo-scoped', () => {
    const id = 'e139bbde-4728-4ed3-977f-7b1b22f4b69c';
    const hits = findUserScopeLeaks(
      { permissions: { allow: [`mcp__${id}__list_tables`], deny: [] } },
      { repoScopedConnectorIds: new Set([id]) },
    );
    expect(hits).toHaveLength(1);
  });
  it('does NOT flag sandbox.filesystem or autoMode prose naming the repo — those are user-scope by design', () => {
    const hits = findUserScopeLeaks({
      sandbox: { filesystem: { write: { allowOnly: ['/Users/x/Downloads/helmv3/src'] } } },
      autoMode: { environment: ['Organization: github.com/njrini99-code/helmv3'] },
    });
    expect(hits).toHaveLength(0);
  });
  it('clean settings produce no hits', () => {
    expect(findUserScopeLeaks({ permissions: { allow: ['Bash(git status:*)'], deny: [] } })).toHaveLength(0);
  });
});

describe('findUninstalledPluginRules', () => {
  const installed = ['supabase', 'sentry', 'vercel'];
  it('flags a plugin namespace rule for a plugin that is not installed', () => {
    const hits = findUninstalledPluginRules(
      { permissions: { deny: ['mcp__plugin_desktop-commander_desktop-commander__write_file'], allow: [] } },
      installed,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].segments).toEqual(['desktop-commander', 'desktop-commander']);
  });
  it('does not flag a rule when either segment matches an installed plugin', () => {
    const hits = findUninstalledPluginRules({ permissions: { deny: ['mcp__plugin_vercel-plugin_vercel'], allow: [] } }, installed);
    expect(hits).toHaveLength(0);
  });
  it('does not flag a non-plugin-namespace rule', () => {
    const hits = findUninstalledPluginRules({ permissions: { allow: ['Bash(git status:*)'], deny: [] } }, installed);
    expect(hits).toHaveLength(0);
  });
  it('matches both allow and deny buckets', () => {
    const hits = findUninstalledPluginRules(
      { permissions: { allow: ['mcp__plugin_ghost_ghost__do_thing'], deny: ['mcp__plugin_ghost_ghost__do_other'] } },
      installed,
    );
    expect(hits).toHaveLength(2);
  });
});

describe('findUnrecordedConnectorIds', () => {
  const recorded = ['e139bbde-4728-4ed3-977f-7b1b22f4b69c'];
  it('flags a UUID-shaped mcp tool reference absent from the recorded set', () => {
    const misses = findUnrecordedConnectorIds(
      [{ file: 'AGENTS.md', content: 'Use mcp__ffffffff-ffff-ffff-ffff-ffffffffffff__do_thing for X.' }],
      recorded,
    );
    expect(misses).toHaveLength(1);
    expect(misses[0].id).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
  });
  it('does not flag a recorded id', () => {
    const misses = findUnrecordedConnectorIds(
      [{ file: 'AGENTS.md', content: 'Use mcp__e139bbde-4728-4ed3-977f-7b1b22f4b69c__list_tables.' }],
      recorded,
    );
    expect(misses).toHaveLength(0);
  });
  it('does not flag a plain display-name mcp tool (no UUID shape)', () => {
    const misses = findUnrecordedConnectorIds([{ file: 'AGENTS.md', content: 'Use mcp__supabase__list_tables.' }], recorded);
    expect(misses).toHaveLength(0);
  });
  it('de-duplicates repeated references to the same missing id within one file', () => {
    const misses = findUnrecordedConnectorIds(
      [{ file: 'x.md', content: 'mcp__ffffffff-ffff-ffff-ffff-ffffffffffff__a and mcp__ffffffff-ffff-ffff-ffff-ffffffffffff__b' }],
      recorded,
    );
    expect(misses).toHaveLength(1);
  });
});

describe('run() — end to end against tmp fixtures', () => {
  let repo;
  let home;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'a6-repo-'));
    home = mkdtempSync(join(tmpdir(), 'a6-home-'));
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  const byId = (results, id) => results.find((r) => r.id === id);

  it('degrades to PASS/WARN, never a manufactured FAIL, when nothing is present', async () => {
    const results = await run({ repoRoot: repo, homeDir: home });
    for (const r of results) expect(r.status).not.toBe(Status.FAIL);
    expect(byId(results, 'settings-ownership.user-scope-repo-leak').status).toBe(Status.PASS);
    expect(byId(results, 'settings-ownership.rule-unrecorded-connector-id').status).toBe(Status.WARN);
  });

  it('FAILs settings-ownership.user-scope-repo-leak on a seeded repo-specific rule', async () => {
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(
      join(home, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Bash(node scripts/schema.mjs:*) # helm_ specific'], deny: [] } }),
    );
    const results = await run({ repoRoot: repo, homeDir: home });
    expect(byId(results, 'settings-ownership.user-scope-repo-leak').status).toBe(Status.FAIL);
  });

  it('FAILs settings-ownership.rule-unrecorded-connector-id on a seeded unrecorded id', async () => {
    mkdirSync(join(repo, 'config'), { recursive: true });
    writeFileSync(
      join(repo, 'config', 'mcp-connector-ids.json'),
      JSON.stringify({ connectors: [{ service: 'X', id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }] }),
    );
    writeFileSync(join(repo, 'AGENTS.md'), 'Use mcp__bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb__list_things for X.');
    const results = await run({ repoRoot: repo, homeDir: home });
    expect(byId(results, 'settings-ownership.rule-unrecorded-connector-id').status).toBe(Status.FAIL);
  });

  it('FAILs settings-ownership.project-uninstalled-plugin when the manifest names the plugin as absent', async () => {
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true });
    writeFileSync(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'vercel@claude-plugins-official': [] } }),
    );
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(
      join(repo, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { deny: ['mcp__plugin_ghost_ghost__do_thing'], allow: [] } }),
    );
    const results = await run({ repoRoot: repo, homeDir: home });
    expect(byId(results, 'settings-ownership.project-uninstalled-plugin').status).toBe(Status.FAIL);
  });

  it('WARNs (never FAILs) project-uninstalled-plugin when no plugin inventory can be read', async () => {
    // No ~/.claude/plugins manifest, and PATH is cleared so a `claude` binary
    // (if one exists on the real machine running this test) cannot be found —
    // this must degrade to WARN, not silently skip and not FAIL.
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(join(repo, '.claude', 'settings.json'), JSON.stringify({ permissions: { deny: [], allow: [] } }));
    const originalPath = process.env.PATH;
    process.env.PATH = '';
    try {
      const results = await run({ repoRoot: repo, homeDir: home });
      expect(byId(results, 'settings-ownership.project-uninstalled-plugin').status).toBe(Status.WARN);
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
