/**
 * Static guard: a Server Component must not pass a function as a JSX prop to
 * a Client Component.
 *
 * React throws at render time — "Functions cannot be passed directly to Client
 * Components unless you explicitly expose it by marking it with 'use server'"
 * — which is an unrecoverable crash of the whole route, not a degraded panel.
 * It cost the admin Utilization and Deploys tabs a full outage (fixed in
 * #902 by swapping `rowHref`/`valueFormatter` callbacks for the serializable
 * `rowHrefTemplate` / `valueFormat` props those components carry today).
 *
 * Nothing caught it: TypeScript accepts the prop because the component's own
 * signature declares it, and the failure only appears when that specific route
 * renders in production. This guard closes that gap.
 *
 * Precision: a function prop is only illegal when the RECEIVING component is a
 * Client Component, so this resolves each JSX tag back to the module it was
 * imported from and only flags the prop when that module is `'use client'`.
 * Server→Server function props are legal and are not reported.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';

const SRC = resolve(__dirname, '../../');
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/;

/** Files that are entry points for RSC rendering or plain modules. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__snapshots__') continue;
      walk(full, out);
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function isClientModule(file: string): boolean {
  const head = readFileSync(file, 'utf8').slice(0, 400);
  // Skip a leading block comment before looking for the directive.
  const withoutLeadingComment = head.replace(/^\s*\/\*[\s\S]*?\*\//, '');
  return CLIENT_DIRECTIVE.test(withoutLeadingComment);
}

/** Resolve a TS import specifier to a file on disk, or null. */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) {
    base = join(SRC, spec.slice(2));
  } else if (spec.startsWith('.')) {
    base = resolve(dirname(fromFile), spec);
  } else {
    return null; // package import — not ours to inspect
  }

  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Does `moduleFile` ultimately supply `name` from a `'use client'` module?
 *
 * Components are almost always imported through a barrel — the crash this
 * guard exists for came in via `@/components/fairway`, whose `index.ts` is not
 * itself `'use client'`. Checking only the directly-imported module therefore
 * misses every real call site, so re-exports are followed to the module that
 * actually defines the component.
 */
function resolvesToClientComponent(
  moduleFile: string,
  name: string,
  seen: Set<string> = new Set(),
): string | null {
  const key = `${moduleFile}#${name}`;
  if (seen.has(key)) return null;
  seen.add(key);

  if (isClientModule(moduleFile)) return moduleFile;

  const source = readFileSync(moduleFile, 'utf8');

  // `export { A, B as C } from './x'`
  const namedReExport = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = namedReExport.exec(source)) !== null) {
    const clause = m[1]!;
    const target = resolveImport(moduleFile, m[2]!);
    if (!target) continue;
    for (const part of clause.split(',')) {
      const piece = part.trim().replace(/^type\s+/, '');
      if (!piece) continue;
      const [local, exported] = piece.includes(' as ')
        ? piece.split(' as ').map((s) => s.trim())
        : [piece, piece];
      if (exported !== name) continue;
      const owner = resolvesToClientComponent(target, local!, seen);
      if (owner) return owner;
    }
  }

  // `export * from './y'` — follow only when the target plausibly exports it.
  const starReExport = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = starReExport.exec(source)) !== null) {
    const target = resolveImport(moduleFile, m[1]!);
    if (!target) continue;
    const targetSource = readFileSync(target, 'utf8');
    const declaresName = new RegExp(
      `export\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`,
    ).test(targetSource);
    if (!declaresName) continue;
    const owner = resolvesToClientComponent(target, name, seen);
    if (owner) return owner;
  }

  return null;
}

/** Map of local identifier -> module specifier, from static import statements. */
function parseImports(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const importRe = /import\s+(?:type\s+)?([^;'"]+?)\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    const clause = m[1]!;
    const spec = m[2]!;
    // Named: { A, B as C }
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1]!.split(',')) {
        const piece = part.trim();
        if (!piece) continue;
        const alias = piece.includes(' as ') ? piece.split(' as ')[1]!.trim() : piece;
        if (alias) map.set(alias.replace(/^type\s+/, ''), spec);
      }
    }
    // Default: `import Foo from` / `import Foo, { ... } from`
    const def = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim();
    if (def && !def.startsWith('*')) map.set(def, spec);
  }
  return map;
}

