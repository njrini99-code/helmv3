// Undocumented routines: a launchd plist or a Claude Code scheduled-task
// directory that names a Helm-relevant automation NOT recorded in
// config/routines.yml. config/routines.yml's own header explains why this
// is needed — four different trigger mechanisms, no single existing config
// lists all of them, and one of them (launchd) can leave a plist behind,
// unloaded, after the routine's actual work moves to GitHub Actions.
//
// Scoped to HELM-RELEVANT entries only (label/dirname containing "helm",
// case-insensitively) — ~/Library/LaunchAgents holds plists for whatever
// else runs on this machine (this repo found five unrelated ones — Google
// Update/Keystone, OpenClaw — while building this check), and none of that
// is this repo's business to police.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import { check, Status } from '../result.mjs';

export const meta = { id: 'routines', title: 'Routine registry' };

/** Extract a launchd plist's Label (XML plist — no external dependency needed for one key). */
export function plistLabel(xml) {
  const m = /<key>\s*Label\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/.exec(xml ?? '');
  return m ? m[1] : null;
}

/** The set of names config/routines.yml already accounts for: ids + any recorded launchd_label / scheduled-task basename. */
export function knownRoutineNames(routinesDoc) {
  const names = new Set();
  for (const r of routinesDoc?.routines ?? []) {
    if (r.id) names.add(r.id);
    for (const s of r.superseded ?? []) {
      if (s.launchd_label) names.add(s.launchd_label);
    }
    if (typeof r.source === 'string') {
      // ~/.claude/scheduled-tasks/<name> — the last path segment is the
      // scheduled-task directory's own basename.
      const seg = r.source.split('/').filter(Boolean).pop();
      if (seg) names.add(seg);
    }
  }
  return names;
}

function loadRoutinesDoc(repoRoot) {
  const p = join(repoRoot, 'config', 'routines.yml');
  if (!existsSync(p)) return { doc: null, missing: true };
  try {
    return { doc: YAML.parse(readFileSync(p, 'utf-8')), missing: false };
  } catch (err) {
    return { doc: null, missing: false, error: String(err) };
  }
}

export async function run(ctx) {
  const { repoRoot } = ctx;
  const homeDir = ctx.homeDir ?? homedir();

  const { doc, missing, error } = loadRoutinesDoc(repoRoot);
  if (missing) return [check('routines.registry-exists', Status.FAIL, 'config/routines.yml is missing — no registry to check undocumented routines against')];
  if (error) return [check('routines.registry-parse', Status.BLOCKED, 'config/routines.yml is not valid YAML', { detail: error })];

  const known = knownRoutineNames(doc);
  const out = [check('routines.registry-parse', Status.PASS, `${(doc.routines ?? []).length} routine(s) registered`)];

  // --- launchd plists (~/Library/LaunchAgents and, if it ever exists, config/launchd/) ---
  const plistDirs = [join(homeDir, 'Library', 'LaunchAgents'), join(repoRoot, 'config', 'launchd')];
  const undocumentedPlists = [];
  let plistsScanned = 0;
  for (const dir of plistDirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.plist'))) {
      const full = join(dir, name);
      // Read directly and let a missing or non-file entry throw: a stat first
      // is the check-then-use race CodeQL flags (js/file-system-race).
      let contents;
      try {
        contents = readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      const label = plistLabel(contents) ?? name.replace(/\.plist$/, '');
      if (!/helm/i.test(label) && !/helm/i.test(name)) continue; // out of scope: not this repo's routine
      plistsScanned += 1;
      if (!known.has(label)) undocumentedPlists.push({ file: full, label });
    }
  }
  out.push(
    undocumentedPlists.length === 0
      ? check('routines.launchd-documented', Status.PASS, `${plistsScanned} Helm-relevant launchd plist(s), all recorded in config/routines.yml`)
      : check('routines.launchd-documented', Status.FAIL,
          `${undocumentedPlists.length} Helm-relevant launchd plist(s) not in config/routines.yml`, {
            evidence: undocumentedPlists,
            source: 'config/routines.yml',
          }),
  );

  // --- Claude Code scheduled-task directories ---
  const tasksDir = join(homeDir, '.claude', 'scheduled-tasks');
  const undocumentedTasks = [];
  let tasksScanned = 0;
  if (existsSync(tasksDir)) {
    for (const name of readdirSync(tasksDir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue; // skip .DS_Store and any stray file
      tasksScanned += 1;
      if (!known.has(name.name)) undocumentedTasks.push({ dir: join(tasksDir, name.name), name: name.name });
    }
  }
  out.push(
    undocumentedTasks.length === 0
      ? check('routines.scheduled-tasks-documented', Status.PASS, `${tasksScanned} scheduled-task dir(s), all recorded in config/routines.yml`)
      : check('routines.scheduled-tasks-documented', Status.FAIL,
          `${undocumentedTasks.length} scheduled-task dir(s) not in config/routines.yml`, {
            evidence: undocumentedTasks,
            source: 'config/routines.yml',
          }),
  );

  return out;
}
