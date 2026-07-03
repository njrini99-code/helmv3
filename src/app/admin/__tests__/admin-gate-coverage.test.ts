/**
 * CONTRACT: every server entry point under src/app/admin must call
 * requireSuperAdmin() or checkSuperAdminAccess() before doing anything.
 *
 * This is a per-EXPORT check, not a whole-file substring search: for each
 * exported function in a page.tsx/layout.tsx/actions/*.ts file, the gate
 * must be reachable from that function's own body — either called directly,
 * or via a local wrapper it calls (e.g. triage.ts's
 * `withAdminObserved(name, opts, implThatCallsTheGate)` pattern). A
 * multi-export actions file where only SOME exports call the gate — e.g. a
 * 4th action added to golf-tracer.ts that forgets requireSuperAdmin() while
 * the other 3 already call it — now fails this test, where the old
 * whole-file `src.includes('requireSuperAdmin')` check would have silently
 * passed because the string already appeared once from a sibling export.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ADMIN_ROOT = join(process.cwd(), 'src/app/admin');
const GATE_NAMES = new Set(['requireSuperAdmin', 'checkSuperAdminAccess']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : walk(full);
    }
    return [full];
  });
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!mods?.some((m) => m.kind === kind);
}

/** Every top-level `export ...function...` / `export const x = (async) () => {}`. */
function getExportedFunctions(sourceFile: ts.SourceFile): Array<{ name: string; node: ts.Node }> {
  const results: Array<{ name: string; node: ts.Node }> = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.body && hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
      results.push({ name: stmt.name?.text ?? (isDefault ? 'default export' : '<anonymous>'), node: stmt.body });
    } else if (ts.isVariableStatement(stmt) && hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          results.push({ name: decl.name.text, node: decl.initializer.body });
        }
      }
    }
  }
  return results;
}

/** Top-level local declarations (function decls + const/let/var initializers),
 *  used to follow wrapper indirection like `withAdminObserved(name, opts, impl)`. */
function collectLocalDecls(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const decls = new Map<string, ts.Node>();
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      decls.set(stmt.name.text, stmt.body);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) {
          decls.set(d.name.text, d.initializer);
        }
      }
    }
  }
  return decls;
}

function collectReferencedIdentifiers(node: ts.Node): Set<string> {
  const ids = new Set<string>();
  (function visit(n: ts.Node) {
    if (ts.isIdentifier(n)) ids.add(n.text);
    ts.forEachChild(n, visit);
  })(node);
  return ids;
}

/**
 * True when the gate is reachable from `startNode` by following identifiers
 * that resolve to other locally-declared functions/consts in the SAME file.
 * Bounded BFS over a small per-file graph — no risk of runaway recursion.
 */
function gateReachable(startNode: ts.Node, localDecls: Map<string, ts.Node>): boolean {
  const visited = new Set<ts.Node>();
  const queue: ts.Node[] = [startNode];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    const ids = collectReferencedIdentifiers(node);
    for (const id of ids) {
      if (GATE_NAMES.has(id)) return true;
    }
    for (const id of ids) {
      const decl = localDecls.get(id);
      if (decl && !visited.has(decl)) queue.push(decl);
    }
  }
  return false;
}

/** Returns the names of exported functions in `sourceText` that never reach
 *  requireSuperAdmin()/checkSuperAdminAccess(). Empty array = fully gated. */
export function findUngatedExports(sourceText: string, fileName = 'file.tsx'): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const localDecls = collectLocalDecls(sourceFile);
  const exported = getExportedFunctions(sourceFile);
  return exported
    .filter(({ node }) => !gateReachable(node, localDecls))
    .map(({ name }) => name);
}

describe('admin gate coverage', () => {
  it('every exported function in every page.tsx, layout.tsx and actions/*.ts under src/app/admin reaches the gate', () => {
    const files = walk(ADMIN_ROOT).filter(
      (f) =>
        f.endsWith('/page.tsx') ||
        f.endsWith('/layout.tsx') ||
        (f.includes('/actions/') && f.endsWith('.ts')),
    );
    expect(files.length).toBeGreaterThan(0);

    const missing = files.flatMap((f) => {
      const src = readFileSync(f, 'utf8');
      return findUngatedExports(src, f).map((name) => `${f} :: ${name}`);
    });
    expect(missing).toEqual([]);
  });

  it('flags a specific export that forgets the gate even when sibling exports in the same file call it', () => {
    // Mirrors the exact regression this test exists to catch: golf-tracer.ts
    // gains a 4th exported action that forgets requireSuperAdmin() while the
    // other 3 already call it. A whole-file substring search would pass this
    // (the string appears 3 times); the per-export check must not.
    const src = `
      export async function bridgeGetTracerData() {
        await requireSuperAdmin();
        return getTracerData();
      }
      export async function bridgeGetTracerRoundDiagnostic(roundId: string) {
        await requireSuperAdmin();
        return getTracerRoundDiagnostic(roundId);
      }
      export async function bridgeDeleteRound(roundId: string) {
        // forgot the gate
        return deleteRound(roundId);
      }
    `;
    expect(findUngatedExports(src)).toEqual(['bridgeDeleteRound']);
  });

  it('recognizes the gate reached through a local wrapper (withAdminObserved indirection)', () => {
    // Mirrors triage.ts's real pattern: the exported function delegates to a
    // local const built by wrapping an impl function that itself calls the
    // gate. This must NOT be flagged as ungated.
    const src = `
      async function resolveTriageEventsImpl(eventIds: string[]) {
        await requireSuperAdmin();
        return doResolve(eventIds);
      }
      const observedResolveTriageEvents = withAdminObserved(
        'resolveTriageEvents',
        { sport: 'shared' },
        resolveTriageEventsImpl,
      );
      export async function resolveTriageEvents(eventIds: string[]) {
        return observedResolveTriageEvents(eventIds);
      }
    `;
    expect(findUngatedExports(src)).toEqual([]);
  });

  it('does not require non-function exports (e.g. `export const dynamic`) to call the gate', () => {
    const src = `
      export const dynamic = 'force-dynamic';
      export default async function Page() {
        await requireSuperAdmin();
        return null;
      }
    `;
    expect(findUngatedExports(src)).toEqual([]);
  });
});
