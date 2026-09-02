#!/usr/bin/env node
/**
 * Generate docs/TOOL_AUTHORITY_MATRIX.md, and expire runtime evidence when the
 * configuration that produced it changes.
 *
 * THE PROBLEM THIS SOLVES
 *
 * "EXERCISED on 2026-08-29" cannot stay authoritative forever. If someone edits
 * the deny rules, or .mcp.json, or a grant, the old observation describes a
 * system that no longer exists — and a stale PASS is worse than no PASS,
 * because it is trusted.
 *
 * So every observation carries a fingerprint of the configuration that
 * determines that capability. When the fingerprint moves, EXERCISED becomes
 * STALE automatically. Nobody has to remember to invalidate it.
 *
 *     A statement that was true is not a statement that is true.
 *
 * FIVE COLUMNS, NEVER COLLAPSED
 *
 *   CONFIGURED  a file declares it
 *   CONNECTED   the server answered at all
 *   EXPOSED     its real tools are present, not just `authenticate`
 *   ALLOWED     permission rules permit calling it
 *   EXERCISED   someone actually called it and it worked
 *
 * ET-4 lost two days to reading CONFIGURED as "that is all there is".
 *
 * Usage: node scripts/gen-tool-authority.mjs [--check]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DECL = resolve(ROOT, 'config/tool-authority.json');
const OBS = resolve(ROOT, 'config/control-plane-observations.json');
const SETTINGS = resolve(ROOT, '.claude/settings.json');
const MCP = resolve(ROOT, '.mcp.json');
const OUT = resolve(ROOT, 'docs/TOOL_AUTHORITY_MATRIX.md');

const START = '<!-- AUTOGEN:tool-authority:start -->';
const END = '<!-- AUTOGEN:tool-authority:end -->';

/** Namespace prefixes that belong to each service, for slicing config. */
const SERVICE_KEYS = {
  Supabase: ['supabase', 'Supabase'],
  Sentry: ['sentry', 'Sentry'],
  Vercel: ['vercel', 'Vercel'],
  GitHub: ['github', 'GitHub'],
};

/**
 * The configuration that determines a service's capability, hashed.
 *
 * Deliberately narrow: only the rules and declarations that could change what
 * this service can do. A fingerprint over the whole settings file would go
 * stale on every unrelated edit and train people to ignore STALE.
 */
export function fingerprintFor(service, { settings, mcp }) {
  const keys = SERVICE_KEYS[service] ?? [service.toLowerCase()];
  const match = (s) => keys.some((k) => String(s).includes(k));
  const perms = settings?.permissions ?? {};
  const slice = {
    allow: (perms.allow ?? []).filter(match).sort(),
    deny: (perms.deny ?? []).filter(match).sort(),
    ask: (perms.ask ?? []).filter(match).sort(),
    mcpServers: Object.entries(mcp?.mcpServers ?? {})
      .filter(([name, cfg]) => match(name) || match(JSON.stringify(cfg)))
      .sort(([a], [b]) => a.localeCompare(b)),
  };
  // The service name is part of the hash so two services whose slices are both
  // EMPTY do not collide — measured: Sentry and GitHub produced an identical
  // fingerprint before this, which would have made drift undetectable for both.
  const governed =
    slice.allow.length + slice.deny.length + slice.ask.length + slice.mcpServers.length > 0;
  const digest = createHash('sha256')
    .update(JSON.stringify({ service, slice }))
    .digest('hex')
    .slice(0, 16);
  return governed ? digest : `ungoverned:${digest.slice(0, 8)}`;
}

/**
 * True when NO configuration in this repo governs the service's capability.
 * For such a service the fingerprint cannot detect drift, because there is
 * nothing here to drift — say so rather than implying coverage.
 */
export function isUngoverned(fingerprint) {
  return String(fingerprint).startsWith('ungoverned:');
}

/**
 * Resolve one observation against the CURRENT fingerprint.
 * Returns EXERCISED only when the world has not moved underneath it.
 */
