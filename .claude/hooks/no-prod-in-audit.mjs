#!/usr/bin/env node
// PreToolUse hook, matcher `mcp__.*`. During an audit (HELM_AUDIT=1) the only database a session may reach is the
// read-only staging server, and no MCP call may name production. Outside an audit the settings entry exits before
// this file runs, so normal sessions are unchanged.
//
// Denies, while HELM_AUDIT=1:
//   - any MCP call whose input names the production project ref, or a helmsportslabs.com web address;
//   - any Supabase server other than `supabase-staging-ro`, whether named for Supabase (`supabase`,
//     `supabase-readonly`, `claude_ai_Supabase`, `plugin_supabase_supabase`) or listed as a Supabase account connector
//     by id in config/mcp-connector-ids.json (the account connector appears as `mcp__<uuid>__…`).
// A call it cannot read during an audit is denied too: the audit is opt-in, so failing closed costs a retry, not work.
//
// The first fence is starting the audit with only the audit servers loaded:
//   HELM_AUDIT=1 claude --strict-mcp-config --mcp-config .claude/audit.mcp.json
// This hook is the second, for connectors that a strict MCP config does not unload.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROD_REF = 'qmnssrrolpinvwjjnufo';
export const STAGING_SERVER = 'supabase-staging-ro';
// The input is checked as JSON text, so the host can end at a quote as well as at a path or port.
const PROD_WEB = /https?:\/\/(?:[a-z0-9-]+\.)*helmsportslabs\.com(?![a-z0-9-])/i;
const HERE = dirname(fileURLToPath(import.meta.url));

/** The server part of `mcp__<server>__<tool>`; null for a tool that isn't an MCP tool. */
export function serverOf(toolName) {
  const name = String(toolName ?? '');
  if (!name.startsWith('mcp__')) return null;
  const rest = name.slice('mcp__'.length);
  const cut = rest.lastIndexOf('__');
  return cut > 0 ? rest.slice(0, cut) : rest;
}

/** Ids of the Supabase account connectors, from the one file that records them. */
export function supabaseConnectorIds(file = resolve(HERE, '../../config/mcp-connector-ids.json')) {
  try {
    const { connectors = [] } = JSON.parse(readFileSync(file, 'utf8'));
    return [...new Set(connectors.filter((c) => c.service === 'Supabase').map((c) => c.id))];
  } catch {
    return [];
  }
}

/** The decision for one tool call: `{ deny: false }` or `{ deny: true, reason }`. */
export function decide({ toolName, toolInput, audit, supabaseIds = supabaseConnectorIds() }) {
  if (!audit) return { deny: false };
  const server = serverOf(toolName);
  if (server === null) return { deny: false };
  const text = JSON.stringify(toolInput ?? {});
  if (text.includes(PROD_REF)) {
    return { deny: true, reason: `Audit session: this call names the production Supabase project (${PROD_REF}). Use ${STAGING_SERVER}.` };
  }
  if (PROD_WEB.test(text)) {
    return { deny: true, reason: 'Audit session: this call opens the production site (helmsportslabs.com). Audit the staging preview instead.' };
  }
  if (server === STAGING_SERVER) return { deny: false };
  if (/supabase/i.test(server) || supabaseIds.includes(server)) {
    return { deny: true, reason: `Audit session: only ${STAGING_SERVER} may answer database questions; ${server} can reach production.` };
  }
  return { deny: false };
}

function respond(reason) {
  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`,
  );
}

function main() {
  const audit = process.env.HELM_AUDIT === '1';
  if (!audit) return;
  let call;
  try {
    call = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    respond('Audit session: the guard could not read this tool call, so it is refused.');
    return;
  }
  const verdict = decide({ toolName: call.tool_name, toolInput: call.tool_input, audit });
  if (verdict.deny) respond(verdict.reason);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
