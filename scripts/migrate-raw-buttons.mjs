#!/usr/bin/env node
// Codemod: migrate raw <button> in product code to canonical <Button>/<IconButton>.
// AST-driven (TypeScript compiler API) so every prop/handler/aria-*/child is preserved
// byte-for-byte — we only rename the tag-name token and (for icon-only) inject an
// inferred aria-label, then add the import.
//
// Usage:
//   node scripts/migrate-raw-buttons.mjs            # apply
//   node scripts/migrate-raw-buttons.mjs --dry      # report only
//   node scripts/migrate-raw-buttons.mjs <file...>  # limit to given files
//
// Scope: src/app + src/components, EXCLUDING src/components/ui/** and
// src/components/mockups/**. Owned-glob files only.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import ts from 'typescript';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DRY = process.argv.includes('--dry');
const explicitFiles = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const SCAN_DIRS = [join(REPO_ROOT, 'src', 'app'), join(REPO_ROOT, 'src', 'components')];
const EXCLUDED_DIRS = [
  join(REPO_ROOT, 'src', 'components', 'ui'),
  join(REPO_ROOT, 'src', 'components', 'mockups'),
];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

function isExcluded(p) {
  return EXCLUDED_DIRS.some((d) => p === d || p.startsWith(d + sep));
}

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (isExcluded(full)) continue;
    if (e.isDirectory()) walk(full, files);
    else if (e.isFile() && e.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

// ---- variant inference from className string content ------------------------
function inferButtonVariant(classText) {
  const c = (classText || '').toLowerCase();
  // danger / destructive intent
  if (/\b(text-red|bg-red|border-red|text-destructive|bg-destructive|danger)\b/.test(c) ||
      /text-red-|bg-red-|border-red-|hover:bg-red|hover:text-red/.test(c)) {
    return 'danger';
  }
  // primary / filled brand intent
  if (/bg-primary|bg-emerald|bg-green-6|bg-green-5|from-primary|bg-gradient-to-.*primary|bg-warm-900|bg-black|bg-neutral-9/.test(c)) {
    return 'primary';
  }
  return 'ghost';
}

function inferIconButtonVariant(classText) {
  const c = (classText || '').toLowerCase();
  if (/bg-primary|bg-emerald|from-primary/.test(c)) return 'primary';
  return 'default';
}

// ---- aria-label inference for icon-only buttons -----------------------------
// Semantic map for common icon component names -> sensible action labels.
const ICON_LABEL_MAP = {
  x: 'Close', xcircle: 'Close', close: 'Close', xmark: 'Close',
  menu: 'Open menu', hamburger: 'Open menu',
  plus: 'Add', pluscircle: 'Add', add: 'Add',
  minus: 'Remove', minuscircle: 'Remove',
  search: 'Search', magnifier: 'Search',
  chevrondown: 'Expand', chevronup: 'Collapse',
  chevronleft: 'Previous', chevronright: 'Next',
  chevronsleft: 'Previous', chevronsright: 'Next',
  arrowleft: 'Back', arrowright: 'Forward', arrowup: 'Up', arrowdown: 'Down',
  trash: 'Delete', trash2: 'Delete', delete: 'Delete', trashcan: 'Delete',
  edit: 'Edit', pencil: 'Edit', pen: 'Edit',
  check: 'Confirm', checkcircle: 'Confirm', checkcircle2: 'Confirm',
  filter: 'Filter', settings: 'Settings', gear: 'Settings', cog: 'Settings',
  more: 'More options', morehorizontal: 'More options', morevertical: 'More options',
  dotshorizontal: 'More options', dotsvertical: 'More options', ellipsis: 'More options',
  bell: 'Notifications', notification: 'Notifications',
  download: 'Download', upload: 'Upload', share: 'Share',
  copy: 'Copy', link: 'Copy link', external: 'Open link', externallink: 'Open link',
  star: 'Favorite', heart: 'Favorite', bookmark: 'Bookmark',
  eye: 'Show', eyeoff: 'Hide', eyeclosed: 'Hide',
  refresh: 'Refresh', reload: 'Refresh', rotateccw: 'Refresh', rotatecw: 'Refresh',
  info: 'Info', help: 'Help', helpcircle: 'Help', question: 'Help',
  calendar: 'Calendar', clock: 'Time', user: 'Profile', users: 'Members',
  send: 'Send', mail: 'Email', message: 'Message', paperclip: 'Attach',
  play: 'Play', pause: 'Pause', stop: 'Stop',
  globe: 'Timezone', mappin: 'Location', map: 'Map',
};

function humanize(str) {
  if (!str) return null;
  // strip Icon prefix/suffix, split camelCase
  let s = str.replace(/^Icon/, '').replace(/Icon$/, '');
  const key = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ICON_LABEL_MAP[key]) return ICON_LABEL_MAP[key];
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getOpeningTagText(text, opening) {
  return text.slice(opening.getStart(), opening.getEnd());
}

// Does a JSX element node contain any visible/dynamic text (recursively)?
function elementHasVisibleText(node) {
  const kids = node.children || [];
  for (const child of kids) {
    if (child.kind === ts.SyntaxKind.JsxText) {
      if (child.getText().trim().length > 0) return true;
    } else if (child.kind === ts.SyntaxKind.JsxExpression) {
      const inner = child.getText().trim();
      // {' '} / {""} / {`  `} whitespace-only expressions don't count as text
      if (inner && !/^\{\s*['"`]\s*['"`]\s*\}$/.test(inner)) return true;
    } else if (child.kind === ts.SyntaxKind.JsxElement) {
      if (elementHasVisibleText(child)) return true;
    }
    // JsxSelfClosingElement (e.g. <IconX/>) carries no text
  }
  return false;
}

// Determine whether a <button>'s children are icon-only (no human-visible text),
// and capture the first icon component/element name for aria-label inference.
function childrenAreIconOnly(node) {
  const kids = node.children || [];
  let hasText = false;
  let iconName = null;
  for (const child of kids) {
    if (child.kind === ts.SyntaxKind.JsxText) {
      if (child.getText().trim().length > 0) hasText = true;
    } else if (child.kind === ts.SyntaxKind.JsxExpression) {
      const inner = child.getText().trim();
      if (inner && !/^\{\s*['"`]\s*['"`]\s*\}$/.test(inner)) hasText = true;
    } else if (
      child.kind === ts.SyntaxKind.JsxElement ||
      child.kind === ts.SyntaxKind.JsxSelfClosingElement
    ) {
      const tagNode = child.kind === ts.SyntaxKind.JsxElement
        ? child.openingElement.tagName
        : child.tagName;
      const tag = tagNode.getText();
      const isIconish = /^[A-Z]/.test(tag) || /^(svg|img)$/i.test(tag);
      if (isIconish && !iconName) iconName = tag;
      // Any element that itself bears visible/dynamic text makes the button text-bearing,
      // EXCEPT an uppercase self-closing icon component (carries no children at all).
      if (child.kind === ts.SyntaxKind.JsxElement && elementHasVisibleText(child)) {
        hasText = true;
      }
    }
  }
  return { iconOnly: !hasText, iconName };
}

let totalFiles = 0;
let changedFiles = 0;
let totalButtons = 0;
let toButton = 0;
let toIconButton = 0;
const perFile = [];

const files = explicitFiles.length
  ? explicitFiles.map((f) => resolve(f))
  : SCAN_DIRS.flatMap((d) => walk(d));

for (const file of files) {
  if (isExcluded(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!/<button[\s>]/.test(text)) continue;
  totalFiles++;

  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // Collect edits as {start,end,replacement}; apply from end to start.
  const edits = [];
  let usesButton = false;
  let usesIconButton = false;
  let fileButtons = 0;

  function extractAriaLabelText(props) {
    for (const a of props) {
      if (ts.isJsxAttribute(a) && a.name.getText() === 'aria-label' && a.initializer) {
        if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
      }
    }
    return null;
  }

  function visit(node) {
    // Self-closing raw <button .../> (backdrop overlays, hidden toggles, etc.)
    if (node.kind === ts.SyntaxKind.JsxSelfClosingElement && node.tagName.getText() === 'button') {
      fileButtons++;
      totalButtons++;
      usesIconButton = true;
      toIconButton++;

      let classText = '';
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name.getText() === 'className' && attr.initializer) {
          classText += ' ' + attr.initializer.getText();
        }
      }
      const variant = inferIconButtonVariant(classText);
      const hasAriaLabel = node.attributes.properties.some(
        (a) => ts.isJsxAttribute(a) && a.name.getText() === 'aria-label',
      );
      const ariaText = extractAriaLabelText(node.attributes.properties) || 'Button';

      // Rename tag name token: button -> IconButton variant="..."
      const tagStart = node.tagName.getStart();
      const tagEnd = node.tagName.getEnd();
      let inject = `IconButton variant="${variant}"`;
      if (!hasAriaLabel) inject += ` aria-label="${ariaText}"`;
      edits.push({ start: tagStart, end: tagEnd, replacement: inject });

      // Convert self-close `/>` to `>` + sr-only label child + `</IconButton>`.
      // node.getEnd() is just after `/>`. Replace the trailing `/>` with the closing.
      const full = node.getText();
      const nodeStart = node.getStart();
      const closeStart = nodeStart + full.lastIndexOf('/>');
      edits.push({
        start: closeStart,
        end: closeStart + 2,
        replacement: `><span className="sr-only">${ariaText}</span></IconButton>`,
      });
      ts.forEachChild(node, visit);
      return;
    }

    if (node.kind === ts.SyntaxKind.JsxElement) {
      const opening = node.openingElement;
      const closing = node.closingElement;
      if (opening.tagName.getText() === 'button') {
        fileButtons++;
        totalButtons++;
        const openTagText = getOpeningTagText(text, opening);

        // extract className literal text (best-effort) for variant inference
        let classText = '';
        for (const attr of opening.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name.getText() === 'className' && attr.initializer) {
            classText += ' ' + attr.initializer.getText();
          }
        }

        const { iconOnly, iconName } = childrenAreIconOnly(node);
        const hasAriaLabel = opening.attributes.properties.some(
          (a) => ts.isJsxAttribute(a) && a.name.getText() === 'aria-label',
        );

        // tag-name token positions
        const openTagNameStart = opening.tagName.getStart();
        const openTagNameEnd = opening.tagName.getEnd();
        const closeTagNameStart = closing.tagName.getStart();
        const closeTagNameEnd = closing.tagName.getEnd();

        if (iconOnly) {
          usesIconButton = true;
          toIconButton++;
          const variant = inferIconButtonVariant(classText);
          // rename opening tag + add variant + aria-label (if missing)
          let inject = `IconButton variant="${variant}"`;
          if (!hasAriaLabel) {
            const label = humanize(iconName) || 'Button';
            inject += ` aria-label="${label}"`;
          }
          edits.push({ start: openTagNameStart, end: openTagNameEnd, replacement: inject });
          edits.push({ start: closeTagNameStart, end: closeTagNameEnd, replacement: 'IconButton' });
        } else {
          usesButton = true;
          toButton++;
          const variant = inferButtonVariant(classText);
          edits.push({ start: openTagNameStart, end: openTagNameEnd, replacement: `Button variant="${variant}"` });
          edits.push({ start: closeTagNameStart, end: closeTagNameEnd, replacement: 'Button' });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (edits.length === 0) continue;

  // apply edits from end to start
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }

  // ---- ensure import of Button / IconButton from '@/components/ui/button' ----
  const needed = [];
  if (usesButton) needed.push('Button');
  if (usesIconButton) needed.push('IconButton');

  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"]@\/components\/ui\/button['"]\s*;?/;
  const m = out.match(importRe);
  if (m) {
    const existing = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const toAdd = needed.filter((n) => !existing.includes(n));
    if (toAdd.length) {
      const merged = Array.from(new Set([...existing, ...toAdd]));
      const newImport = `import { ${merged.join(', ')} } from '@/components/ui/button';`;
      out = out.replace(importRe, newImport);
    }
  } else {
    // insert a new import after the last existing import statement, else after 'use client'
    const newImport = `import { ${needed.join(', ')} } from '@/components/ui/button';\n`;
    // find last top-level import
    const importStmtRe = /^import .*?;[ \t]*$/gm;
    let lastImportEnd = -1;
    let mm;
    while ((mm = importStmtRe.exec(out)) !== null) {
      lastImportEnd = mm.index + mm[0].length;
    }
    if (lastImportEnd >= 0) {
      out = out.slice(0, lastImportEnd) + '\n' + newImport.trimEnd() + out.slice(lastImportEnd);
    } else {
      // after 'use client' directive if present
      const ucRe = /^(['"]use client['"];?\s*\n)/;
      if (ucRe.test(out)) {
        out = out.replace(ucRe, (d) => d + newImport);
      } else {
        out = newImport + out;
      }
    }
  }

  fileButtons && perFile.push(`${relative(REPO_ROOT, file)}: ${fileButtons} button(s)`);
  changedFiles++;
  if (!DRY) writeFileSync(file, out, 'utf8');
}

console.log(`Files with <button>: ${totalFiles}`);
console.log(`Files changed: ${changedFiles}`);
console.log(`Total raw <button> migrated: ${totalButtons}`);
console.log(`  -> <Button>: ${toButton}`);
console.log(`  -> <IconButton>: ${toIconButton}`);
if (DRY) console.log('(dry run — no files written)');
