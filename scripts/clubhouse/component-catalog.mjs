/** Deterministic source inventory; declarations are not browser coverage. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import postcss from 'postcss';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'src/clubhouse/preview/component-catalog.json');
function scopeOf(declaration) {
  const scopes = [];
  for (let parent = declaration.parent; parent && parent.type !== 'root'; parent = parent.parent)
    if (parent.type === 'rule') scopes.unshift(parent.selector);
    else if (parent.type === 'atrule') scopes.unshift(`@${parent.name} ${parent.params}`);
  return scopes.join(' → ');
}
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? entry.name === '__tests__' ? [] : files(join(directory, entry.name)) : [join(directory, entry.name)]
  ).sort();
}
function sourceInfo(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const classes = new Set();
  const exports = new Set();
  const imports = [];
  const jsx = new Set();
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
      for (const match of node.text.matchAll(/\b(ch-[a-z][\w-]*)/g)) classes.add(match[1]);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) jsx.add(node.tagName.getText(ast));
    if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && /^[A-Z]/.test(node.name.text)) exports.add(node.name.text);
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations)
        if (ts.isIdentifier(declaration.name) && /^[A-Z]/.test(declaration.name.text)) exports.add(declaration.name.text);
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause))
      for (const element of node.exportClause.elements) if (/^[A-Z]/.test(element.name.text)) exports.add(element.name.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { classes, exports: [...exports].sort(), imports, jsx };
}
export function buildCatalog(base) {
  const clubhouse = join(base, 'src/clubhouse');
  const styles = files(clubhouse).filter(file => file.endsWith('.css')).map(file => {
    const ast = postcss.parse(readFileSync(file, 'utf8'));
    const classes = new Set();
    const tokens = [];
    ast.walkRules(rule => { for (const match of rule.selector.matchAll(/\.(ch-[\w-]+)/g)) classes.add(match[1]); });
    ast.walkDecls(declaration => {
      if (declaration.prop.startsWith('--ch-')) tokens.push({ name: declaration.prop, value: declaration.value,
        scope: scopeOf(declaration), line: declaration.source?.start?.line ?? 0 });
    });
    return { file: relative(base, file), classes: [...classes].sort(), tokens };
  });
  const gallery = sourceInfo('gallery.tsx', readFileSync(join(clubhouse, 'preview/ComponentGallery.tsx'), 'utf8'));
  const components = files(clubhouse).filter(file => file.endsWith('.tsx')).map(file => {
    const source = readFileSync(file, 'utf8');
    const componentPath = relative(clubhouse, file);
    const info = sourceInfo(file, source);
    const galleryImportsModule = gallery.imports.includes(`../${componentPath.slice(0, -4)}`);
    const examples = galleryImportsModule ? info.exports.filter(name => gallery.jsx.has(name)) : [];
    return { file: relative(base, file), group: componentPath.split('/')[0], exports: info.exports,
      styles: styles.filter(style => style.classes.some(name => info.classes.has(name)) || info.imports.some(importPath => importPath.endsWith('.css') && relative(base, resolve(dirname(file), importPath)) === style.file)).map(style => style.file),
      examples,
      fixture: examples.length ? 'Shared gallery example' : 'Contextual module',
    };
  });
  const previewSource = readFileSync(join(base, 'src/app/clubhouse-preview/[screen]/page.tsx'), 'utf8');
  const screens = previewSource.slice(previewSource.indexOf('  const screens:'), previewSource.indexOf('  const viewer'));
  const previews = [...screens.matchAll(/^ {4}(?:'([^']+)'|([a-z][\w-]*)): \{/gm)].map(match => ({ name: match[1] ?? match[2], href: `/clubhouse-preview/${match[1] ?? match[2]}` }));
  for (const name of ['auth', 'entry', 'onboard', 'popup-lab']) previews.push({ name, href: `/clubhouse-preview/${name}` });
  return { components, styles, previews };
}
export function main(args = process.argv.slice(2)) {
  const content = JSON.stringify(buildCatalog(root), null, 2) + '\n';
  if (args.includes('--check')) {
    if (readFileSync(output, 'utf8') !== content) throw new Error('Component catalog is stale. Run npm run clubhouse:catalog.');
  } else writeFileSync(output, content);
  const catalog = JSON.parse(content);
  console.log(`Clubhouse catalog: ${catalog.components.length} component modules, ${catalog.styles.length} stylesheets, ${catalog.previews.length} preview routes.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
