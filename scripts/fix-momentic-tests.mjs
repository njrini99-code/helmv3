#!/usr/bin/env node
/**
 * ============================================================================
 * fix-momentic-tests — repair the mechanically-broken checks in the Momentic suite
 * ----------------------------------------------------------------------------
 * The Momentic suite lives on its own branch (momentic/tests/**). Several of its
 * failures are not product bugs but checks that cannot pass against this app.
 * This script rewrites them in place.
 *
 * Full reasoning per failure: docs/testing/momentic-failure-triage-2026-07-28.md
 *
 * Usage (from the branch that has momentic/tests/):
 *   node scripts/fix-momentic-tests.mjs            # dry run — prints the diff plan
 *   node scripts/fix-momentic-tests.mjs --write    # apply
 *   node scripts/fix-momentic-tests.mjs --write --root momentic
 *
 * Idempotent: running it twice changes nothing the second time.
 * ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const rootArgIndex = args.indexOf('--root');
const ROOT = resolve(rootArgIndex === -1 ? 'momentic' : args[rootArgIndex + 1]);
const CWD = process.cwd();

/* -------------------------------------------------------------------------- */
/* Fix 1 — `checkPageDoesNotContain: "404"` can never pass on any Helm page.  */
/*                                                                            */
/* Next.js inlines the root not-found boundary into every page's RSC flight    */
/* payload, so "404", "Page not found" and the rest of src/app/not-found.tsx's */
/* copy appear in the HTML of pages that returned 200. Verified against        */
/* production: `curl -s https://helmsportslabs.com/products | grep -c 404` → 1.*/
/*                                                                            */
/* There is therefore NO text-only way to detect a real 404 here. Replace the  */
/* check with a browser-side read of the RENDERED DOM, which the flight        */
/* payload cannot contaminate. Deterministic, no AI call, no URL needed.       */
/* -------------------------------------------------------------------------- */

/** Text values whose `checkPageDoesNotContain` is a guaranteed false positive. */
const UNUSABLE_ABSENCE_TEXTS = new Set([
  '404',
  'Page not found',
  'page not found',
  "Sorry, we couldn't find the page you're looking for.",
]);

const NOT_FOUND_GUARD_ID = 'momentic-not-found-guard';

function notFoundGuardStep(indent) {
  // Emitted with the caller's indentation so nested steps (inside `if.then`)
  // stay valid YAML.
  const body = [
    `- javascript:`,
    `    # ${NOT_FOUND_GUARD_ID}: reads the rendered DOM, not the inlined RSC`,
    `    # payload that makes checkPageDoesNotContain "404" always fail here.`,
    `    environment: browser`,
    `    code: |-`,
    `      const heading = document.querySelector('h1');`,
    `      const title = (heading?.textContent ?? '').trim();`,
    `      if (title === '404' || /^page not found$/i.test(title)) {`,
    `        throw new Error('Rendered the not-found page: ' + location.pathname);`,
    `      }`,
  ];
  return body.map((line) => indent + line).join('\n');
}

/**
 * Rewrite every `checkPageDoesNotContain` whose text is one of the unusable
 * values. Handles both the scalar shorthand and the `text:` object form, at any
 * indentation.
 *
 * Each match is replaced ONE-FOR-ONE rather than de-duplicated: a check can be
 * the only step inside an `if.then` block, and deleting it outright would leave
 * `then:` empty — invalid YAML. Idempotency comes for free, since after the
 * rewrite there is no matching `checkPageDoesNotContain` left to match.
 */
function fixUnusableAbsenceChecks(source) {
  const lines = source.split('\n');
  const out = [];
  let changed = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = /^(\s*)- checkPageDoesNotContain:(.*)$/.exec(line);
    if (!match) {
      out.push(line);
      continue;
    }

    const [, indent, inlineRest] = match;
    const inlineValue = unquote(inlineRest.trim());

    // Scalar shorthand: `- checkPageDoesNotContain: "404"`
    if (inlineValue !== null && inlineValue !== '') {
      if (UNUSABLE_ABSENCE_TEXTS.has(inlineValue)) {
        out.push(notFoundGuardStep(indent));
        changed += 1;
        continue;
      }
      out.push(line);
      continue;
    }

    // Object form: the `text:` key is on a following, more-indented line.
    const blockLines = [line];
    let j = i + 1;
    let blockText = null;
    while (j < lines.length) {
      const next = lines[j];
      if (next.trim() === '') {
        blockLines.push(next);
        j += 1;
        continue;
      }
      const nextIndent = next.match(/^\s*/)[0].length;
      if (nextIndent <= indent.length) break;
      const textMatch = /^\s*text:\s*(.*)$/.exec(next);
      if (textMatch) blockText = unquote(textMatch[1].trim());
      blockLines.push(next);
      j += 1;
    }

    if (blockText !== null && UNUSABLE_ABSENCE_TEXTS.has(blockText)) {
      out.push(notFoundGuardStep(indent));
      changed += 1;
      i = j - 1;
      continue;
    }

    out.push(...blockLines);
    i = j - 1;
  }

  return { source: out.join('\n'), changed };
}

