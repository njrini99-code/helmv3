import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(ROOT, 'package.json'));

/** Replace only this tool's section; retain unrelated settings and credentials. */
export function mergeNextDevtools(source, section) {
  const lines = source.split('\n');
  const kept = [];
  let replacing = false;
  for (const line of lines) {
    if (/^\s*\[/.test(line)) replacing = /^\s*\[mcp_servers\.next-devtools\]\s*(?:#.*)?$/.test(line);
    if (!replacing) kept.push(line);
  }
  return `${kept.join('\n').trimEnd()}\n\n${section.trim()}\n`.trimStart();
}

function inspectTools() {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  let failures = 0;
  for (const name of ['next-devtools-mcp', 'stylelint', 'react-devtools']) {
    const file = resolve(ROOT, 'node_modules', name, 'package.json');
    const installed = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).version : null;
    const expected = manifest.devDependencies[name];
    const ready = installed === expected;
    failures += ready ? 0 : 1;
    console.log(`${ready ? 'ready' : 'missing/mismatched'} ${name}: installed=${installed ?? 'none'}, pinned=${expected}`);
  }
  try {
    if (!existsSync(require('electron'))) throw new Error('missing runtime');
    console.log('ready React DevTools desktop runtime');
  } catch {
    failures++;
    console.log('missing React DevTools desktop runtime: npm rebuild electron');
  }
  const config = resolve(ROOT, '.codex/config.toml');
  const configured = existsSync(config) && readFileSync(config, 'utf8').includes('[mcp_servers.next-devtools]');
  console.log(`${configured ? 'configured' : 'not configured'} repository Codex MCP (reload the client to expose tools)`);
  if (!configured) failures++;
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--setup')) {
      const target = resolve(ROOT, '.codex/config.toml');
      const template = readFileSync(resolve(ROOT, 'config/clubhouse/codex-mcp.toml'), 'utf8');
      const previous = existsSync(target) ? readFileSync(target, 'utf8') : '';
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, mergeNextDevtools(previous, template), { mode: 0o600 });
      console.log('Configured repository-local Next DevTools MCP; unrelated sections retained.');
    }
    process.exitCode = inspectTools() ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
