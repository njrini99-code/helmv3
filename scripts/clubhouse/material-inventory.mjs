/** Source material inventory. Review candidates are not automatic design defects. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import postcss from 'postcss';
import ts from 'typescript';

const MATERIALS = ['shadow', 'radius', 'color', 'gradient', 'blur'];
const literalColor = /(?:#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color)\(|\b(?:white|black)\b)/i;
const colorProperties = /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke|caret-color|accent-color|text-decoration-color)$/;
const legacyProperties = /^(?:box-shadow|border(?:-(?:top|right|bottom|left))?(?:-color)?|border(?:-(?:top-left|top-right|bottom-left|bottom-right))?-radius|background(?:-color|-image)?|(?:-webkit-)?backdrop-filter|filter|z-index|transition(?:-duration|-timing-function)?)$/;
const normalizePath = (file) => file.replaceAll('\\', '/');
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}
function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  return value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
}
function role(selector) {
  if (/focus|focus-visible|focus-within/.test(selector)) return 'focus-indicator';
  if (/well|inset/.test(selector)) return 'inset-material';
  if (/chart|plot|spark|axis|legend|sgt|dist|score|bar >/.test(selector)) return 'semantic-data-mark';
  if (/modal|dlg|dialog|sheet|drawer|popover|menu|toast/.test(selector)) return 'overlay';
  if (/topbar|tabbar|nav|dock|composer/.test(selector)) return 'floating-navigation';
  if (/input|select|field|button|btn|pill|switch|toggle/.test(selector)) return 'control';
  if (/card|tile|panel|surface/.test(selector)) return 'reading-surface';
  return 'needs-review';
}
function declarationContext(declaration) {
  const chain = [];
  let selector = '';
  for (let parent = declaration.parent; parent; parent = parent.parent) {
    if (parent.type === 'rule') { selector ||= parent.selector; chain.unshift(parent.selector); }
    else if (parent.type === 'atrule') chain.unshift(`@${parent.name} ${parent.params}`);
  }
  return { selector, context: chain.join(' / ') };
}
function commentsNear(declaration) {
  const comments = [];
  for (let node = declaration; node && node.type !== 'root'; node = node.parent) {
    let previous = node.prev();
    for (let index = 0; previous && index < 3; index++, previous = previous.prev()) {
      if (previous.type === 'comment') comments.unshift(previous.text);
      if (previous.type === 'rule') break;
    }
  }
  return [...new Set(comments)].join('\n');
}
function expand(value, definitions, seen = new Set()) {
  return value.replace(/var\((--ch-[\w-]+)(?:,[^)]*)?\)/g, (whole, name) => {
    if (seen.has(name) || !definitions.has(name)) return whole;
    return definitions.get(name).map((definition) => expand(definition, definitions, new Set([...seen, name]))).join(' | ');
  });
}
function declarationCategories(property, value, expanded) {
  const categories = [];
  if (/(?:box-shadow|text-shadow|--ch-.*(?:shadow|elevation)|--ch-highlight)/.test(property) || /drop-shadow\(/.test(expanded)) categories.push('shadow');
  if (/(?:border.*radius|--ch-radius)/.test(property)) categories.push('radius');
  if (literalColor.test(value) || colorProperties.test(property) || /^--ch-(?:ivory|ink|green|champagne|positive|warning|danger|info|score|chart|bg|text|accent|border|frame|hero|avatar)/.test(property)) categories.push('color');
  if (/(?:linear|radial|conic)-gradient\(/.test(expanded)) categories.push('gradient');
  if (/blur\(/.test(expanded) || /--ch-.*blur/.test(property)) categories.push('blur');
  return categories;
}
/** Canonical row schema, including context, ownership and explicit review classifications. */
export function inspectMaterialDeclarations(css, file = 'fixture.css', { definitions = new Map(), ownership = () => [] } = {}) {
  const result = [];
  postcss.parse(css, { from: file }).walkDecls((declaration) => {
    const { prop: property, value } = declaration;
    const expanded = expand(value, definitions);
    const categories = declarationCategories(property, value, expanded);
    if (!categories.length) return;
    const { selector, context } = declarationContext(declaration);
    const tokenDefinition = property.startsWith('--ch-');
    const semantic = /^var\(--ch-[\w-]+\)$/.test(value);
    const reset = /^(?:none|0|inherit|initial|unset|revert(?:-layer)?)$/.test(value);
    const spatialRadius = categories.includes('radius') && /^(?:0|50%|100%|999(?:9)?px|inherit)$/.test(value);
    const classification = tokenDefinition ? 'token-definition' : semantic ? 'semantic-token' : reset ? 'reset-or-inheritance' : spatialRadius ? 'spatial-shape' : role(selector) === 'focus-indicator' ? 'focus-material' : 'needs-review';
    const pageOwnership = ownership(file);
    result.push({ file, line: declaration.source.start.line, selector, context, property, value,
      roleCandidate: tokenDefinition ? 'canonical-token' : role(selector), classification, categories,
      rawVsSemantic: tokenDefinition ? 'definition' : semantic ? 'semantic' : reset ? 'reset' : 'raw-or-mixed',
      pageOwnership, shared: !pageOwnership.length, comments: commentsNear(declaration),
      ...(expanded !== value ? { resolvedMaterial: expanded } : {}),
    });
  });
  return result;
}
/** Preserve the original standalone CSS inspection API and classification vocabulary. */
export function inspectMaterials(css, file = 'fixture.css') {
  const out = [];
  postcss.parse(css, { from: file }).walkDecls((declaration) => {
    if (!legacyProperties.test(declaration.prop) && !declaration.prop.startsWith('--ch-')) return;
    const rawColor = literalColor.test(declaration.value);
    if (declaration.prop.startsWith('--ch-') && !rawColor && !/gradient|shadow|elevation|radius|blur/.test(declaration.prop + declaration.value)) return;
    const semantic = /var\(--ch-/.test(declaration.value);
    const reset = /^(?:none|0|0px|transparent|inherit|initial|unset|auto|currentColor)$/i.test(declaration.value);
    out.push({ file, line: declaration.source.start.line, context: declarationContext(declaration).context,
      property: declaration.prop, value: declaration.value,
      classification: declaration.prop.startsWith('--ch-') ? 'token-definition' : reset ? 'structural-or-reset' : semantic && !rawColor ? 'token-reference' : 'review-material-exception',
      rawColor, gradient: /gradient\(/.test(declaration.value),
    });
  });
  return out;
}
export function inspectInlineMaterials(code, file, ownership = () => []) {
  const rows = [];
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, /\.jsx$/.test(file) ? ts.ScriptKind.JSX : ts.ScriptKind.TSX);
  function visit(node) {
    const assignment = node.parent && ts.isPropertyAssignment(node.parent) && node.parent.initializer === node ? node.parent : null;
    const assignedProperty = assignment?.name.getText(source).replace(/^['"]|['"]$/g, '').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const numericRadius = ts.isNumericLiteral(node) && assignedProperty?.includes('radius');
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || numericRadius) {
      const value = node.text;
      const categories = [];
      if (assignedProperty && /^(?:box-shadow|text-shadow)$/.test(assignedProperty)) categories.push('shadow');
      if (assignedProperty && /^border.*radius$/.test(assignedProperty)) categories.push('radius');
      if (literalColor.test(value)) categories.push('color');
      if (/(?:linear|radial|conic)-gradient\(/.test(value)) categories.push('gradient');
      if (/blur\(/.test(value)) categories.push('blur');
      if (categories.length) {
        const illustration = file.endsWith('/screens/auth/SceneLayers.tsx');
        const fixture = file.includes('/__tests__/');
        const pageOwnership = ownership(file);
        rows.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, value, categories,
          selector: 'JS/TS string literal', context: 'Inline literal requires consumer context review', property: 'literal',
          roleCandidate: illustration ? 'illustration-material' : fixture ? 'test-fixture' : 'needs-review',
          classification: illustration ? 'spatial-illustration' : fixture ? 'test-fixture' : categories.includes('radius') && /^(?:0|50%|100%|999(?:9)?px|inherit)$/.test(value) ? 'spatial-shape' : 'needs-review',
          rawVsSemantic: 'raw-or-mixed', pageOwnership, shared: !pageOwnership.length,
          comments: illustration ? 'Auth course artwork, separately owned from ordinary reading surfaces.' : fixture ? 'Test-only values, not rendered product material.' : '',
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return rows;
}
const groupCounts = (rows, key) => rows.reduce((counts, row) => { counts[row[key]] = (counts[row[key]] ?? 0) + 1; return counts; }, {});
export function materialInventory(root = process.cwd()) {
  const sources = filesIn(join(root, 'src/clubhouse'));
  const cssSources = sources.filter((file) => file.endsWith('.css'));
  const markupSources = sources.filter((file) => /\.[tj]sx$/.test(file));
  const manifests = filesIn(join(root, 'config/clubhouse/pages')).filter((file) => file.endsWith('.json')).map((file) => JSON.parse(readFileSync(file, 'utf8')));
  const ownership = (file) => manifests.filter((manifest) => strings(manifest.implementation).some((owned) => owned === file || file.startsWith(`${owned}/`))).map((manifest) => manifest.id).sort();
  const parsed = cssSources.map((file) => ({ file: normalizePath(relative(root, file)), ast: postcss.parse(readFileSync(file, 'utf8'), { from: file }) }));
  const definitions = new Map();
  for (const { ast } of parsed) ast.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--ch-')) definitions.set(declaration.prop, [...(definitions.get(declaration.prop) ?? []), declaration.value]);
  });
  const declarations = parsed.flatMap(({ file, ast }) => inspectMaterialDeclarations(ast.toString(), file, { definitions, ownership }));
  for (const file of markupSources) declarations.push(...inspectInlineMaterials(readFileSync(file, 'utf8'), normalizePath(relative(root, file)), ownership));
  const runtime = declarations.filter((row) => !row.file.includes('/__tests__/') && !row.file.includes('/preview/'));
  const summary = {
    total: declarations.length, cssEntries: declarations.filter((row) => row.property !== 'literal').length,
    inlineEntries: declarations.filter((row) => row.property === 'literal').length,
    cssFileCount: cssSources.length, cssFiles: parsed.map(({ file }) => file), markupFileCount: markupSources.length,
    byClassification: groupCounts(declarations, 'classification'), byRawVsSemantic: groupCounts(declarations, 'rawVsSemantic'),
    byMaterial: Object.fromEntries(MATERIALS.map((category) => [category, declarations.filter((row) => row.categories.includes(category)).length])),
    runtimeEntries: runtime.length, runtimeByClassification: groupCounts(runtime, 'classification'),
    testEntries: declarations.filter((row) => row.file.includes('/__tests__/')).length,
    previewEntries: declarations.filter((row) => row.file.includes('/preview/')).length,
    pageOwnership: manifests.map((manifest) => ({ id: manifest.id, count: declarations.filter((row) => row.pageOwnership.includes(manifest.id)).length })),
    unmappedOrShared: declarations.filter((row) => row.shared).length,
    note: 'Material categories and page ownership can overlap. Raw values and role candidates are inventory, not violations. Auth illustration, tests, previews and meaningful spatial/focus exceptions are classified separately.',
  };
  return { scope: 'All Clubhouse source styles and JSX/TSX literals, including shared/auth/development preview. Source inventory is not visual approval.', declarations, summary };
}
export function main(args = process.argv.slice(2)) {
  let root = process.cwd(), output;
  let summary = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--summary') { summary = true; continue; }
    if ((arg === '--root' || arg === '--output') && args[index + 1] && !args[index + 1].startsWith('--')) {
      if (arg === '--root') root = resolve(args[++index]); else output = resolve(args[++index]);
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${arg}. Use --root <checkout>, --output <json>, --summary.`);
  }
  const inventory = materialInventory(root);
  const json = JSON.stringify(summary ? inventory.summary : inventory.declarations, null, 2) + '\n';
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, json); }
  else process.stdout.write(json);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`clubhouse:materials: ${error.message}`); process.exitCode = 1; }
}
