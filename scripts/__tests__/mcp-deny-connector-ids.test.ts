// MCP deny rules are keyed on tool NAMES, and the session names an account
// connector's tools by a UUID prefix — not by the display name every deny rule
// used until 2026-09-01. This pins the classifier that keeps the two spellings
// and config/mcp-connector-ids.json from drifting apart, and proves each
// verdict is reachable: a check that cannot go red is decoration.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { classifyMcpDenyConnectorIds, FAIL, GAP, PASS } from '../control-plane-verify.mjs';

const REPO = resolve(__dirname, '../..');
const SB = 'e139bbde-4728-4ed3-977f-7b1b22f4b69c';

const connectors = (stability = 'UNVERIFIED across sessions') => [
  { service: 'Supabase', id: SB, display_name_prefix: 'mcp__claude_ai_Supabase__', observed_at: '2026-09-01', stability },
];

describe('classifyMcpDenyConnectorIds', () => {
  it('consistent rules with an UNVERIFIED id and a registered gap -> GAP, never PASS', () => {
    const v = classifyMcpDenyConnectorIds({
      deny: ['mcp__claude_ai_Supabase__apply_migration', `mcp__${SB}__apply_migration`],
      connectors: connectors(),
      gapRegistered: true,
    });
    expect(v.state).toBe(GAP);
    expect(v.detail).toMatch(/UNVERIFIED/);
  });

  it('the same state with NO registered gap -> FAIL — a known bet must be owned', () => {
    const v = classifyMcpDenyConnectorIds({
      deny: ['mcp__claude_ai_Supabase__apply_migration', `mcp__${SB}__apply_migration`],
      connectors: connectors(),
      gapRegistered: false,
    });
    expect(v.state).toBe(FAIL);
  });

  it('a display-name deny with no twin under the UUID the session exposes -> FAIL', () => {
    // This is exactly the 2026-09-01 finding: fourteen rules that matched nothing callable.
    const v = classifyMcpDenyConnectorIds({
      deny: ['mcp__claude_ai_Supabase__apply_migration'],
      connectors: connectors(),
      gapRegistered: true,
    });
    expect(v.state).toBe(FAIL);
    expect(v.detail).toContain(`mcp__${SB}__apply_migration`);
  });

  it('a UUID deny rule whose id is recorded nowhere -> FAIL — untraceable to an observation', () => {
    const v = classifyMcpDenyConnectorIds({
      deny: ['mcp__0badf00d-0000-4000-8000-000000000000__apply_migration'],
      connectors: connectors(),
      gapRegistered: true,
    });
    expect(v.state).toBe(FAIL);
    expect(v.detail).toMatch(/does not record/);
  });

  it('PASS is reserved for ids recorded as VERIFIED', () => {
    const v = classifyMcpDenyConnectorIds({
      deny: ['mcp__claude_ai_Supabase__apply_migration', `mcp__${SB}__apply_migration`],
      connectors: connectors('VERIFIED 2026-09-08 across 3 sessions'),
      gapRegistered: true,
    });
    expect(v.state).toBe(PASS);
  });

  it('non-UUID MCP rules (plugin and display-name servers) are ignored by the id trace', () => {
    const v = classifyMcpDenyConnectorIds({
      deny: ['mcp__plugin_supabase_supabase', 'mcp__Desktop_Commander__write_file'],
      connectors: connectors(),
      gapRegistered: true,
    });
    expect(v.state).toBe(GAP);
  });
});

describe('the live configuration', () => {
  it('every display-name mutator deny has its UUID twin, and every UUID rule is recorded', () => {
    const settings = JSON.parse(readFileSync(resolve(REPO, '.claude/settings.json'), 'utf-8'));
    const ids = JSON.parse(readFileSync(resolve(REPO, 'config/mcp-connector-ids.json'), 'utf-8'));
    const gaps = JSON.parse(readFileSync(resolve(REPO, 'config/control-plane-gaps.json'), 'utf-8')).gaps;
    const v = classifyMcpDenyConnectorIds({
      deny: settings.permissions.deny,
      connectors: ids.connectors,
      gapRegistered: gaps.some((g: { id: string }) => g.id === 'MCP_DENY_RULES_KEYED_ON_ROTATABLE_CONNECTOR_IDS'),
    });
    expect(v.state, v.detail).not.toBe(FAIL);
  });

  it('the Supabase CLI denies cover the spellings that actually run on this machine', () => {
    // CLAUDE.md and scripts/doctor.mjs: bare `supabase` does not resolve here;
    // ./node_modules/.bin/supabase and npx supabase do. Until 2026-09-01 only
    // the bare spelling of `config push` and `db reset` was denied.
    const deny: string[] = JSON.parse(readFileSync(resolve(REPO, '.claude/settings.json'), 'utf-8')).permissions.deny;
    for (const verb of ['config push', 'db reset', 'db push', 'migration up']) {
      for (const bin of ['supabase', './node_modules/.bin/supabase', 'npx supabase']) {
        expect(deny, `${bin} ${verb}`).toContain(`Bash(${bin} ${verb}:*)`);
      }
    }
  });
});
