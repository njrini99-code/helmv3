#!/usr/bin/env node
// Settings ownership — three drift classes that each cost this repo real
// incidents (shipping.md §1b, §4; AGENTS.md's MCP-deny history):
//
//   (a) user-scope-repo-leak          ~/.claude/settings.json (every project,
//                                     every session on this machine) names a
//                                     repo-specific tool, path, or a
//                                     connector id config/mcp-connector-ids
//                                     .json marks repo-scoped. A HELMv3-only
//                                     decision baked into user scope has a
//                                     blast radius of every other repo this
//                                     machine touches.
//   (b) project-uninstalled-plugin    .claude/settings.json or
//                                     .claude/settings.local.json allow/deny
//                                     a `mcp__plugin_<name>_<name>[__tool]`
//                                     namespace for a plugin that is not
//                                     actually installed
//                                     (~/.claude/plugins/installed_plugins
//                                     .json, or `claude plugin list` as a
//                                     fallback). A rule gating a plugin that
//                                     was never installed governs nothing —
//                                     it is a sentence, not a control, and it
//                                     hides the fact that removing a plugin
//                                     never removed its permission rows
//                                     (AGENTS.md F108: desktop-commander,
//                                     prospect-scraper).
//   (c) rule-unrecorded-connector-id  AGENTS.md / CLAUDE.md / .claude/rules/
//                                     *.md names an account-connector tool
//                                     (`mcp__<uuid>__...`) whose id is absent
//                                     from config/mcp-connector-ids.json —
//                                     the one place those rotatable ids are
//                                     recorded and cross-checked against the
//                                     live deny rules
//                                     (MCP_DENY_RULES_KEYED_ON_ROTATABLE_
//                                     CONNECTOR_IDS). A rule naming an id
//                                     nothing has recorded cannot be reasoned
//                                     about when the id rotates.
//
// Wired into `npm run repo:doctor` (scripts/repo-doctor/cli.mjs MODULES).
// Runs standalone too: `node scripts/check-settings-ownership.mjs`.
//
// Every branch that cannot establish ground truth (an unreadable file, no
// `claude` CLI, no plugin manifest) reports WARN or UNKNOWN — never FAIL.
// Manufacturing a false positive from an absent read is worse than not
// checking at all; the task spec is explicit about this for (b), and the
// same principle applies to (a) and (c).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { check, Status } from './repo-doctor/result.mjs';

export const meta = { id: 'settings-ownership', title: 'Settings ownership (user vs. project scope)' };

const REPO_MARKERS = ['helmv3', 'helm_', 'golf_', 'baseball_'];
const UUID_TOOL_RE = /mcp__([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})__[a-zA-Z0-9_]+/g;

function readJsonSafe(p) {
  if (!existsSync(p)) return { ok: false, missing: true };
  try {
    return { ok: true, value: JSON.parse(readFileSync(p, 'utf-8')) };
  } catch (err) {
    return { ok: false, missing: false, error: String(err) };
  }
}

