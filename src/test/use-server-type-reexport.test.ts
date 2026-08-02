import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Regression guard: no `export type { … }` specifier list in a 'use server' module.
 *
 * Next.js's 'use server' transform registers EVERY name in an export
 * specifier list as a server action, including type-only ones. The emitted
 * module then evaluates a runtime reference to an identifier that TypeScript
 * erased, so the whole actions module dies at module-evaluation time with
 * `ReferenceError: <TypeName> is not defined` — taking down every action on
 * that surface, not just the type.
 *
 * Found 2026-08-02: `export type { MessageSearchResult, AttachmentUploadData }`
 * in src/app/golf/actions/messages.ts made golf messaging entirely
 * non-functional — send, mark-as-read, edit and delete all returned 500, and
 * the raw ReferenceError text rendered in the UI. typecheck, lint and the
 * unit suite were all green, because the failure only exists in the emitted
 * server bundle.
 *
 * Declaration forms (`export interface X {}`, `export type X = …`) are erased
 * normally and stay safe — this guard targets only the specifier-list form,
 * including the `export type { X } from '…'` re-export variant.
 */

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Walks the real filesystem rather than shelling out to `git grep`: an
 * offending file is usually brand new and still untracked when it is first
 * written, and `git grep` would skip exactly the file we most need to catch.
 */
function tsFilesUnder(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsFilesUnder(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function useServerFiles(): string[] {
  return tsFilesUnder(path.join(REPO_ROOT, 'src')).filter((file) =>
    /^\s*(['"])use server\1;?\s*$/m.test(readFileSync(file, 'utf8')),
  );
}

/** `export type { A, B }` and `export type { A } from '…'`, ignoring comments. */
const TYPE_SPECIFIER_EXPORT = /^\s*export\s+type\s*\{/;

describe("'use server' modules", () => {
  it('never re-export types with an `export type { … }` specifier list', () => {
    const offenders: string[] = [];

    for (const file of useServerFiles()) {
      const source = readFileSync(file, 'utf8');
      const rel = path.relative(REPO_ROOT, file);
      source.split('\n').forEach((line, i) => {
        if (TYPE_SPECIFIER_EXPORT.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `A 'use server' module re-exports a type via an export specifier list. ` +
        `Next.js registers each specifier as a server action, so the emitted ` +
        `module throws "ReferenceError: <TypeName> is not defined" on ` +
        `evaluation and EVERY action in the file stops working. Import the ` +
        `type from its canonical non-'use server' module instead.\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('finds a non-trivial number of files to check (guards against a vacuous scan)', () => {
    expect(useServerFiles().length).toBeGreaterThan(20);
  });
});
