/**
 * Find components that are RENDERED BY SOMETHING THAT IS ITSELF NEVER RENDERED.
 *
 * WHY THIS EXISTS (and what it adds over Knip)
 * --------------------------------------------
 * Knip reports unused *exports*. It therefore sees the ROOT of a dead subtree —
 * it does name `FairwayPlayerCoachHelm` and `InsightsFeed` — but it cannot see
 * anything hanging BENEATH that root. `HeroNarrativeCard` is the proven case:
 * `FairwayPlayerCoachHelm` genuinely imports and JSX-renders it, so its export
 * is "used" and Knip lists only the unused `HeroNarrativeCardProps` interface.
 * The component is unreachable at runtime and reads as live.
 *
 * This script closes exactly that gap and nothing wider.
 *
 * METHOD
 * ------
 * Build a render graph over component-name mentions, then walk it from the
 * roots Next.js actually enters (page/layout/template/error/loading/not-found/
 * route/default/global-error under src/app, plus middleware). Anything no root
 * can reach is unreachable at runtime, however many imports point at it.
 *
 * Deliberately conservative — it must not cry wolf:
 *   - `nextDynamic(() => import('X').then(m => m.Y))` counts as a mount.
 *   - Barrel re-exports are followed, so `@/components/fairway` hides no edge.
 *   - A name in a string prop / registry / map counts as mounted.
 *   - Comments are stripped first: several live files mention a dead component
 *     only in a doc comment ("ported verbatim from ..."), which faked an edge
 *     and hid a proven orphan.
 *   - Only .tsx files that DECLARE a component are reported. A barrel index.ts
 *     and a plain .ts helper are unreachable by construction under name-based
 *     detection, so reporting them would be a guaranteed false positive.
 *   - /vizlab and /fairway-preview are dev-only harnesses and are NOT roots —
 *     a component reachable only from a dev harness is what we are looking for.
 *
 * KNOWN FALSE POSITIVES — why this is an on-demand script, not a CI gate:
 *   1. A mount via non-literal name (`COMPONENT_MAP[key]`, a template literal)
 *      never spells the name, so it reads as orphaned.
 *   2. stripComments() eats from a closing block-comment delimiter that
 *      appears inside a string or regex literal, truncating the rest of
 *      that construct — a real mount on such a line would disappear.
 *   3. Adding a component to /vizlab before wiring it into a route trips this
 *      by design.
 *
 * Read the output, don't gate on it.
 *
 * Usage: npm run orphans:mounts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = process.cwd();

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (e === 'node_modules' || e === '.next') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).replaceAll('\\', '/');
const isTest = (p) =>
  /\.(test|spec)\.tsx?$/.test(p) || /[/\\]__tests__[/\\]/.test(p) || /[/\\]src[/\\]test[/\\]/.test(p);

const all = walk(join(ROOT, 'src')).filter((p) => !isTest(p));
const text = new Map(all.map((p) => [p, readFileSync(p, 'utf8')]));

// ── which file declares which component ──────────────────────────────────
const COMPONENT_RE =
  /^export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)|^export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*[:=]/gm;

const declaredIn = new Map(); // component name -> Set<file>
for (const p of all) {
  for (const m of text.get(p).matchAll(COMPONENT_RE)) {
    const name = m[1] ?? m[2];
    if (!name) continue;
    if (!declaredIn.has(name)) declaredIn.set(name, new Set());
    declaredIn.get(name).add(p);
  }
}

// A name inside a COMMENT is never a mount.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // `//` only when it is not the `://` of a URL inside a string.
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function namesMentionedIn(rawSrc) {
  const src = stripComments(rawSrc);
  const found = new Set();
  for (const name of declaredIn.keys()) {
    if (new RegExp(`\\b${name}\\b`).test(src)) found.add(name);
  }
  return found;
}

const mentions = new Map(all.map((p) => [p, namesMentionedIn(text.get(p))]));

// ── roots: what Next.js actually enters ──────────────────────────────────
const ROUTE_FILES = new Set([
  'page.tsx', 'layout.tsx', 'template.tsx', 'error.tsx',
  'loading.tsx', 'not-found.tsx', 'route.ts', 'route.tsx',
  'default.tsx', 'global-error.tsx', 'middleware.ts',
]);
const DEV_ONLY = [/\/app\/vizlab\//, /\/app\/fairway-preview\//];

const roots = all.filter((p) => {
  const r = rel(p);
  if (!r.startsWith('src/app/') && r !== 'src/middleware.ts') return false;
  if (DEV_ONLY.some((re) => re.test('/' + r))) return false;
  return ROUTE_FILES.has(basename(p));
});

// ── reachability walk ────────────────────────────────────────────────────
const reachableFiles = new Set(roots);
const queue = [...roots];
while (queue.length) {
  const file = queue.shift();
  for (const name of mentions.get(file) ?? []) {
    for (const decl of declaredIn.get(name) ?? []) {
      if (!reachableFiles.has(decl)) {
        reachableFiles.add(decl);
        queue.push(decl);
      }
    }
  }
}

// ── report: component files no root can reach ────────────────────────────
const orphanFiles = all
  .filter((p) => {
    const r = rel(p);
    if (!r.startsWith('src/components/')) return false;
    if (DEV_ONLY.some((re) => re.test('/' + r))) return false;
    if (!r.endsWith('.tsx')) return false;
    if (/\/index\.tsx$/.test(r)) return false;
    const declaresComponent = [...declaredIn.values()].some((files) => files.has(p));
    if (!declaresComponent) return false;
    return !reachableFiles.has(p);
  })
  .map(rel)
  .sort();

console.log(`route roots walked          : ${roots.length}`);
console.log(`files reachable from a root : ${reachableFiles.size}`);
console.log(`UNREACHABLE component files : ${orphanFiles.length}\n`);
for (const f of orphanFiles) console.log('  ' + f);
console.log(
  '\nThese are candidates, not a verdict — see the false-positive modes in this file’s header.',
);