function spawnSyncSafe(cmd, args, opts = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf-8', timeout: 3000, ...opts });
    if (r.error || r.status !== 0) return { ok: false, error: r.error?.message ?? `exit ${r.status}` };
    return { ok: true, stdout: r.stdout };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Collect string values ONLY from the governance surfaces that actually
 * DECIDE something — permission rules, hook commands, and env vars — not
 * from every string in the file. `sandbox.filesystem` and `autoMode.*` are
 * deliberately excluded: they are user-scope BY DESIGN (the sandbox has to
 * name real per-machine paths, and autoMode's `environment` array is
 * documentation the classifier reads, not a rule that executes) and naming
 * this repo there is the intended, harmless case, not the leak this check
 * exists to catch. A first draft recursed the whole settings tree and
 * produced 18 hits — sandbox path entries and autoMode prose — none of which
 * was an actionable rule; narrowing to the surfaces below is what makes a
 * FAIL here mean something.
 */
function collectGovernanceStrings(settings) {
  const out = [];
  for (const bucket of ['allow', 'deny']) {
    for (const [i, rule] of (settings?.permissions?.[bucket] ?? []).entries()) {
      if (typeof rule === 'string') out.push({ path: `permissions.${bucket}[${i}]`, value: rule });
    }
  }
  for (const [event, entries] of Object.entries(settings?.hooks ?? {})) {
    for (const [ei, entry] of (entries ?? []).entries()) {
      for (const [hi, h] of (entry?.hooks ?? []).entries()) {
        if (typeof h?.command === 'string') out.push({ path: `hooks.${event}[${ei}].hooks[${hi}].command`, value: h.command });
      }
      if (typeof entry?.matcher === 'string') out.push({ path: `hooks.${event}[${ei}].matcher`, value: entry.matcher });
    }
  }
  for (const [k, v] of Object.entries(settings?.env ?? {})) {
    if (typeof v === 'string') out.push({ path: `env.${k}`, value: v });
  }
  return out;
}

/**
 * (a) User-scope repo leak. Pure and testable: hand it the parsed settings
 * object, a marker list, a repo-scoped connector id set, and (optionally) the
 * literal repo root path.
 */
export function findUserScopeLeaks(userSettings, { markers = REPO_MARKERS, repoScopedConnectorIds = new Set(), repoRoot } = {}) {
  const strings = collectGovernanceStrings(userSettings);
  const hits = [];
  for (const { path, value } of strings) {
    if (typeof value !== 'string') continue;
    const markerHit = markers.find((m) => value.includes(m));
    if (markerHit) {
      hits.push({ path, value, reason: `contains "${markerHit}"` });
      continue;
    }
    if (repoRoot && value.includes(repoRoot)) {
      hits.push({ path, value, reason: 'contains the repo path' });
      continue;
    }
    const m = value.match(/mcp__([0-9a-f-]{36})__/);
    if (m && repoScopedConnectorIds.has(m[1])) {
      hits.push({ path, value, reason: `mcp connector ${m[1]} is marked repo-scoped` });
    }
  }
  return hits;
}

/**
 * (b) Project-scope rules gating a plugin namespace that is not installed.
 *
 * The observed naming convention is `mcp__plugin_<a>_<b>` (optionally
 * followed by `__<tool>`), and `<a>`/`<b>` are not always identical
 * (`vercel_vercel` vs. `vercel-plugin_vercel`) — so a rule is flagged only
 * when NEITHER segment names an installed plugin. One matching segment is
 * treated as enough evidence the rule still refers to something real; this
 * under-flags an ambiguous rename over over-flagging a live plugin.
 */
export function findUninstalledPluginRules(projectSettings, installedPluginNames) {
  const installed = new Set(installedPluginNames);
  const out = [];
  for (const bucket of ['allow', 'deny']) {
    for (const rule of projectSettings?.permissions?.[bucket] ?? []) {
      const m = /^mcp__plugin_([a-z0-9-]+(?:_[a-z0-9-]+)*?)(?:__|$)/i.exec(rule);
      if (!m) continue;
      const segments = m[1].split('_');
      if (!segments.some((seg) => installed.has(seg))) out.push({ bucket, rule, segments });
    }
  }
  return out;
}

/**
 * (c) Rule-file references to an account-connector tool whose id is absent
 * from config/mcp-connector-ids.json. Only UUID-shaped ids are in scope —
 * this repo's own declared `.mcp.json` servers are named plainly and are not
 * rotatable account connectors.
 */
export function findUnrecordedConnectorIds(fileContents, recordedIds) {
  const recorded = new Set(recordedIds);
  const out = [];
  for (const { file, content } of fileContents) {
    const seen = new Set();
    for (const m of content.matchAll(UUID_TOOL_RE)) {
      const id = m[1];
      if (recorded.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ file, id });
    }
  }
  return out;
}