interface Violation {
  file: string;
  component: string;
  prop: string;
  target: string;
}

/**
 * True when `value` IS a function expression, as opposed to merely containing
 * one. `chips={PULSE_SORTS.map((s) => ({ ... }))}` passes an array and is
 * perfectly legal, so the arrow must sit at the very start of the value: the
 * whole parameter list, then `=>`. A bare identifier could be anything, so it
 * is deliberately NOT flagged — this guard reports only what it can prove,
 * which keeps it safe to run as a hard gate.
 */
function isFunctionExpression(value: string): boolean {
  let v = value.trim();
  if (v.startsWith('async ') || v.startsWith('async(')) v = v.slice(5).trim();
  if (/^function\b/.test(v)) return true;

  // `param => ...` (single unparenthesized parameter)
  if (/^[A-Za-z_$][A-Za-z0-9_$]*\s*=>/.test(v)) return true;

  // `(a, b) => ...` — scan for the paren group's balanced close, then require
  // `=>` immediately after it (a generic `<T,>(…) =>` form is not used here).
  if (!v.startsWith('(')) return false;
  let depth = 0;
  for (let i = 0; i < v.length; i += 1) {
    const ch = v[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return /^\s*=>/.test(v.slice(i + 1));
    }
  }
  return false;
}

/**
 * Find `prop={...}` values that are unambiguously function expressions.
 */
function findFunctionPropViolations(file: string): Violation[] {
  const source = readFileSync(file, 'utf8');
  const imports = parseImports(source);
  const violations: Violation[] = [];

  // Opening JSX tags for capitalized (component, not DOM) elements.
  const tagRe = /<([A-Z][A-Za-z0-9_]*)((?:[^>"'{}]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*?)\/?>/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(source)) !== null) {
    const component = tag[1]!;
    const attrs = tag[2] ?? '';
    const spec = imports.get(component);
    if (!spec) continue;

    const targetFile = resolveImport(file, spec);
    if (!targetFile) continue;
    const clientOwner = resolvesToClientComponent(targetFile, component);
    if (!clientOwner) continue;

    const propRe = /([a-zA-Z_][a-zA-Z0-9_]*)=\{((?:[^{}]|\{[^{}]*\})*)\}/g;
    let prop: RegExpExecArray | null;
    while ((prop = propRe.exec(attrs)) !== null) {
      const name = prop[1]!;
      const value = (prop[2] ?? '').trim();
      if (isFunctionExpression(value)) {
        violations.push({
          file: file.slice(SRC.length + 1),
          component,
          prop: name,
          target: clientOwner.slice(SRC.length + 1),
        });
      }
    }
  }
  return violations;
}

describe('RSC boundary · function props', () => {
  const allTsx = walk(SRC);
  const serverComponents = allTsx.filter(
    (f) => !isClientModule(f) && !f.endsWith('.test.tsx') && !f.includes('__tests__'),
  );

  it('finds server components to inspect (guard is not vacuous)', () => {
    expect(serverComponents.length).toBeGreaterThan(50);
  });

  it('resolves client modules across the repo (guard is wired up)', () => {
    // Sanity: the repo must contain client modules, otherwise every lookup
    // above short-circuits and this test would pass by doing nothing.
    expect(allTsx.filter(isClientModule).length).toBeGreaterThan(50);
  });

  it('no Server Component passes an inline function to a Client Component', () => {
    const violations = serverComponents.flatMap(findFunctionPropViolations);
    const rendered = violations.map(
      (v) => `${v.file}: <${v.component} ${v.prop}={fn}> → client module ${v.target}`,
    );
    expect(rendered).toEqual([]);
  });
});
