#!/usr/bin/env node
// Enable the pinned component registry MCP in this checkout's Codex config.
// .codex/ is machine-local and ignored; never change the user's global config.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, 'node_modules/shadcn/dist/index.js');
const config = resolve(root, '.codex/config.toml');

if (!existsSync(cli)) {
  console.error('Install this checkout\'s dependencies with npm ci first.');
  process.exit(1);
}

const current = existsSync(config) ? readFileSync(config, 'utf8') : '';
if (/^\s*\[\s*mcp_servers\.(?:shadcn|"shadcn"|'shadcn')(?:\s*\]|\.)/m.test(current)) {
  console.log('A shadcn MCP configuration already exists; preserved it.');
} else {
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, `${current}${current.endsWith('\n') || !current ? '' : '\n'}
[mcp_servers.shadcn]
command = "node"
args = [${JSON.stringify(cli)}, "mcp", "--cwd", ${JSON.stringify(root)}]
`);
  console.log('Added shadcn MCP to this checkout\'s .codex/config.toml.');
}
console.log('Reopen Codex in this trusted checkout to load the component tools.');
