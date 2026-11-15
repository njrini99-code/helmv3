// Fixture tests for .claude/hooks/no-prod-in-audit.mjs (PreToolUse, matcher mcp__.*): during an audit only the
// read-only staging server answers database questions and no MCP call names production. Each case feeds the hook the
// PreToolUse JSON Claude Code sends, the way the session runs it.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { decide, serverOf, supabaseConnectorIds, PROD_REF } from '../../../.claude/hooks/no-prod-in-audit.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/no-prod-in-audit.mjs');
const STAGING_REF = 'ybmwektreyrwjscxlogv';

function run(tool_name, tool_input, { audit = true } = {}) {
  const env = { ...process.env };
  delete env.HELM_AUDIT;
  if (audit) env.HELM_AUDIT = '1';
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input }),
    env,
    encoding: 'utf-8',
  });
  return out.trim() ? JSON.parse(out).hookSpecificOutput : null;
}

describe('during an audit (HELM_AUDIT=1)', () => {
  it('lets the read-only staging server run `select 1`', () => {
    expect(run('mcp__supabase-staging-ro__execute_sql', { query: 'select 1' })).toBeNull();
  });

  it('denies the staging server when the call names production', () => {
    const out = run('mcp__supabase-staging-ro__execute_sql', { query: `select '${PROD_REF}'` });
    expect(out.permissionDecision).toBe('deny');
    expect(out.permissionDecisionReason).toMatch(/production/);
  });

  it('denies the production servers from .mcp.json', () => {
    expect(run('mcp__supabase-readonly__execute_sql', { query: 'select 1' }).permissionDecision).toBe('deny');
    expect(run('mcp__supabase__list_tables', {}).permissionDecision).toBe('deny');
  });

  it('denies the Supabase account connector under its uuid name and its display name', () => {
    const [id] = supabaseConnectorIds();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(run(`mcp__${id}__execute_sql`, { query: 'select 1' }).permissionDecision).toBe('deny');
    expect(run('mcp__claude_ai_Supabase__execute_sql', { query: 'select 1' }).permissionDecision).toBe('deny');
  });

  it('denies the account-wide Supabase plugin even when it is pointed at staging', () => {
    const out = run('mcp__plugin_supabase_supabase__execute_sql', { project_id: STAGING_REF, query: 'select 1' });
    expect(out.permissionDecision).toBe('deny');
  });

  it('denies a browser opening the production site, and lets it open a preview', () => {
    expect(run('mcp__playwright-webkit__browser_navigate', { url: 'https://helmsportslabs.com/golf/dashboard' }).permissionDecision).toBe('deny');
    expect(run('mcp__safari-native__navigate_to_url', { url: 'https://www.helmsportslabs.com' }).permissionDecision).toBe('deny');
    expect(run('mcp__playwright-webkit__browser_navigate', { url: 'https://helmv3-abc123-nick-rinis-projects.vercel.app/golf/dashboard' })).toBeNull();
  });

  it('leaves a demo email address that mentions the domain alone', () => {
    expect(run('mcp__playwright-webkit__browser_type', { text: 'demo.coach@helmsportslabs.com' })).toBeNull();
  });

  it('refuses a call it cannot read', () => {
    const out = execFileSync('node', [HOOK], { input: 'not json', env: { ...process.env, HELM_AUDIT: '1' }, encoding: 'utf-8' });
    expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('deny');
  });
});

describe('outside an audit', () => {
  it('allows everything, production servers included', () => {
    expect(run('mcp__supabase-readonly__execute_sql', { query: 'select 1' }, { audit: false })).toBeNull();
    expect(run('mcp__supabase-staging-ro__execute_sql', { query: `select '${PROD_REF}'` }, { audit: false })).toBeNull();
  });
});

describe('serverOf and decide', () => {
  it('reads the server out of a tool name, whatever it contains', () => {
    expect(serverOf('mcp__plugin_supabase_supabase__execute_sql')).toBe('plugin_supabase_supabase');
    expect(serverOf('mcp__supabase-staging-ro__list_tables')).toBe('supabase-staging-ro');
    expect(serverOf('Bash')).toBeNull();
  });

  it('never refuses a tool that is not an MCP tool', () => {
    expect(decide({ toolName: 'Bash', toolInput: { command: PROD_REF }, audit: true, supabaseIds: [] })).toEqual({ deny: false });
  });
});
