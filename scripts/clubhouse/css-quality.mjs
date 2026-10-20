/** AST checks across Clubhouse CSS; new shadow declarations compared to an explicit Git base. */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import config from '../../stylelint.clubhouse.config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const layout = /^(?:width|height|min-width|max-width|min-height|max-height|top|right|bottom|left|inset(?:-.+)?|margin(?:-.+)?|padding(?:-.+)?|grid-template-(?:rows|columns)|flex-basis)$/;
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
function context(node) {
  const parts = [];
  for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent)
    parts.unshift(parent.type === 'rule' ? normalize(parent.selector) : `@${parent.name} ${normalize(parent.params)}`);
  return parts.join(' / ');
}
function parse(css, file) { return postcss.parse(css, { from: file }); }
function transitionedProperty(value, shorthand) {
  if (!shorthand) return value.trim().toLowerCase();
  // CSS shorthand components are unordered. A duration/delay or easing may
  // precede the property; an omitted property defaults to `all`.
  const components = postcss.list.space(value.toLowerCase());
  const parameters = /^(?:[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?(?:ms|s)|ease(?:-in(?:-out)?|-out)?|linear|step-start|step-end|normal|allow-discrete)$/;
  return components.find((component) => !parameters.test(component) && !/^(?:cubic-bezier|steps|linear|calc|min|max|clamp)\(/.test(component) && !/^var\(\s*--ch-/.test(component)) ?? 'all';
}
function declarationInventory(css, file, properties) {
  const inventory = new Map();
  parse(css, file).walkDecls((decl) => {
    if (!properties.includes(decl.prop.toLowerCase())) return;
    const key = `${decl.prop.toLowerCase()} | ${context(decl)} | ${normalize(decl.value)} | ${!!decl.important}`;
    inventory.set(key, (inventory.get(key) ?? 0) + 1);
  });
  return inventory;
}
// A ring/edge with zero blur is not a depth role. Button material, focus rings,
// inset wells and existing handoff variants are not replaced by a blanket rule.
function needsShadowToken(value) {
  if (/^(?:none|inherit|initial|unset|revert(?:-layer)?)$/i.test(value)) return false;
  return postcss.list.comma(value).some((layer) => {
    if (/^var\(--ch-[\w-]+\)$/.test(layer.trim())) return false;
    if (/\binset\b/i.test(layer)) return false;
    const geometry = layer.replace(/#[\da-f]+\b/gi, '').replace(/(?:rgba?|hsla?|color|var)\([^)]*\)/g, '').match(/-?(?:\d*\.)?\d+(?:px|rem|em)?/g) ?? [];
    return geometry.length < 3 || parseFloat(geometry[2]) !== 0;
  });
}
export function inspectCSS(css, { file = 'fixture.css', before = '', tokens } = {}) {
  const findings = [];
  const ast = parse(css, file);
  const previous = declarationInventory(before, file, ['box-shadow', 'transition', 'transition-property']);
  const add = (decl, rule, reason) => findings.push({ file, line: decl.source.start.line, rule, reason });
  ast.walkDecls((decl) => {
    const property = decl.prop.toLowerCase();
    const key = `${property} | ${context(decl)} | ${normalize(decl.value)} | ${!!decl.important}`;
    const count = previous.get(key) ?? 0;
    if (count > 0) previous.set(key, count - 1);
    if (property === 'transition' || property === 'transition-property') {
      for (const part of postcss.list.comma(decl.value)) {
        const transitioned = transitionedProperty(part, property === 'transition');
        if (transitioned === 'all')
          add(decl, 'clubhouse/no-transition-all', 'Name the transitioned properties; all also animates future layout changes.');
        if (layout.test(transitioned) && count === 0) add(decl, 'clubhouse/no-layout-motion', `New transition of ${transitioned} recalculates layout on each frame; preserve reviewed variants or use transform.`);
      }
    }
    if (layout.test(property)) {
      for (let parent = decl.parent; parent; parent = parent.parent)
        if (parent.type === 'atrule' && /^(?:-webkit-)?keyframes$/i.test(parent.name)) {
          add(decl, 'clubhouse/no-layout-motion', `Keyframe animation of ${property} recalculates layout on each frame.`);
          break;
        }
    }
    if (property === 'box-shadow') {
      if (count === 0 && needsShadowToken(decl.value)) add(decl, 'clubhouse/shadow-token', 'New outer blur shadow must use a --ch-* depth token; keep rings/inset material distinct.');
      if (count === 0 && tokens) for (const match of decl.value.matchAll(/var\((--ch-[\w-]+)/g))
        if (!tokens.has(match[1])) add(decl, 'clubhouse/shadow-token', `New shadow references undefined token ${match[1]}.`);
    }
  });
  return findings;
}
export async function lintCSS(css, file = 'fixture.css') {
  const { default: stylelint } = await import('stylelint');
  const result = await stylelint.lint({ code: css, codeFilename: file, config });
  return result.results.flatMap((entry) => [
    ...entry.warnings.map((warning) => ({ file, line: warning.line, rule: warning.rule, reason: warning.text })),
    ...entry.invalidOptionWarnings.map((warning) => ({ file, rule: 'stylelint-config', reason: warning.text })),
    ...entry.parseErrors.map((warning) => ({ file, line: warning.line, rule: 'css-syntax', reason: warning.text })),
  ]);
}
function cssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? cssFiles(join(dir, entry.name)) : entry.name.endsWith('.css') ? [join(dir, entry.name)] : []);
}
export async function main(argv = process.argv.slice(2)) {
  let base, sha;
  try {
    base = argv[0] ?? execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    // Resolve once, fail explicitly on a missing base; never silently skip regression checks.
    sha = execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    throw new Error(`Cannot resolve CSS review base ${argv[0] ?? 'merge-base(origin/main, HEAD)'}. Fetch origin/main or pass an available immutable commit: css-quality.mjs <base-sha>.`);
  }
  const baselineFiles = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', sha, 'src/clubhouse'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'));
  const findings = [];
  const sources = cssFiles(join(ROOT, 'src/clubhouse')).map((path) => ({ path, css: readFileSync(path, 'utf8') }));
  const tokens = new Set();
  for (const { path, css } of sources) {
    try { parse(css, path).walkDecls((decl) => { if (decl.prop.startsWith('--ch-')) tokens.add(decl.prop); }); }
    catch { /* lintCSS below reports syntax failure with the source line. */ }
  }
  for (const { path, css } of sources) {
    const file = relative(ROOT, path);
    const before = baselineFiles.has(file) ? execFileSync('git', ['show', `${sha}:${file}`], { cwd: ROOT, encoding: 'utf8' }) : '';
    findings.push(...await lintCSS(css, file));
    try { findings.push(...inspectCSS(css, { file, before, tokens })); }
    catch (error) { findings.push({ file, line: error.line, rule: 'css-syntax', reason: error.reason ?? error.message }); }
  }
  for (const finding of findings) console.error(`${finding.file}:${finding.line ?? 1} ${finding.rule}: ${finding.reason}`);
  console.log(`Clubhouse CSS quality: ${findings.length} findings; shadow comparison ${sha.slice(0, 7)}.`);
  return findings.length ? 1 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