export async function run(ctx) {
  const out = [];
  const { repoRoot } = ctx;
  const homeDir = ctx.homeDir ?? homedir();

  const connectorsPath = join(repoRoot, 'config', 'mcp-connector-ids.json');
  const connectorsR = readJsonSafe(connectorsPath);
  const repoScopedIds = new Set(
    (connectorsR.ok ? connectorsR.value.connectors ?? [] : [])
      .filter((c) => c.repo_scoped === true)
      .map((c) => c.id),
  );

  // --- (a) user scope ---
  const userPath = join(homeDir, '.claude', 'settings.json');
  const userR = readJsonSafe(userPath);
  if (!userR.ok) {
    out.push(
      check('settings-ownership.user-scope-repo-leak', userR.missing ? Status.PASS : Status.UNKNOWN,
        userR.missing ? 'no user-scope settings.json to check' : 'user-scope settings.json unreadable', { detail: userR.error }),
    );
  } else {
    const hits = findUserScopeLeaks(userR.value, { repoScopedConnectorIds: repoScopedIds, repoRoot });
    out.push(
      hits.length === 0
        ? check('settings-ownership.user-scope-repo-leak', Status.PASS, 'user-scope settings.json names no repo-specific tool or path')
        : check('settings-ownership.user-scope-repo-leak', Status.FAIL,
            `${hits.length} user-scope entr${hits.length === 1 ? 'y names' : 'ies name'} repo-specific state — a global blast radius for a local decision`, {
              evidence: hits.slice(0, 20),
              source: userPath,
            }),
    );
  }

  // --- (b) project scope ---
  const projectPaths = [join(repoRoot, '.claude', 'settings.json'), join(repoRoot, '.claude', 'settings.local.json')];
  const pluginsManifest = readJsonSafe(join(homeDir, '.claude', 'plugins', 'installed_plugins.json'));
  let installedNames = null;
  let installedSource = null;
  if (pluginsManifest.ok) {
    installedNames = Object.keys(pluginsManifest.value?.plugins ?? {}).map((k) => k.split('@')[0]);
    installedSource = '~/.claude/plugins/installed_plugins.json';
  } else {
    const r = spawnSyncSafe('claude', ['plugin', 'list', '--json']);
    if (r.ok) {
      try {
        const parsed = JSON.parse(r.stdout);
        const list = Array.isArray(parsed) ? parsed : (parsed.plugins ?? []);
        installedNames = list.map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean).map((n) => String(n).split('@')[0]);
        installedSource = '`claude plugin list --json`';
      } catch {
        /* leave installedNames null — falls through to WARN below */
      }
    }
  }

  if (installedNames === null) {
    out.push(
      check('settings-ownership.project-uninstalled-plugin', Status.WARN,
        'could not read ~/.claude/plugins/installed_plugins.json or `claude plugin list --json` — plugin-namespace rules were not checked', {
          detail: `manifest: ${pluginsManifest.error ?? 'missing'}; claude CLI unavailable or produced unparsable output`,
        }),
    );
  } else {
    const allHits = [];
    for (const p of projectPaths) {
      const r = readJsonSafe(p);
      if (!r.ok) continue;
      for (const hit of findUninstalledPluginRules(r.value, installedNames)) allHits.push({ file: p.replace(repoRoot + '/', ''), ...hit });
    }
    out.push(
      allHits.length === 0
        ? check('settings-ownership.project-uninstalled-plugin', Status.PASS, `no project-scope rule gates an uninstalled plugin namespace (checked against ${installedSource})`)
        : check('settings-ownership.project-uninstalled-plugin', Status.FAIL,
            `${allHits.length} project-scope rule(s) gate a plugin namespace that is not installed`, {
              evidence: allHits.slice(0, 20),
              source: installedSource,
            }),
    );
  }

  // --- (c) rule files ---
  const ruleFiles = [];
  for (const rel of ['AGENTS.md', 'CLAUDE.md']) {
    const p = join(repoRoot, rel);
    if (existsSync(p)) ruleFiles.push({ file: rel, content: readFileSync(p, 'utf-8') });
  }
  const rulesDir = join(repoRoot, '.claude', 'rules');
  if (existsSync(rulesDir)) {
    for (const name of readdirSync(rulesDir).filter((n) => n.endsWith('.md'))) {
      ruleFiles.push({ file: `.claude/rules/${name}`, content: readFileSync(join(rulesDir, name), 'utf-8') });
    }
  }

  if (!connectorsR.ok) {
    out.push(
      check('settings-ownership.rule-unrecorded-connector-id', connectorsR.missing ? Status.WARN : Status.UNKNOWN,
        connectorsR.missing
          ? 'config/mcp-connector-ids.json is missing — rule files could not be checked against a recorded connector-id set'
          : 'config/mcp-connector-ids.json is unreadable', { detail: connectorsR.error }),
    );
  } else {
    const recordedIds = (connectorsR.value.connectors ?? []).map((c) => c.id);
    const misses = findUnrecordedConnectorIds(ruleFiles, recordedIds);
    out.push(
      misses.length === 0
        ? check('settings-ownership.rule-unrecorded-connector-id', Status.PASS,
            'every mcp__<uuid>__ reference in a rule file is recorded in config/mcp-connector-ids.json')
        : check('settings-ownership.rule-unrecorded-connector-id', Status.FAIL,
            `${misses.length} rule-file reference(s) name a connector id absent from config/mcp-connector-ids.json`, {
              evidence: misses,
              source: 'config/mcp-connector-ids.json',
            }),
    );
  }

  return out;
}

async function main() {
  const repoRoot = process.cwd();
  const results = await run({ repoRoot });
  for (const r of results) {
    console.log(`${r.status.padEnd(8)} ${r.id}: ${r.title}`);
    if (r.evidence) console.log(`         ${JSON.stringify(r.evidence)}`);
  }
  const failed = results.some((r) => r.status === Status.FAIL);
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
