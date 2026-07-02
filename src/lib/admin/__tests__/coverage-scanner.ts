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
 * `undelegatedWraps` — audit N4 hardening: names in `wrapped` for which the
 * `export async function N` block does NOT reference the observed const
 * that `withAdminObserved('N', ...)` was assigned to. Plain textual
 * co-occurrence of the registration and the export (the original `wrapped`
 * check) proves a wrapper exists somewhere in the file — it does NOT prove
 * the export actually calls it. A registration that nothing delegates to is
 * dead code that silently defeats coverage (see fixtures/
 * broken-delegation.fixture.ts for the self-test case).
 */

import { readFileSync } from 'node:fs';

export interface ScannedFile {
  file: string;
  exports: string[];
  wrapped: Map<string, { feature: string | null }>;
  undelegatedWraps: Set<string>;
}

const EXPORT_RE = /^export async function (\w+)/gm;

// const observedX = withAdminObserved('name', { ...opts... }, implRef) — the
// opts object is a single (non-nested) object literal in every exemplar/spec
// usage, so a `[^}]*` capture up to the first `}` is sufficient and avoids
// pulling in a full JS parser for a test-only static scan. Every real call
// site in the codebase assigns the wrapper to a `const <name> = ...` on one
// line (verified against all 810 withAdminObserved occurrences repo-wide),
// so requiring that prefix lets us recover the observed-const identifier
// needed for the delegation check below.
const WRAP_RE = /const\s+(\w+)\s*=\s*withAdminObserved\(\s*['"](\w+)['"]\s*,\s*(\{[^}]*\})/g;
const FEATURE_RE = /feature\s*:\s*['"](\w+)['"]/;

// Bounds the text window searched for a delegation reference: from an export
// function's signature line to the start of the NEXT top-level declaration
// (another `export async function`, `async function`, or `const X = ...`).
// Top-level declarations are always column-0 in this codebase's formatting,
// while everything inside a function body is indented — so this reliably
// finds "the rest of this function" without needing real brace-depth
// matching (which a naive "next line that is exactly `}`" gets wrong when a
// parameter's inline object-literal type closes at column 0 before the
// function's actual body, e.g. `export async function f(data: {\n...\n}): X {`).
const TOP_LEVEL_DECL_RE = /^(?:export\s+)?(?:async\s+)?function\s+\w+|^const\s+\w+\s*=/gm;

function exportBlockFor(source: string, exportName: string): string | null {
  const startRe = new RegExp(`^export async function ${exportName}\\b`, 'm');
  const startMatch = startRe.exec(source);
  if (!startMatch) return null;
  const start = startMatch.index;

  const declRe = new RegExp(TOP_LEVEL_DECL_RE.source, TOP_LEVEL_DECL_RE.flags);
  declRe.lastIndex = start + 1;
  const nextDecl = declRe.exec(source);
  const end = nextDecl ? nextDecl.index : source.length;

  return source.slice(start, end);
}

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
  const undelegatedWraps = new Set<string>();
  {
    const re = new RegExp(WRAP_RE.source, WRAP_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const constName = m[1];
      const name = m[2];
      const optsSrc = m[3];
      if (!constName || !name || !optsSrc) continue;
      const featureMatch = FEATURE_RE.exec(optsSrc);
      wrapped.set(name, { feature: featureMatch?.[1] ?? null });

      const block = exportBlockFor(source, name);
      const delegates = block !== null && new RegExp(`\\b${constName}\\b`).test(block);
      if (!delegates) undelegatedWraps.add(name);
    }
  }

  return { file: absPath, exports, wrapped, undelegatedWraps };
}
