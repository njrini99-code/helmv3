// The enforcement inventory resolves "a production deploy, purchase, pause or
// deployment-protection change through the Vercel MCP is refused" by matching
// deny rules against a tool-name pattern, then excluding the Supabase server's
// look-alike `pause_project`. Two defects lived in that pair:
//
//   1. Until 2026-09-02 the pattern anchored only its LAST alternative, so
//      `deploy_to_vercel` and the `buy_*` names matched as substrings — a rule
//      naming some other tool that merely started with one of them would have
//      been counted as cover (CodeQL js/regex/missing-regexp-anchor).
//   2. The Supabase exclusion was the literal `/Supabase|e139bbde/` — the
//      Supabase connector id copied into the generator by hand, beside a
//      parameter that already carried it. A rotated id would have made the
//      Supabase `pause_project` rule count as Vercel cover.
//
// This pins the anchored shape under both spellings of the server segment,
// proves each rejection is reachable, proves the exclusion follows the
// connector file, and checks the live deny list against the tools the
// connector file records as present.
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const DOC = resolve(REPO, 'docs/CONTROL_PLANE_ENFORCEMENT.md');
const UUID = 'fba2ada3-c190-4053-b91a-3e81f5296483';

/** Every Vercel tool the claim is about. Kept in one place so the pattern, the deny list and the connector file are checked against the same set. */
const MUTATING_TOOLS = [
  'deploy_to_vercel',
  'pause_project',
  'buy_domain',
  'buy_pro',
  'buy_credits',
  'buy_addon',
  'update_project_deployment_protection',
];

type Connector = { service: string; id: string; display_name_prefix?: string };
type Hits = { hits: string[]; uuidHits: string[] };

let VERCEL_MUTATING_TOOL_RE: RegExp;
let vercelMutatingDenyHits: (deny: string[], connectors: Connector[]) => Hits;
let docBefore: string | null;
let docAfter: string | null;

const readDoc = () => (existsSync(DOC) ? readFileSync(DOC, 'utf-8') : null);

beforeAll(async () => {
  // Imported dynamically, bracketed by two reads of the generated doc: the
  // generator is ALSO a CLI whose entry point writes that file, and a test
  // suite that rewrote a committed artifact as a side effect of running would
  // be a worse defect than the one it pins.
  docBefore = readDoc();
  ({ VERCEL_MUTATING_TOOL_RE, vercelMutatingDenyHits } = await import('../gen-enforcement-inventory.mjs'));
  docAfter = readDoc();
});

describe('VERCEL_MUTATING_TOOL_RE', () => {
  it('importing the generator is a pure read — the doc on disk is untouched', () => {
    expect(docAfter).toBe(docBefore);
  });

  it('matches every mutating tool under the UUID spelling the session exposes', () => {
    for (const tool of MUTATING_TOOLS) {
      expect(VERCEL_MUTATING_TOOL_RE.test(`mcp__${UUID}__${tool}`), tool).toBe(true);
    }
  });

  it('matches the display-name spelling too', () => {
    expect(VERCEL_MUTATING_TOOL_RE.test('mcp__claude_ai_Vercel__deploy_to_vercel')).toBe(true);
    expect(VERCEL_MUTATING_TOOL_RE.test('mcp__claude_ai_Vercel__pause_project')).toBe(true);
    expect(VERCEL_MUTATING_TOOL_RE.test('mcp__claude_ai_Vercel__update_project_deployment_protection')).toBe(true);
  });

  it('rejects a tool name that merely STARTS with a mutating one — every alternative is anchored', () => {
    // Each of these matched the pre-fix pattern as a substring.
    for (const rule of [
      `mcp__${UUID}__deploy_to_vercel_preview`,
      `mcp__${UUID}__buy_domain_quote`,
      `mcp__${UUID}__buy_pro_trial`,
      'mcp__claude_ai_Vercel__pause_project_status',
      `mcp__${UUID}__update_project_deployment_protection_dry_run`,
    ]) {
      expect(VERCEL_MUTATING_TOOL_RE.test(rule), rule).toBe(false);
    }
  });

  it('rejects a name that ENDS with a mutating tool but is not an mcp__ rule', () => {
    expect(VERCEL_MUTATING_TOOL_RE.test('deploy_to_vercel')).toBe(false);
    expect(VERCEL_MUTATING_TOOL_RE.test('Bash(vercel deploy_to_vercel)')).toBe(false);
    expect(VERCEL_MUTATING_TOOL_RE.test('mcp__pause_project')).toBe(false);
  });

  it('rejects the other tools on the same server — including the READ twin of the protection tool', () => {
    // `get_project_deployment_protection` ends with the same 28 characters as
    // the mutator; only the leading `update_` separates a read from a write.
    for (const tool of ['get_deployment', 'list_projects', 'get_project_deployment_protection', 'unpause_project', 'create_git_project']) {
      expect(VERCEL_MUTATING_TOOL_RE.test(`mcp__${UUID}__${tool}`), tool).toBe(false);
    }
  });
});

