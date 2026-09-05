import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Status, summarize, check } from '../result.mjs';
import * as ai from '../checks/ai.mjs';
import * as ci from '../checks/ci.mjs';
import * as config from '../checks/config.mjs';
import * as nodeVersion from '../checks/node-version.mjs';

/**
 * repo:doctor is only useful if it CANNOT false-green. These tests pin the two
 * properties the spec insists on: hard failures map to a non-zero exit, and a
 * crashed check (BLOCKED) or unretrievable state (UNKNOWN) is never reported as
 * a pass. Plus a representative real-fail path for three checks.
 */

describe('summarize — exit-code semantics (cannot false-green)', () => {
  const c = (status: string) => check('x', status as never, 't');

  it('all PASS -> exit 0', () => {
    expect(summarize([c(Status.PASS), c(Status.WARN)]).exitCode).toBe(0);
  });
  it('a FAIL -> exit 1', () => {
    expect(summarize([c(Status.PASS), c(Status.FAIL)]).exitCode).toBe(1);
  });
  it('a DRIFT -> exit 1', () => {
    expect(summarize([c(Status.DRIFT)]).exitCode).toBe(1);
  });
  it('a BLOCKED (crashed check) -> exit 2, even alongside passes', () => {
    expect(summarize([c(Status.PASS), c(Status.BLOCKED)]).exitCode).toBe(2);
  });
  it('BLOCKED outranks FAIL -> exit 2', () => {
    expect(summarize([c(Status.FAIL), c(Status.BLOCKED)]).exitCode).toBe(2);
  });
  it('an UNKNOWN with no hard failures -> exit 3, NOT 0', () => {
    const r = summarize([c(Status.PASS), c(Status.UNKNOWN)]);
    expect(r.exitCode).toBe(3);
    expect(r.ok).toBe(false);
  });
  it('WARN alone never fails the run', () => {
    expect(summarize([c(Status.WARN), c(Status.WARN)]).ok).toBe(true);
  });
});

describe('check fixtures — each fails on bad input, passes on good', () => {
  let dir: string;
  const manifest = {
    authority: { constitution: 'AGENTS.md', claude_adapter: 'CLAUDE.md' },
    required_scripts: ['repo:doctor', 'build'],
    supabase: { root: 'supabase' },
    ci: { unique_check_names: ['CI aggregate'] },
  };
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'doctor-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const s = (results: Array<{ id: string; status: string }>, id: string) =>
    results.find((r) => r.id === id)?.status;

  it('ai.authority-link FAILs when CLAUDE.md does not import @AGENTS.md', async () => {
    writeFileSync(join(dir, 'AGENTS.md'), '# constitution');
    writeFileSync(join(dir, 'CLAUDE.md'), '# adapter with no import');
    const res = await ai.run({ repoRoot: dir, manifest });
    expect(s(res, 'ai.authority-link')).toBe(Status.FAIL);
  });
  it('ai.authority-link PASSes when the import is present', async () => {
    writeFileSync(join(dir, 'AGENTS.md'), '# constitution');
    writeFileSync(join(dir, 'CLAUDE.md'), 'preamble\n@AGENTS.md\nmore');
    const res = await ai.run({ repoRoot: dir, manifest });
    expect(s(res, 'ai.authority-link')).toBe(Status.PASS);
  });

  it('config.required-scripts FAILs when a required script is missing', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { build: 'x' } }));
    const res = await config.run({ repoRoot: dir, manifest });
    expect(s(res, 'config.required-scripts')).toBe(Status.FAIL);
  });
  it('config.required-scripts PASSes when all present', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { 'repo:doctor': 'x', build: 'y' } }));
    mkdirSync(join(dir, 'supabase'));
    writeFileSync(join(dir, 'supabase', 'config.toml'), '');
    const res = await config.run({ repoRoot: dir, manifest });
    expect(s(res, 'config.required-scripts')).toBe(Status.PASS);
    expect(s(res, 'config.supabase-root')).toBe(Status.PASS);
  });

  it('ci.unique-producers FAILs when two jobs post the same required name', async () => {
    const wf = join(dir, '.github', 'workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'a.yml'), 'jobs:\n  j1:\n    name: CI aggregate\n');
    writeFileSync(join(wf, 'b.yml'), 'jobs:\n  j2:\n    name: CI aggregate\n');
    const res = await ci.run({ repoRoot: dir, manifest });
    expect(s(res, 'ci.unique-producers')).toBe(Status.FAIL);
  });
  it('ci flags a required name with NO producer', async () => {
    const wf = join(dir, '.github', 'workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'a.yml'), 'jobs:\n  j1:\n    name: Something Else\n');
    const res = await ci.run({ repoRoot: dir, manifest });
    expect(s(res, 'ci.required-producer')).toBe(Status.FAIL);
  });

  // node-version: engines.node must be an exact major ("22.x"), never a
  // range, and any .nvmrc/.node-version present must name the same major.
  it('node.engines-exact-major FAILs on a range', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ engines: { node: '>=22' } }));
    const res = await nodeVersion.run({ repoRoot: dir, manifest });
    expect(s(res, 'node.engines-exact-major')).toBe(Status.FAIL);
  });
  it('node.engines-exact-major FAILs on a full semver', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ engines: { node: '22.9.0' } }));
    const res = await nodeVersion.run({ repoRoot: dir, manifest });
    expect(s(res, 'node.engines-exact-major')).toBe(Status.FAIL);
  });
  it('node.engines-exact-major FAILs when engines.node is absent', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));
    const res = await nodeVersion.run({ repoRoot: dir, manifest });
    expect(s(res, 'node.engines-exact-major')).toBe(Status.FAIL);
  });
  it('node.engines-exact-major PASSes on an exact major', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ engines: { node: '22.x' } }));
    const res = await nodeVersion.run({ repoRoot: dir, manifest });
    expect(s(res, 'node.engines-exact-major')).toBe(Status.PASS);
  });
  it('node.nvmrc-agrees FAILs when .nvmrc names a different major', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ engines: { node: '22.x' } }));
    writeFileSync(join(dir, '.nvmrc'), '20\n');
    const res = await nodeVersion.run({ repoRoot: dir, manifest });
    expect(s(res, 'node.nvmrc-agrees')).toBe(Status.FAIL);
  });
  it('node.nvmrc-agrees PASSes when .nvmrc agrees (bare major)', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ engines: { node: '22.x' } }));
    writeFileSync(join(dir, '.nvmrc'), '22\n');
    const res = await nodeVersion.run({ repoRoot: dir, manifest });
    expect(s(res, 'node.nvmrc-agrees')).toBe(Status.PASS);
  });
  it('node.node-version-agrees PASSes with a v-prefixed full version', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ engines: { node: '22.x' } }));
    writeFileSync(join(dir, '.node-version'), 'v22.9.0\n');
    const res = await nodeVersion.run({ repoRoot: dir, manifest });
    expect(s(res, 'node.node-version-agrees')).toBe(Status.PASS);
  });
});
