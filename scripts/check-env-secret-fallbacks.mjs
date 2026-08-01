#!/usr/bin/env node
/**
 * Fail the build when a SECRET-SHAPED env var has a hardcoded literal fallback.
 *
 * WHY. `process.env.X ?? 'literal'` is a perfectly good pattern for a tuning
 * knob. It is a security hole for a credential: if the env var is never set in
 * the deployed environment, the literal IS the production value, and it is
 * sitting in the repository.
 *
 * Found this way on 2026-08-01, both absent from Vercel production and
 * therefore live:
 *
 *   SIGNUP_ACCESS_CODE ?? '1881'
 *     The global signup gate. Production was accepting "1881" — an
 *     unrate-limited four-digit code, published in a source comment.
 *
 *   CRM_UNSUB_SECRET || 'helm-sports-unsub-v1'
 *     The signing secret for unsubscribe tokens. A known secret means
 *     unsubscribe links can be forged for any recipient.
 *
 * Neither failed anything. Nothing logged. The app worked exactly as designed
 * — with the published default as the real credential. That is the failure
 * mode this catches: not an error, an absence.
 *
 * SCOPE. Deliberately narrow, to stay quiet enough to be worth reading:
 *   - only `src/` (runtime code; scripts/ are local dev tooling)
 *   - only names matching SECRET | KEY | TOKEN | PASSWORD | CODE | DSN
 *   - only a STRING-LITERAL fallback. `?? ''`, `?? undefined`, `?? null`,
 *     numbers and identifiers are all fine — an empty default is how you say
 *     "unset means disabled", which is the correct pattern.
 *   - NEXT_PUBLIC_* is exempt: those are compiled into the client bundle and
 *     are public by definition, so a literal default is not a leak.
 *
 * Usage:  node scripts/check-env-secret-fallbacks.mjs [--json]
 * Exit 1 with the offending sites, 0 when clean.
 */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SECRET_SHAPED = /(SECRET|_KEY|^KEY|TOKEN|PASSWORD|_CODE|DSN)/;
const EXEMPT_PREFIX = /^NEXT_PUBLIC_/;

// `process.env.NAME ?? 'literal'` or `process.env.NAME || "literal"`,
// optionally wrapped in parentheses.
const PATTERN =
  /process\.env\.([A-Z][A-Z0-9_]*)\s*(?:\?\?|\|\|)\s*(['"`])((?:(?!\2)[\s\S]){1,120})\2/g;

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      await walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) {
      out.push(p);
    }
  }
  return out;
}

const findings = [];
for (const file of await walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file);
  if (/__tests__|^src\/test\//.test(rel)) continue;
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  for (const m of src.matchAll(PATTERN)) {
    const name = m[1];
    const literal = m[3];
    if (EXEMPT_PREFIX.test(name)) continue;
    if (!SECRET_SHAPED.test(name)) continue;
    if (literal.trim() === '') continue; // "unset means disabled" — correct
    const line = src.slice(0, m.index).split('\n').length;
    findings.push({ file: rel, line, name, literal, source: lines[line - 1]?.trim() ?? '' });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
} else if (findings.length === 0) {
  console.log('OK  no secret-shaped env var has a hardcoded literal fallback');
} else {
  console.error(`FAIL  ${findings.length} secret-shaped env var(s) fall back to a hardcoded literal:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.source}`);
    console.error(`    -> if ${f.name} is unset in the deployed env, "${f.literal}" IS the production value.\n`);
  }
  console.error(
    'Fix: require the variable (throw when absent), or default to an empty\n' +
      'string and treat "unset" as "feature disabled". Do not ship a usable\n' +
      'credential as a fallback.\n',
  );
}

process.exit(findings.length === 0 ? 0 : 1);
