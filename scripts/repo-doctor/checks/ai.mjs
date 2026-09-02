// AI control-plane authority: CLAUDE.md must import the constitution (AGENTS.md),
// and the project must set the expected auto-memory policy. A broken authority
// link means two independent instruction documents can silently disagree.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, Status } from '../result.mjs';

export const meta = { id: 'ai', title: 'AI control plane' };

export async function run(ctx) {
  const out = [];
  const { repoRoot, manifest } = ctx;
  const constitution = manifest?.authority?.constitution ?? 'AGENTS.md';
  const adapter = manifest?.authority?.claude_adapter ?? 'CLAUDE.md';

  const constitutionPath = join(repoRoot, constitution);
  const adapterPath = join(repoRoot, adapter);

  out.push(
    existsSync(constitutionPath)
      ? check('ai.constitution-exists', Status.PASS, `${constitution} present`)
      : check('ai.constitution-exists', Status.FAIL, `${constitution} missing`, { expected: constitution }),
  );

  if (!existsSync(adapterPath)) {
    out.push(check('ai.adapter-exists', Status.FAIL, `${adapter} missing`, { expected: adapter }));
  } else {
    const body = readFileSync(adapterPath, 'utf-8');
    // Accept `@AGENTS.md` (the real import) anywhere in the adapter.
    const importsIt = new RegExp(`@${constitution.replace('.', '\\.')}(\\s|$)`, 'm').test(body);
    out.push(
      importsIt
        ? check('ai.authority-link', Status.PASS, `${adapter} imports @${constitution}`)
        : check('ai.authority-link', Status.FAIL,
            `${adapter} does not import @${constitution} — the constitution is not loaded`, {
              source: 'config/repo/manifest.yml (authority.*)',
            }),
    );
  }

  // Auto-memory policy: the project expects it explicitly disabled.
  const settingsPath = join(repoRoot, '.claude/settings.json');
  if (existsSync(settingsPath)) {
    try {
      const s = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      out.push(
        s.autoMemoryEnabled === false
          ? check('ai.auto-memory', Status.PASS, 'autoMemoryEnabled: false (explicit)')
          : check('ai.auto-memory', Status.WARN,
              'autoMemoryEnabled is not explicitly false in .claude/settings.json', {
                actual: s.autoMemoryEnabled ?? '(absent)',
              }),
      );
    } catch (err) {
      out.push(check('ai.settings-parse', Status.FAIL, '.claude/settings.json is not valid JSON', { detail: String(err) }));
    }
  }

  return out;
}
