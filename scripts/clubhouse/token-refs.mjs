/**
 * Every `var(--ch-*)` resolves (design lab GAP-B3, dsx-09).
 *
 * A `var(--ch-name)` whose name nothing defines computes to the property's
 * initial value: a fill turns black, a filter turns off, a colour falls back to
 * whatever it inherits. Nothing in the browser or the compiler says so. This
 * check reads every Clubhouse stylesheet and module and holds two rules:
 *
 *   1. A reference with no fallback must name a defined custom property.
 *   2. A reference with a fallback (`var(--ch-x, 8px)`) to a name nothing
 *      defines is an optional hook that is never set, so the fallback is what
 *      renders. The ones on main are listed in
 *      config/clubhouse/token-refs-baseline.json; a new one fails, and an entry
 *      that is no longer needed must be removed (the list may only shrink).
 *
 * "Defined" means any of: a `--ch-x:` declaration in a stylesheet; a string
 * '--ch-x' in a module (a React style key, `setProperty`, or a constant such as
 * COMPOSER_INSET_VAR that does either); a template prefix `--ch-x-${...}`
 * defines every name that starts with it. Tests are not read.
 *
 * Usage (also run by clubhouse:check): node scripts/clubhouse/token-refs.mjs
 *   [--root <dir>] [--write-baseline]
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_PATH = 'config/clubhouse/token-refs-baseline.json';
/** Where Clubhouse styles and the modules that set its custom properties live. */
export const SCAN_DIRS = ['src/clubhouse', 'src/app/golf', 'src/app/clubhouse-preview'];

const SOURCE = /\.(css|tsx?|mjs)$/;
const IS_TEST = /(^|\/)__tests__\/|\.test\.|\.spec\./;

function walk(root, rel, out) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return out;
  for (const n of readdirSync(abs)) {
    if (n === 'node_modules') continue;
    const p = `${rel}/${n}`;
    if (statSync(join(root, p)).isDirectory()) walk(root, p, out);
    else if (SOURCE.test(n) && !IS_TEST.test(p)) out.push(p);
  }
  return out;
}

/** Strip comments, keeping line breaks so reported lines stay true. */
function stripComments(src, css) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  const out = src.replace(/\/\*[\s\S]*?\*\//g, blank);
  return css ? out : out.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
}

/**
 * Pure core, for tests: `files` maps a path to its text.
 * Returns { defined, prefixes, refs } where refs is a list of
 * { file, line, name, fallback }.
 */
export function collect(files) {
  const defined = new Set();
  const prefixes = new Set();
  const refs = [];
  for (const [file, raw] of Object.entries(files)) {
    const css = file.endsWith('.css');
    const src = stripComments(raw, css);
    if (css) {
      for (const m of src.matchAll(/(?:^|[{;\s])(--ch-[\w-]+)\s*:/g)) defined.add(m[1]);
    } else {
      for (const m of src.matchAll(/['"`](--ch-[\w-]+)['"`]/g)) defined.add(m[1]);
      for (const m of src.matchAll(/`(--ch-[\w-]*)\$\{/g)) prefixes.add(m[1]);
      // Style strings written inline: "--ch-x: 4px" inside a template or string.
      for (const m of src.matchAll(/['"`;\s{](--ch-[\w-]+)\s*:/g)) defined.add(m[1]);
    }
    for (const m of src.matchAll(/var\(\s*(--ch-[\w-]+)\s*([,)])/g)) {
      refs.push({ file, line: src.slice(0, m.index).split('\n').length, name: m[1], fallback: m[2] === ',' });
    }
  }
  return { defined, prefixes, refs };
}

const isDefined = (name, defined, prefixes) =>
  defined.has(name) || [...prefixes].some((p) => p.length > '--ch-'.length && name.startsWith(p));

/**
 * Violations for the two rules, given the collected refs and the baseline list
 * of allowed fallback-only hook names.
 */
export function checkTokenRefs({ defined, prefixes, refs }, baseline = []) {
  const v = [];
  const hooks = new Set();
  for (const r of refs) {
    if (isDefined(r.name, defined, prefixes)) continue;
    if (!r.fallback) {
      v.push(`${r.file}:${r.line}: var(${r.name}) names a custom property nothing defines, so it computes to the initial value (GAP-B3)`);
      continue;
    }
    hooks.add(r.name);
    if (!baseline.includes(r.name)) {
      v.push(`${r.file}:${r.line}: var(${r.name}, …) names a custom property nothing sets, so only the fallback ever renders; use a token, set it, or write the value (${BASELINE_PATH} may only shrink)`);
    }
  }
  for (const name of baseline) {
    if (!hooks.has(name)) v.push(`${BASELINE_PATH}: ${name} no longer needs an entry; remove it so the list only shrinks`);
  }
  return { violations: v, hooks: [...hooks].sort() };
}

export function readBaseline(root) {
  const p = join(root, BASELINE_PATH);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, 'utf8')).hooks ?? [];
}

export function runTokenRefs(root) {
  const files = {};
  for (const dir of SCAN_DIRS) for (const f of walk(root, dir, [])) files[f] = readFileSync(join(root, f), 'utf8');
  const collected = collect(files);
  return { ...checkTokenRefs(collected, readBaseline(root)), refs: collected.refs.length, files: Object.keys(files).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = process.argv.indexOf('--root');
  const root = at > -1 ? process.argv[at + 1] : process.cwd();
  const res = runTokenRefs(root);
  if (process.argv.includes('--write-baseline')) {
    const body = {
      note: 'var(--ch-*, fallback) hooks that nothing sets, so the fallback is what renders (dsx-09, GAP-B3). May only shrink: remove a name when its reference goes, never add one.',
      hooks: res.hooks,
    };
    writeFileSync(join(root, BASELINE_PATH), JSON.stringify(body, null, 2) + '\n');
    console.log(`token-refs: wrote ${res.hooks.length} hook(s) to ${relative(root, join(root, BASELINE_PATH))}`);
    process.exit(0);
  }
  if (res.violations.length) {
    console.error(`token-refs found ${res.violations.length} violation(s):`);
    for (const x of res.violations) console.error('  ' + x);
    process.exit(1);
  }
  console.log(`token-refs clean: ${res.refs} var(--ch-*) reference(s) in ${res.files} file(s) resolve; ${res.hooks.length} baselined fallback-only hook(s).`);
}
