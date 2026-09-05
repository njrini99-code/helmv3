import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Status } from '../result.mjs';
import { plistLabel, knownRoutineNames, run as routinesRun } from '../checks/routines.mjs';

describe('plistLabel', () => {
  it('extracts the Label value from an XML plist', () => {
    const xml = '<plist><dict><key>Label</key><string>com.helm.bridge-rca-repair</string></dict></plist>';
    expect(plistLabel(xml)).toBe('com.helm.bridge-rca-repair');
  });
  it('returns null when there is no Label key', () => {
    expect(plistLabel('<plist><dict></dict></plist>')).toBeNull();
  });
  it('tolerates whitespace between key/string tags', () => {
    const xml = '<key>Label</key>\n  <string>  com.example.thing  </string>';
    expect(plistLabel(xml)).toBe('com.example.thing');
  });
});

describe('knownRoutineNames', () => {
  it('collects ids, superseded launchd_labels, and scheduled-task source basenames', () => {
    const doc = {
      routines: [
        { id: 'control-plane-weekly', source: '.github/workflows/control-plane-weekly.yml' },
        { id: 'selfheal-repair', source: '.github/workflows/selfheal-repair.yml', superseded: [{ launchd_label: 'com.helm.bridge-rca-repair' }] },
        { id: 'helm-demo-readiness', source: '~/.claude/scheduled-tasks/helm-demo-readiness' },
      ],
    };
    const names = knownRoutineNames(doc);
    expect(names.has('control-plane-weekly')).toBe(true);
    expect(names.has('com.helm.bridge-rca-repair')).toBe(true);
    expect(names.has('helm-demo-readiness')).toBe(true);
  });
  it('handles an empty registry', () => {
    expect(knownRoutineNames({ routines: [] }).size).toBe(0);
    expect(knownRoutineNames({}).size).toBe(0);
  });
});

describe('routines checks — end to end against disposable fixtures', () => {
  let repo: string;
  let home: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'a6-routines-repo-'));
    home = mkdtempSync(join(tmpdir(), 'a6-routines-home-'));
    mkdirSync(join(repo, 'config'), { recursive: true });
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  const writeRegistry = (routines: unknown[]) =>
    writeFileSync(join(repo, 'config', 'routines.yml'), `version: 1\nroutines: ${JSON.stringify(routines)}\n`);

  it('FAILs registry-exists when config/routines.yml is missing', async () => {
    const results = await routinesRun({ repoRoot: repo, homeDir: home });
    expect(results.find((r) => r.id === 'routines.registry-exists')?.status).toBe(Status.FAIL);
  });

  it('PASSes when there is nothing on disk to document', async () => {
    writeRegistry([]);
    const results = await routinesRun({ repoRoot: repo, homeDir: home });
    expect(results.find((r) => r.id === 'routines.launchd-documented')?.status).toBe(Status.PASS);
    expect(results.find((r) => r.id === 'routines.scheduled-tasks-documented')?.status).toBe(Status.PASS);
  });

  it('FAILs launchd-documented on an undocumented Helm-labeled plist', async () => {
    writeRegistry([]);
    mkdirSync(join(home, 'Library', 'LaunchAgents'), { recursive: true });
    writeFileSync(
      join(home, 'Library', 'LaunchAgents', 'com.helm.mystery.plist'),
      '<plist><dict><key>Label</key><string>com.helm.mystery</string></dict></plist>',
    );
    const results = await routinesRun({ repoRoot: repo, homeDir: home });
    const r = results.find((x) => x.id === 'routines.launchd-documented');
    expect(r?.status).toBe(Status.FAIL);
    expect(r?.evidence).toEqual([expect.objectContaining({ label: 'com.helm.mystery' })]);
  });

  it('does NOT flag a non-Helm plist (out of this repo\'s scope)', async () => {
    writeRegistry([]);
    mkdirSync(join(home, 'Library', 'LaunchAgents'), { recursive: true });
    writeFileSync(
      join(home, 'Library', 'LaunchAgents', 'com.google.keystone.agent.plist'),
      '<plist><dict><key>Label</key><string>com.google.keystone.agent</string></dict></plist>',
    );
    const results = await routinesRun({ repoRoot: repo, homeDir: home });
    expect(results.find((r) => r.id === 'routines.launchd-documented')?.status).toBe(Status.PASS);
  });

  it('PASSes launchd-documented when the plist label is recorded as superseded', async () => {
    writeRegistry([{ id: 'selfheal-repair', source: '.github/workflows/selfheal-repair.yml', superseded: [{ launchd_label: 'com.helm.bridge-rca-repair' }] }]);
    mkdirSync(join(home, 'Library', 'LaunchAgents'), { recursive: true });
    writeFileSync(
      join(home, 'Library', 'LaunchAgents', 'com.helm.bridge-rca-repair.plist'),
      '<plist><dict><key>Label</key><string>com.helm.bridge-rca-repair</string></dict></plist>',
    );
    const results = await routinesRun({ repoRoot: repo, homeDir: home });
    expect(results.find((r) => r.id === 'routines.launchd-documented')?.status).toBe(Status.PASS);
  });

  it('FAILs scheduled-tasks-documented on an undocumented task directory', async () => {
    writeRegistry([]);
    mkdirSync(join(home, '.claude', 'scheduled-tasks', 'helm-mystery-task'), { recursive: true });
    const results = await routinesRun({ repoRoot: repo, homeDir: home });
    const r = results.find((x) => x.id === 'routines.scheduled-tasks-documented');
    expect(r?.status).toBe(Status.FAIL);
    expect(r?.evidence).toEqual([expect.objectContaining({ name: 'helm-mystery-task' })]);
  });

  it('ignores stray non-directory entries (e.g. .DS_Store) under scheduled-tasks', async () => {
    writeRegistry([]);
    mkdirSync(join(home, '.claude', 'scheduled-tasks'), { recursive: true });
    writeFileSync(join(home, '.claude', 'scheduled-tasks', '.DS_Store'), 'binary junk');
    const results = await routinesRun({ repoRoot: repo, homeDir: home });
    expect(results.find((r) => r.id === 'routines.scheduled-tasks-documented')?.status).toBe(Status.PASS);
  });

  it('PASSes scheduled-tasks-documented when the directory is recorded via source', async () => {
    writeRegistry([{ id: 'helm-demo-readiness', source: '~/.claude/scheduled-tasks/helm-demo-readiness' }]);
    mkdirSync(join(home, '.claude', 'scheduled-tasks', 'helm-demo-readiness'), { recursive: true });
    const results = await routinesRun({ repoRoot: repo, homeDir: home });
    expect(results.find((r) => r.id === 'routines.scheduled-tasks-documented')?.status).toBe(Status.PASS);
  });
});
