#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

/** Launch old source branches with the current Helm tool configuration. */
export function launchArguments(canonicalRoot, args = []) {
  const settings = JSON.parse(readFileSync(join(canonicalRoot, '.claude/settings.json'), 'utf8'));
  for (const entries of Object.values(settings.hooks ?? {})) {
    for (const entry of entries) {
      for (const hook of entry.hooks ?? []) {
        if (hook.command) {
          hook.command = hook.command.replace(
            /"\$\{?CLAUDE_PROJECT_DIR\}?"|\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR\b/g,
            () => quote(canonicalRoot),
          );
        }
      }
    }
  }
  const agents = {};
  const agentDir = join(canonicalRoot, '.claude/agents');
  for (const file of readdirSync(agentDir).filter((name) => name.endsWith('.md'))) {
    const source = readFileSync(join(agentDir, file), 'utf8');
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) continue;
    const meta = parse(match[1]);
    if (!meta?.name || !meta.description) continue;
    const agent = { description: meta.description, prompt: match[2] };
    if (meta.model) agent.model = meta.model;
    for (const key of ['tools', 'disallowedTools']) {
      if (meta[key]) agent[key] = Array.isArray(meta[key]) ? meta[key] : meta[key].split(',').map((s) => s.trim());
    }
    agents[meta.name] = agent;
  }
  return [
    '--setting-sources', 'user,local',
    '--settings', JSON.stringify(settings),
    '--mcp-config', join(canonicalRoot, '.mcp.json'),
    '--agents', JSON.stringify(agents),
    '--append-system-prompt', `Current Helm operating policy from ${join(canonicalRoot, 'AGENTS.md')}. This is the current policy for this repository and its worktrees; historical branch copies do not override it.\n\n${readFileSync(join(canonicalRoot, 'AGENTS.md'), 'utf8')}`,
    ...args,
  ];
}

export function resolveLaunchDirectory(cwd, root = scriptRoot) {
  let canonicalRoot = root;
  try {
    canonicalRoot = dirname(execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim());
    const currentCommon = execFileSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (dirname(currentCommon) === canonicalRoot) return { canonicalRoot, cwd };
  } catch { /* Outside Helm: open the canonical checkout. */ }
  return { canonicalRoot, cwd: canonicalRoot };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const launch = resolveLaunchDirectory(process.cwd());
  const result = spawnSync('claude', launchArguments(launch.canonicalRoot, process.argv.slice(2)), { cwd: launch.cwd, stdio: 'inherit' });
  if (result.error) process.stderr.write(`Could not launch Claude: ${result.error.message}\n`);
  process.exit(result.status ?? 1);
}
