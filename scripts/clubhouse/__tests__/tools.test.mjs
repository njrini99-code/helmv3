import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureNextDevtools, mergeNextDevtools } from '../tools.mjs';

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
test('setup replaces a config symlink without writing through it and creates a private file', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'clubhouse-tools-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const original = join(dir, 'original.toml');
  const target = join(dir, 'config.toml');
  writeFileSync(original, 'model = "configured"\n');
  symlinkSync(original, target);
  configureNextDevtools(target, section);
  assert.equal(readFileSync(original, 'utf8'), 'model = "configured"\n');
  assert.ok(readFileSync(target, 'utf8').includes(section));
  assert.equal(statSync(target).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dir).sort(), ['config.toml', 'original.toml']);
});
test('setup creates a missing configuration directory', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'clubhouse-tools-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const target = join(dir, '.codex', 'config.toml');
  configureNextDevtools(target, section);
  assert.equal(readFileSync(target, 'utf8'), `${section}\n`);
});
