// The enforcement inventory resolves "a production deploy or purchase through
// the Vercel MCP is refused" by matching deny rules against a tool-name
// pattern. Until 2026-09-02 that pattern anchored only its LAST alternative,
// so `deploy_to_vercel` and the `buy_*` names matched as substrings — a rule
// naming some other tool that merely started with one of them would have been
// counted as cover (CodeQL js/regex/missing-regexp-anchor). This pins the
// anchored shape under both spellings of the server segment and proves each
// rejection is reachable.
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const DOC = resolve(REPO, 'docs/CONTROL_PLANE_ENFORCEMENT.md');
const UUID = 'fba2ada3-c190-4053-b91a-3e81f5296483';

let VERCEL_MUTATING_TOOL_RE: RegExp;
let docBefore: string | null;
let docAfter: string | null;

const readDoc = () => (existsSync(DOC) ? readFileSync(DOC, 'utf-8') : null);

beforeAll(async () => {
  // Imported dynamically, bracketed by two reads of the generated doc: the
  // generator is ALSO a CLI whose entry point writes that file, and a test
  // suite that rewrote a committed artifact as a side effect of running would
  // be a worse defect than the one it pins.
  docBefore = readDoc();
  ({ VERCEL_MUTATING_TOOL_RE } = await import('../gen-enforcement-inventory.mjs'));
  docAfter = readDoc();
});

describe('VERCEL_MUTATING_TOOL_RE', () => {
  it('importing the generator is a pure read — the doc on disk is untouched', () => {
    expect(docAfter).toBe(docBefore);
  });

  it('matches every mutating tool under the UUID spelling the session exposes', () => {
    for (const tool of ['deploy_to_vercel', 'pause_project', 'buy_domain', 'buy_pro', 'buy_credits', 'buy_addon']) {
      expect(VERCEL_MUTATING_TOOL_RE.test(`mcp__${UUID}__${tool}`)).toBe(true);
    }
  });

  it('matches the display-name spelling too', () => {
    expect(VERCEL_MUTATING_TOOL_RE.test('mcp__claude_ai_Vercel__deploy_to_vercel')).toBe(true);
    expect(VERCEL_MUTATING_TOOL_RE.test('mcp__claude_ai_Vercel__pause_project')).toBe(true);
  });

  it('rejects a tool name that merely STARTS with a mutating one — every alternative is anchored', () => {
    // Each of these matched the pre-fix pattern as a substring.
    for (const rule of [
      `mcp__${UUID}__deploy_to_vercel_preview`,
      `mcp__${UUID}__buy_domain_quote`,
      `mcp__${UUID}__buy_pro_trial`,
      'mcp__claude_ai_Vercel__pause_project_status',
    ]) {
      expect(VERCEL_MUTATING_TOOL_RE.test(rule)).toBe(false);
    }
  });

  it('rejects a name that ENDS with a mutating tool but is not an mcp__ rule', () => {
    expect(VERCEL_MUTATING_TOOL_RE.test('deploy_to_vercel')).toBe(false);
    expect(VERCEL_MUTATING_TOOL_RE.test('Bash(vercel deploy_to_vercel)')).toBe(false);
    expect(VERCEL_MUTATING_TOOL_RE.test('mcp__pause_project')).toBe(false);
  });

  it('rejects the other tools on the same server — the claim is deploy, purchase, pause', () => {
    for (const tool of ['get_deployment', 'list_projects', 'get_project_deployment_protection', 'unpause_project']) {
      expect(VERCEL_MUTATING_TOOL_RE.test(`mcp__${UUID}__${tool}`)).toBe(false);
    }
  });
});
