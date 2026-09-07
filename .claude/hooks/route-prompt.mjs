#!/usr/bin/env node
// .claude/hooks/route-prompt.mjs — UserPromptSubmit
//
// Two independent, additive hints, combined into one `additionalContext`
// when either fires. Cheap and silent when neither matches — this runs on
// every prompt submission, so it must never be a source of latency or noise.
//
// 1. DOOR HINTS — a fast, local keyword match against the prompt text,
//    pointing an obvious prompt shape at the repo's own doors: `/land`,
//    `/worktree`, `/gates`, `/held`, the `helm-sentry` skill, and Supabase/
//    migration work. No subprocess, no I/O — a handful of regex tests.
//
// 2. FEATURE-DOC MAPPING (pre-existing) — if the prompt text names a
//    repo-relative path under src/, supabase/, scripts/, memory/, or docs/,
//    run `node scripts/knowledge/map-changed-files.mjs --files <paths>`
//    (10s timeout) and surface the mapped feature docs.
//
// If neither fires, exit 0 silently. Never fails the prompt — any error here
// degrades to a silent no-op, never a blocked submission.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

// Matches e.g. `src/lib/foo.ts`, `supabase/migrations/0001_x.sql`,
// `scripts/knowledge/map-changed-files.mjs`, `memory/features/x.md`,
// `docs/REPO_MAP.md`. Deliberately permissive about the path body — this
// only gates whether we bother invoking the mapper, the mapper itself
// tolerates paths that don't map to anything.
const PATH_RE = /\b(?:src|supabase|scripts|memory|docs)\/[A-Za-z0-9._/-]+/g;

function readStdinJson() {
  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolvePromise(JSON.parse(data || '{}'));
      } catch {
        resolvePromise({});
      }
    });
    process.stdin.on('error', () => resolvePromise({}));
  });
}

/** Repo-relative paths named in free text, deduplicated, in order. */
export function extractPaths(text) {
  const matches = String(text || '').match(PATH_RE) || [];
  // Strip trailing punctuation a sentence would attach (".", ",", ")", etc).
  const cleaned = matches.map((m) => m.replace(/[.,;:)\]]+$/, ''));
  return [...new Set(cleaned)];
}

// Order matters: first match wins per category, but every category that
// matches contributes a line. Deliberately keyword-based and cheap — no
// subprocess, no network, evaluated on every prompt.
const DOOR_HINTS = [
  { door: '/land', re: /\b(land|merge)\b[^.?!]{0,40}\b(this|the)\b[^.?!]{0,20}\b(pr|branch)\b|\bland\s+(this\s+)?pr\b|\blanding\s+(this|the)\b/i },
  { door: '/worktree', re: /\bnew\s+worktree\b|\bstart\s+(a\s+)?(new\s+)?task\b|\bcreate\s+a\s+worktree\b|\bspin\s+up\s+a\s+worktree\b/i },
  { door: '/gates', re: /\brun\s+(the\s+)?gates\b|\brun\s+(the\s+)?(ci\s+)?tests?\b|\btypecheck\s+and\s+lint\b|\brun\s+the\s+ci\b/i },
  { door: '/held', re: /\bheld\s+migrations?\b|\bmigrations?\s+on\s+hold\b|\bHELD\.md\b/i },
  { door: 'helm-sentry skill', re: /\bsentry\b|\bproduction\s+error\b|\bstack\s+trace\b|\bpaging\s+alert\b/i },
  { door: 'supabase:supabase skill', re: /\bmigration\b|\brls\b|\bsupabase\b|\bpostgres\b/i },
];

/** Door hints whose keyword regex matches the prompt text, in listed order. */
export function matchDoorHints(text) {
  const t = String(text || '');
  return DOOR_HINTS.filter((h) => h.re.test(t)).map((h) => h.door);
}

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
    }),
  );
}

async function run() {
  const input = await readStdinJson();
  const prompt = input?.prompt ?? input?.user_prompt ?? '';
  const lines = [];

  const doors = matchDoorHints(prompt);
  if (doors.length > 0) {
    lines.push(`This prompt looks like it belongs at: ${doors.join(', ')}.`);
  }

  const paths = extractPaths(prompt);
  if (paths.length > 0) {
    const cwd = input?.cwd || process.cwd();
    const scriptPath = resolve(cwd, 'scripts/knowledge/map-changed-files.mjs');

    let result;
    try {
      result = spawnSync('node', [scriptPath, '--files', ...paths], {
        cwd,
        encoding: 'utf-8',
        timeout: 10_000,
      });
    } catch {
      result = null;
    }

    if (result && !result.error && result.status === 0 && result.stdout) {
      try {
        const parsed = JSON.parse(result.stdout);
        const featureDocs = [
          ...new Set((parsed.impactedFeatures ?? []).flatMap((f) => f.docs ?? [])),
        ];
        if (featureDocs.length > 0) {
          lines.push(`Mapped feature docs for the paths in this prompt: ${featureDocs.join(', ')}`);
        }
      } catch {
        // Mapper produced something unparseable — skip this line, not the whole hook.
      }
    }
  }

  if (lines.length > 0) {
    emit(lines.join(' '));
  }
  process.exit(0);
}

if (process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})()) {
  run().catch(() => process.exit(0));
}
