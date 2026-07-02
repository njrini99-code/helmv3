/**
 * Helm Bridge coverage scanner (W15 Task 4 — test-only util, not shipped).
 *
 * Static source scan of a `'use server'` action file — no runtime import,
 * so it is safe to run against files that would otherwise pull in
 * `next/headers`/`next/cache`/Supabase server clients inside vitest.
 *
 * `exports` — every top-level `export async function <name>` in the file.
 * `wrapped` — every export N for which the file ALSO contains an
 * `withAdminObserved('N', { ... }, ...)` call registered under the SAME
 * public name N (the Impl+delegator pattern, spec §2.3). The captured
 * `feature` is whatever string literal follows `feature:` inside that
 * call's opts object literal (or null if none is present).
 */

import { readFileSync } from 'node:fs';

export interface ScannedFile {
  file: string;
  exports: string[];
  wrapped: Map<string, { feature: string | null }>;
}

const EXPORT_RE = /^export async function (\w+)/gm;

// withAdminObserved('name', { ...opts... }, implRef) — the opts object is a
// single (non-nested) object literal in every exemplar/spec usage, so a
// `[^}]*` capture up to the first `}` is sufficient and avoids pulling in a
// full JS parser for a test-only static scan.
const WRAP_RE = /withAdminObserved\(\s*['"](\w+)['"]\s*,\s*(\{[^}]*\})/g;
const FEATURE_RE = /feature\s*:\s*['"](\w+)['"]/;

export function scanActionFile(absPath: string): ScannedFile {
  const source = readFileSync(absPath, 'utf8');

  const exports: string[] = [];
  {
    const re = new RegExp(EXPORT_RE.source, EXPORT_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const name = m[1];
      if (name) exports.push(name);
    }
  }

  const wrapped = new Map<string, { feature: string | null }>();
  {
    const re = new RegExp(WRAP_RE.source, WRAP_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const name = m[1];
      const optsSrc = m[2];
      if (!name || !optsSrc) continue;
      const featureMatch = FEATURE_RE.exec(optsSrc);
      wrapped.set(name, { feature: featureMatch?.[1] ?? null });
    }
  }

  return { file: absPath, exports, wrapped };
}