describe('vercelMutatingDenyHits — the Supabase exclusion is derived from the connector file', () => {
  const SB_ON_FILE = 'e139bbde-4728-4ed3-977f-7b1b22f4b69c';
  const SB_ROTATED = '0badf00d-0000-4000-8000-000000000000';

  const connectors = (supabaseId: string): Connector[] => [
    { service: 'Supabase', id: supabaseId, display_name_prefix: 'mcp__claude_ai_Supabase__' },
    { service: 'Vercel', id: UUID, display_name_prefix: 'mcp__claude_ai_Vercel__' },
  ];
  const deny = (supabaseId: string) => [
    `mcp__${supabaseId}__pause_project`,
    'mcp__claude_ai_Supabase__pause_project',
    `mcp__${UUID}__pause_project`,
    `mcp__${UUID}__deploy_to_vercel`,
    'mcp__claude_ai_Vercel__deploy_to_vercel',
    'mcp__plugin_supabase_supabase',
    'Bash(vercel deploy_to_vercel)',
  ];

  it('excludes Supabase pause_project under BOTH its spellings and counts the Vercel rules', () => {
    const { hits, uuidHits } = vercelMutatingDenyHits(deny(SB_ON_FILE), connectors(SB_ON_FILE));
    expect(hits).toEqual([
      `mcp__${UUID}__pause_project`,
      `mcp__${UUID}__deploy_to_vercel`,
      'mcp__claude_ai_Vercel__deploy_to_vercel',
    ]);
    expect(uuidHits).toEqual([`mcp__${UUID}__pause_project`, `mcp__${UUID}__deploy_to_vercel`]);
  });

  it('a ROTATED Supabase connector id is still excluded — the id is read, not remembered', () => {
    // Under the literal /Supabase|e139bbde/ this rule was Vercel cover.
    const { hits, uuidHits } = vercelMutatingDenyHits(deny(SB_ROTATED), connectors(SB_ROTATED));
    expect(hits).not.toContain(`mcp__${SB_ROTATED}__pause_project`);
    expect(hits).toHaveLength(3);
    expect(uuidHits).toHaveLength(2);
  });

  it('with no Supabase connector on file nothing is excluded — a missing row is visible, not papered over', () => {
    const onlyVercel = connectors(SB_ROTATED).filter((c) => c.service === 'Vercel');
    const { hits } = vercelMutatingDenyHits(deny(SB_ROTATED), onlyVercel);
    expect(hits).toContain(`mcp__${SB_ROTATED}__pause_project`);
  });

  it('the generator carries no Supabase connector id literal', () => {
    const src = readFileSync(resolve(REPO, 'scripts/gen-enforcement-inventory.mjs'), 'utf-8');
    // Both halves of the old literal, checked outside comments: a comment may
    // record what the literal WAS, code may not carry it.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/e139bbde/);
    expect(code).not.toMatch(/\/Supabase\|/);
  });
});

describe('the live configuration', () => {
  it('every tool the pattern names is denied under the Vercel connector id on file', () => {
    // Second audit of #1738, finding 2: config/mcp-connector-ids.json recorded
    // update_project_deployment_protection as present under this prefix while
    // no deny rule named it. The connector file and the deny list must agree.
    const settings = JSON.parse(readFileSync(resolve(REPO, '.claude/settings.json'), 'utf-8'));
    const connectors: Connector[] = JSON.parse(
      readFileSync(resolve(REPO, 'config/mcp-connector-ids.json'), 'utf-8'),
    ).connectors;
    const vercelIds = connectors.filter((c) => c.service === 'Vercel').map((c) => c.id);
    expect(vercelIds.length).toBeGreaterThan(0);
    for (const id of vercelIds) {
      for (const tool of MUTATING_TOOLS) {
        expect(settings.permissions.deny, `${tool} under ${id}`).toContain(`mcp__${id}__${tool}`);
      }
    }
  });

  it('the resolved claim counts every UUID-spelled rule and none from the Supabase connector', () => {
    const settings = JSON.parse(readFileSync(resolve(REPO, '.claude/settings.json'), 'utf-8'));
    const connectors: Connector[] = JSON.parse(
      readFileSync(resolve(REPO, 'config/mcp-connector-ids.json'), 'utf-8'),
    ).connectors;
    const { hits, uuidHits } = vercelMutatingDenyHits(settings.permissions.deny, connectors);
    const supabaseIds = connectors.filter((c) => c.service === 'Supabase').map((c) => c.id);
    for (const r of hits) {
      for (const id of supabaseIds) expect(r.startsWith(`mcp__${id}__`), r).toBe(false);
      expect(r.startsWith('mcp__claude_ai_Supabase__'), r).toBe(false);
    }
    expect(uuidHits.length).toBe(MUTATING_TOOLS.length);
  });
});