function unquote(raw) {
  if (raw === undefined || raw === null) return null;
  const value = raw.trim();
  if (value === '') return '';
  if (value.startsWith('#')) return '';
  const quoted = /^(['"])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

/* -------------------------------------------------------------------------- */
/* Fix 2 — pin the golf login form selectors.                                 */
/*                                                                            */
/* `into: Password input` is ambiguous: src/components/ui/input.tsx renders a  */
/* show/hide toggle with aria-label "Show password" next to every password     */
/* field, so an AI locator sees two candidates and typing into the button is   */
/* an action failure. Both input ids are stable and server-rendered.           */
/* -------------------------------------------------------------------------- */

const LOGIN_SELECTOR_FIXES = [
  [/^(\s*)into: Email input\s*$/m, '$1css: "#golf-signin-email"'],
  [/^(\s*)into: Password input\s*$/m, '$1css: "#golf-signin-password"'],
];

function fixLoginSelectors(source, relPath) {
  if (!/password-login/.test(relPath)) return { source, changed: 0 };
  let changed = 0;
  let next = source;
  for (const [pattern, replacement] of LOGIN_SELECTOR_FIXES) {
    const global = new RegExp(pattern.source, 'gm');
    next = next.replace(global, (...groups) => {
      changed += 1;
      return replacement.replace('$1', groups[1]);
    });
  }
  return { source: next, changed };
}

/* -------------------------------------------------------------------------- */
/* Fix 3 — the roster card click target.                                      */
/*                                                                            */
/* Neither the card body nor the player name navigates. FairwayPlayerCard      */
/* exposes one route into the profile: a full-width "View player" CTA. The     */
/* card also holds a status badge, an intent control and an actions menu, so   */
/* making the whole card clickable would nest interactives inside a button —   */
/* the hydration-crash class CLAUDE.md calls out.                             */
/* -------------------------------------------------------------------------- */

function fixRosterClickTarget(source) {
  const pattern = /^(\s*)- click: the first player card or player name on the roster\s*$/gm;
  let changed = 0;
  const next = source.replace(pattern, (_full, indent) => {
    changed += 1;
    return `${indent}- click: the "View player" button on the first roster card`;
  });
  return { source: next, changed };
}

/* -------------------------------------------------------------------------- */
/* Fix 4 — the idle-timeout cookie step.                                      */
/*                                                                            */
/* Momentic's `cookie` command takes a bare `name=value`. Appending "; Path=/" */
/* puts cookie ATTRIBUTES inside the value, which is the "Unknown error".      */
/*                                                                            */
/* Note this only makes the step run — the test still cannot pass. Middleware  */
/* refuses to idle-expire a session younger than the 8h window (the guard from */
/* the 2026-07-20 premature-logout incident), so a fresh login can never trip  */
/* the timeout. See the triage doc; prefer deleting the test in favour of the  */
/* existing middleware-idle-timeout unit suites.                               */
/* -------------------------------------------------------------------------- */

function fixIdleCookieStep(source) {
  const pattern =
    /code:\s*return\s*'sb_last_activity='\s*\+\s*\(Date\.now\(\)\s*-\s*9\s*\*\s*60\s*\*\s*60\s*\*\s*1000\)\s*\+\s*'; Path=\/';?/;
  if (!pattern.test(source)) return { source, changed: 0 };
  const next = source
    .replace(pattern, "code: return String(Date.now() - 9 * 60 * 60 * 1000)")
    .replace(/saveAs: STALE_ACTIVITY_COOKIE/, 'saveAs: STALE_ACTIVITY_MS')
    .replace(
      /- cookie: "\{\{ env\.STALE_ACTIVITY_COOKIE \}\}"/,
      '- cookie: "sb_last_activity={{ env.STALE_ACTIVITY_MS }}"',
    );
  return { source: next, changed: next === source ? 0 : 1 };
}

/* -------------------------------------------------------------------------- */

const FIXES = [
  { name: 'unusable 404 / not-found absence check', apply: (s) => fixUnusableAbsenceChecks(s) },
  { name: 'ambiguous login field selector', apply: (s, p) => fixLoginSelectors(s, p) },
  { name: 'roster card click target', apply: (s) => fixRosterClickTarget(s) },
  { name: 'malformed idle-timeout cookie', apply: (s) => fixIdleCookieStep(s) },
];

async function collectYaml(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return found;
    throw error;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectYaml(full)));
    } else if (/\.(test|module)\.yaml$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const files = await collectYaml(ROOT);

if (files.length === 0) {
  console.error(
    `No *.test.yaml / *.module.yaml under ${relative(CWD, ROOT) || ROOT}.\n` +
      'Run this from the branch that carries the Momentic suite, or pass --root <dir>.',
  );
  process.exit(1);
}

let touchedFiles = 0;
const totals = new Map(FIXES.map((fix) => [fix.name, 0]));

for (const file of files) {
  const relPath = relative(CWD, file);
  const original = readFileSync(file, 'utf8');
  let current = original;
  const applied = [];

  for (const fix of FIXES) {
    const result = fix.apply(current, relPath);
    if (result.changed > 0) {
      current = result.source;
      applied.push(`${fix.name} ×${result.changed}`);
      totals.set(fix.name, totals.get(fix.name) + result.changed);
    }
  }

  if (current === original) continue;

  touchedFiles += 1;
  console.log(`${WRITE ? 'fixed' : 'would fix'}  ${relPath}`);
  for (const entry of applied) console.log(`          ${entry}`);
  if (WRITE) writeFileSync(file, current, 'utf8');
}

console.log('');
console.log(`Scanned ${files.length} file(s) under ${relative(CWD, ROOT) || ROOT}.`);
if (touchedFiles === 0) {
  console.log('Nothing to change — the suite is already clean.');
} else {
  for (const [name, count] of totals) {
    if (count > 0) console.log(`  ${name}: ${count}`);
  }
  console.log(`${WRITE ? 'Rewrote' : 'Would rewrite'} ${touchedFiles} file(s).`);
  if (!WRITE) console.log('Re-run with --write to apply.');
  console.log('');
  console.log('Then: npx momentic lint && npx momentic check');
}
