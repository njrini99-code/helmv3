/**
 * Guard: a `'use server'` module may only export async functions.
 *
 * Next.js appends `ensureServerEntryExports([...])` to every `'use server'`
 * module and throws at MODULE LOAD — "A \"use server\" file can only export
 * async functions, found object." — so one non-function export breaks every
 * server action on every page whose action graph reaches that module.
 *
 * Incident (2026-10-13, fingerprint d9ed17ef): `export const __testables = {…}`
 * in src/app/lifting/actions/invites.ts (added by #1872) made every POST to
 * /baseball/coach-onboarding 500 (that page imports lifting/actions/onboarding,
 * which imports invites). A real coach hit it 12 times in 3 minutes.
 *
 * Type-only exports (`export type`, `export interface`) are erased and fine.
 * This is a static scan, so it catches the class before a build or a user does.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** True when the file's first statement is the `'use server'` directive. */
function isUseServerModule(source: string): boolean {
  const stripped = source.replace(/^﻿/, '').replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, '');
  return /^['"]use server['"]/.test(stripped);
}

/** A right-hand side that is plainly not a function value. */
const NON_FUNCTION_RHS = /^(\{|\[|['"`]|-?\d|new\s|true\b|false\b|null\b|undefined\b|Object\.freeze\()/;

function nonFunctionExports(source: string): string[] {
  const found: string[] = [];
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    const decl = line.match(/^export\s+(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(.*)$/);
    if (decl && NON_FUNCTION_RHS.test(decl[2].trim())) found.push(`${decl[1]} (line ${i + 1})`);
    const def = line.match(/^export\s+default\s+(.*)$/);
    if (def && NON_FUNCTION_RHS.test(def[1].trim())) found.push(`default (line ${i + 1})`);
  });
  return found;
}

describe("'use server' modules export only functions", () => {
  it('detects the incident shape', () => {
    expect(nonFunctionExports("'use server';\nexport const __testables = {\n  a,\n};\n")).toEqual([
      '__testables (line 2)',
    ]);
    expect(nonFunctionExports('export const ok = async () => {};\nexport type T = { a: 1 };\n')).toEqual([]);
    expect(isUseServerModule("// header\n/* block */\n'use server';\n")).toBe(true);
    expect(isUseServerModule("'use client';\n")).toBe(false);
  });

  it('no src/ use-server module exports an object, array or literal', () => {
    const violations: string[] = [];
    for (const file of walk(SRC)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!isUseServerModule(source)) continue;
      for (const v of nonFunctionExports(source)) violations.push(`${path.relative(SRC, file)}: ${v}`);
    }
    expect(violations).toEqual([]);
  });
});
