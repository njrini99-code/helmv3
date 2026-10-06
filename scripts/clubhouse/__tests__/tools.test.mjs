import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeNextDevtools } from '../tools.mjs';

const section = '[mcp_servers.next-devtools]\ncommand = "npx"\nargs = ["--no-install", "next-devtools-mcp"]';
test('setup retains other tools and root settings, replacing only its own section', () => {
  const source = 'model = "configured"\n[mcp_servers.other]\ncommand = "other"\n[mcp_servers.next-devtools]\ncommand = "old"\n[mcp_servers.last]\ncommand = "last"\n';
  const out = mergeNextDevtools(source, section);
  assert.ok(out.includes('model = "configured"'));
  assert.ok(out.includes('[mcp_servers.other]\ncommand = "other"'));
  assert.ok(out.includes('[mcp_servers.last]\ncommand = "last"'));
  assert.ok(!out.includes('command = "old"'));
  assert.equal(out.match(/\[mcp_servers.next-devtools\]/g).length, 1);
});
test('setup is idempotent and works in a new checkout', () => {
  const first = mergeNextDevtools('', section);
  assert.equal(mergeNextDevtools(first, section), first);
});
