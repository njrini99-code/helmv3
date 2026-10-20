// .claude/hooks/format-on-edit.mjs must be inert unless Prettier AND a Prettier
// config both exist, must never throw or print, and must stay inside the project.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileToFormat, hasPrettierConfig } from '../../../.claude/hooks/format-on-edit.mjs';

const HOOK = resolve(process.cwd(), '.claude/hooks/format-on-edit.mjs');
const ROOT = '/repo';
const on = { prettierResolves: () => true, hasPrettierConfig: () => true, exists: () => true };
const edit = (file_path) => ({ tool_input: { file_path } });

describe('fileToFormat', () => {
  it('formats the listed extensions when prettier and a config exist', () => {
    for (const f of ['a.ts', 'a.tsx', 'a.js', 'a.mjs', 'a.css', 'a.md', 'a.json']) {
      expect(fileToFormat(edit(`/repo/src/${f}`), ROOT, on)).toBe(`/repo/src/${f}`);
    }
  });

  it('does nothing when prettier does not resolve', () => {
    expect(fileToFormat(edit('/repo/src/a.ts'), ROOT, { ...on, prettierResolves: () => false })).toBeNull();
  });

  it('does nothing without a prettier config, so the repo is never reformatted by default', () => {
    expect(fileToFormat(edit('/repo/src/a.ts'), ROOT, { ...on, hasPrettierConfig: () => false })).toBeNull();
  });

  it('skips other extensions, outside paths, node_modules, missing files and bad input', () => {
    expect(fileToFormat(edit('/repo/src/a.sql'), ROOT, on)).toBeNull();
    expect(fileToFormat(edit('/elsewhere/a.ts'), ROOT, on)).toBeNull();
    expect(fileToFormat(edit('/repo/node_modules/x/a.ts'), ROOT, on)).toBeNull();
    expect(fileToFormat(edit('/repo/src/a.ts'), ROOT, { ...on, exists: () => false })).toBeNull();
    expect(fileToFormat({}, ROOT, on)).toBeNull();
    expect(fileToFormat(null, ROOT, on)).toBeNull();
  });
});

describe('hasPrettierConfig', () => {
  it('finds a config file or a package.json key', () => {
    expect(hasPrettierConfig('/r', () => '{}', (p) => p === '/r/.prettierrc')).toBe(true);
    expect(hasPrettierConfig('/r', () => '{"prettier":{}}', () => false)).toBe(true);
    expect(hasPrettierConfig('/r', () => '{}', () => false)).toBe(false);
    expect(hasPrettierConfig('/r', () => { throw new Error('no file'); }, () => false)).toBe(false);
  });
});

describe('the hook process', () => {
  it('exits 0 and prints nothing in this repo, where prettier is absent', () => {
    const r = spawnSync('node', [HOOK], {
      input: JSON.stringify(edit(resolve(process.cwd(), 'package.json'))),
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
  });

  it('exits 0 on garbage stdin', () => {
    const r = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
  });
});
