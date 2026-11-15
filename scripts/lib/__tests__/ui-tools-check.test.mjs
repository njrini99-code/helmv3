// The pure parts of `npm run doctor -- --ui` (scripts/lib/ui-tools-check.mjs): browser revisions, the MCP list, disk and
// where an env file points. It must name a project without ever printing its URL or a key.
import { describe, it, expect } from 'vitest';
import { browserStatus, diskStatus, envTarget, parseMcpList } from '../ui-tools-check.mjs';
import { KNOWN_PROD_PROJECT_REF } from '../prod-target-guard.mjs';

describe('browserStatus', () => {
  it('matches the wanted revision to the installed folder name', () => {
    const got = browserStatus([{ name: 'webkit', revision: '2370', browserVersion: '27.2' }, { name: 'chromium', revision: '1248', browserVersion: '156' }], ['webkit-2359', 'webkit-2370', 'chromium-1240']);
    expect(got.map((b) => [b.name, b.ok])).toEqual([['webkit', true], ['chromium', false]]);
  });
});

describe('parseMcpList', () => {
  it('reads connected, needs-auth and failed servers', () => {
    const text = [
      'Checking MCP server health...',
      'playwright-webkit: npx --no-install playwright mcp --browser webkit - ✓ Connected',
      'supabase-staging-ro: https://mcp.supabase.com/mcp?project_ref=x (HTTP) - ! Needs authentication',
      'claude.ai Sentry: https://mcp.sentry.dev/mcp - ! Needs authentication',
      'broken: node nope.js - ✗ Failed to connect',
    ].join('\n');
    expect(parseMcpList(text)).toEqual({ 'playwright-webkit': 'connected', 'supabase-staging-ro': 'needs-auth', 'claude.ai Sentry': 'needs-auth', broken: 'failed' });
  });
});

describe('diskStatus', () => {
  it('asks Nick under 10 GB and is fine above', () => {
    expect(diskStatus(7.5).status).toBe('NEEDS NICK');
    expect(diskStatus(7.5).fix).toMatch(/worktrees:park/);
    expect(diskStatus(40).status).toBe('AVAILABLE');
  });
});

describe('envTarget', () => {
  it('names the project and never returns the URL', () => {
    expect(envTarget(`X=1\nNEXT_PUBLIC_SUPABASE_URL=https://${KNOWN_PROD_PROJECT_REF}.supabase.co\n`)).toBe('production');
    expect(envTarget('NEXT_PUBLIC_SUPABASE_URL="https://ybmwektreyrwjscxlogv.supabase.co"')).toBe('staging');
    expect(envTarget('NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321')).toBe('local');
    expect(envTarget('OTHER=1')).toBe('unset');
  });
});