export function resolveObservation(obs, currentFingerprint) {
  if (!obs) return { state: 'NEVER', detail: 'no behavioral observation recorded' };
  if (obs.configuration_fingerprint !== currentFingerprint) {
    return {
      state: 'STALE',
      detail: `observed ${obs.observed_at} under config ${obs.configuration_fingerprint}; config is now ${currentFingerprint}`,
    };
  }
  // Preserve the recorded result verbatim for anything that is not a plain
  // pass/fail. A first draft folded DENIED_BY_POLICY and NOT_EXERCISED into
  // "FAILED", which reads as "we tried and it broke" — untrue of both, and
  // exactly the kind of collapse this document exists to prevent.
  const state =
    obs.result === 'PASS' ? 'EXERCISED' : obs.result === 'FAIL' ? 'FAILED' : obs.result;
  return { state, detail: `${obs.observed_at} — ${obs.evidence ?? obs.result}` };
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

export function renderBlock() {
  const decl = JSON.parse(readFileSync(DECL, 'utf-8'));
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf-8'));
  const mcp = existsSync(MCP) ? JSON.parse(readFileSync(MCP, 'utf-8')) : {};
  const observations = existsSync(OBS) ? JSON.parse(readFileSync(OBS, 'utf-8')).observations ?? [] : [];
  const deny = settings.permissions?.deny ?? [];

  const L = [''];
  L.push('## Authority per service');
  L.push('');
  L.push('| Service | Authority | Scope | Source | Runtime evidence |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const s of decl.services) {
    const fp = fingerprintFor(s.service, { settings, mcp });
    const obs = observations.find((o) => o.service === s.service && o.namespace === s.authority);
    const r = resolveObservation(obs, fp);
    L.push(`| ${esc(s.service)} | \`${esc(s.authority)}\` | ${esc(s.scope)} | ${esc(s.authoritySource)} | **${r.state}** — ${esc(r.detail)} |`);
  }

  L.push('');
  L.push('## Every namespace, classified');
  L.push('');
  L.push('| Namespace | Service | Disposition | Configured | Connected | Exposed | Allowed | Exercised |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of decl.services) {
    const fp = fingerprintFor(s.service, { settings, mcp });
    const rows = [{ namespace: s.authority, disposition: 'AUTHORITY' }, ...(s.alternates ?? [])];
    for (const row of rows) {
      const obs = observations.find((o) => o.service === s.service && o.namespace === row.namespace);
      const r = resolveObservation(obs, fp);
      // Only a SERVER-LEVEL deny disables a whole namespace. A first draft used
      // loose prefix matching, so a single denied tool
      // (mcp__claude_ai_Supabase__apply_migration) made the entire namespace
      // read DENIED — while execute_sql and every read remained allowed. The
      // per-tool picture belongs in the observation's `allowed` field, which
      // records it precisely.
      const root = row.namespace.replace(/\*$/, '').replace(/__$/, '');
      const whollyDenied = deny.includes(root) || deny.includes(`${root}__`);
      L.push(
        `| \`${esc(row.namespace)}\` | ${esc(s.service)} | ${esc(row.disposition)} | ${obs?.configured ?? '?'} | ${obs?.connected ?? '?'} | ${obs?.exposed ?? '?'} | ${whollyDenied ? 'DENIED (server-level)' : (obs?.allowed ?? '?')} | ${r.state} |`,
      );
    }
  }

  L.push('');
  L.push('## Why each non-authority namespace is where it is');
  L.push('');
  for (const s of decl.services) {
    for (const a of s.alternates ?? []) {
      L.push(`**\`${a.namespace}\`** — ${a.disposition}`);
      L.push('');
      L.push(a.reason);
      L.push('');
    }
  }

  L.push('## Configuration fingerprints');
  L.push('');
  L.push('An observation is only evidence about the configuration it was made under.');
  L.push('When a fingerprint changes, every EXERCISED claim under it becomes STALE.');
  L.push('');
  L.push('| Service | Fingerprint | Drift detectable? |');
  L.push('| --- | --- | --- |');
  for (const s of decl.services) {
    const f = fingerprintFor(s.service, { settings, mcp });
    L.push(
      `| ${esc(s.service)} | \`${f}\` | ${
        isUngoverned(f)
          ? '**NO** — no allow/deny/ask rule or `.mcp.json` entry in this repo governs it, so there is nothing here to fingerprint'
          : 'yes — derived from the allow/deny/ask rules and `.mcp.json` entries naming this service'
      } |`,
    );
  }
  L.push('');
  return L.join('\n');
}

function header() {
  return `<!-- markdownlint-disable MD013 -->

# Tool Authority Matrix

**Generated between the AUTOGEN markers** — \`node scripts/gen-tool-authority.mjs\`
rebuilds them from \`config/tool-authority.json\`,
\`config/control-plane-observations.json\`, \`.claude/settings.json\` and
\`.mcp.json\`.

These five words are **not** synonyms, and this document exists because they
were treated as one:

| | meaning |
| --- | --- |
| CONFIGURED | a file declares it |
| CONNECTED | the server answered at all |
| EXPOSED | its real tools are present, not just \`authenticate\` |
| ALLOWED | permission rules permit calling it |
| EXERCISED | someone actually called it and it worked |

ET-4 sat blocked for two days on "we cannot reach Sentry without a token" while
an authenticated Sentry MCP was connected the entire time. The cause was one
sentence that was true of a file being read as a claim about the world (#1671).

**Runtime evidence expires.** Each observation records the fingerprint of the
configuration that produced it. Change a deny rule, a grant, or \`.mcp.json\`,
and the matching EXERCISED claims become STALE on the next regeneration — no
human has to remember to invalidate them.

${START}${'\n'}
${END}
`;
}

function build() {
  const existing = existsSync(OUT) ? readFileSync(OUT, 'utf-8') : header();
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s === -1 || e === -1) return header().replace(`${START}\n\n${END}`, `${START}\n${renderBlock()}\n${END}`);
  return `${existing.slice(0, s + START.length)}\n${renderBlock()}\n${existing.slice(e)}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const next = build();
  if (process.argv.includes('--check')) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf-8') : '';
    if (cur !== next) {
      console.error('❌ docs/TOOL_AUTHORITY_MATRIX.md is stale.');
      console.error('   Run: node scripts/gen-tool-authority.mjs && commit the result.');
      process.exit(1);
    }
    console.log('✅ tool authority matrix matches configuration and observations');
  } else {
    writeFileSync(OUT, next);
    console.log(`wrote ${OUT.replace(`${ROOT}/`, '')}`);
  }
}
