#!/usr/bin/env node
/**
 * clubhouse:check — mechanical enforcement for the Clubhouse rebuild.
 *
 * Two jobs:
 *   1. Keep src/clubhouse/ a fresh tree: no Fairway imports, tokens, scope
 *      classes or haptics module; CSS scoped to .ch-* / [data-ui]; only
 *      --ch-* custom properties.
 *   2. Hold the design doctrine the compiler can't: red only for under par,
 *      no emoji, no exclamation marks in copy, no tracked uppercase, no
 *      count-ups or entrance staggers, durations only from the tokens.
 * It also validates docs/clubhouse/PROGRESS.md so the tracker can't drift
 * into a state its own gates forbid.
 *
 * Usage: node scripts/clubhouse/check.mjs [--root <dir>]
 * Exit 0 clean, 1 on any violation.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RED_TOKENS = /var\(--ch-(score-under|chart-flag|danger-600)\)/;
const RED_ALLOWED_CONTEXT = /under|birdie|eagle|flag|danger|error|invalid/i;
const ALLOWED_DURATIONS_S = new Set(['0', '0.09', '.09', '0.15', '.15', '0.22', '.22', '0.36', '.36']);
const STATUSES = /^(todo|doing|done|blocked \(.+\))$/;
const GATES = ['spec', 'desktop', 'wired', 'states', 'error-tracking', 'phone-spec', 'phone', 'motion', 'accessibility', 'performance', 'verified'];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

/** Strip comments so doctrine words inside explanations don't trip the scan. */
function stripComments(src, ext) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (ext !== '.css') s = s.replace(/(^|[^:'"`])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  return s;
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

export function checkSource(file, raw) {
  const ext = extname(file);
  const v = [];
  const src = stripComments(raw, ext);
  const add = (i, msg) => v.push(`${file}:${lineOf(src, i)} ${msg}`);
  const scan = (re, msg) => {
    for (const m of src.matchAll(re)) add(m.index, msg);
  };

  // 1. Isolation
  scan(/@\/components\/fairway|@\/lib\/fairway|@\/lib\/redesign|fairwayScope|FAIRWAY_SCOPE|fairway-ds/g, 'imports or references the Fairway UI');
  scan(/var\(--(?!ch-)[a-z]/g, 'reads a non-Clubhouse custom property (use --ch-*)');
  scan(/--fw-/g, 'references a Fairway token');

  // 2. Doctrine
  scan(/\p{Extended_Pictographic}/gu, 'contains an emoji');
  scan(/text-transform:\s*uppercase|\buppercase\b|tracking-(wide|wider|widest)/g, 'tracked or uppercase text is banned');
  scan(/staggerChildren|delayChildren|staggerDirection|\bstagger\(/g, 'entrance staggers are banned');
  scan(/count-?up|CountUp|useCountUp|animateNumber|useMotionValue\(.*\)\s*.*toFixed/gi, 'count-up animation is banned');

  if (ext === '.css') {
    if (!file.endsWith('tokens.css')) {
      scan(/\b(?!1ms\b)\d+ms\b/g, 'literal duration: use var(--ch-dur-*)');
      scan(/cubic-bezier\(/g, 'literal easing: use var(--ch-ease)');
    }
    // Selector scoping + red-token context, per rule block.
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    for (const m of src.matchAll(ruleRe)) {
      const selector = m[1].trim();
      const body = m[2];
      if (selector.startsWith('@') || /^(from|to|\d+%)/.test(selector)) continue;
      const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (!/\.ch-|\[data-ui=/.test(part)) add(m.index, `unscoped selector "${part}"`);
      }
      if (RED_TOKENS.test(body) && !RED_ALLOWED_CONTEXT.test(selector)) {
        add(m.index, `red token outside an under-par/flag/danger context in "${selector}"`);
      }
    }
  } else {
    // TS/TSX: exclamation marks in user-facing strings or JSX text.
    scan(/[A-Za-z.)]!(?=['"`<]|\s+[A-Z<'"`])/g, 'exclamation mark in copy');
    if (!file.endsWith('lib/motion.ts')) {
      for (const m of src.matchAll(/duration:\s*([\d.]+)/g)) {
        if (!ALLOWED_DURATIONS_S.has(m[1])) add(m.index, `duration ${m[1]} is off the scale (use CH_DUR)`);
      }
    }
    for (const m of src.matchAll(/(?:className|class)=["'{][^>]*?\b(fw-[a-z]|dp-[a-z])/g)) {
      add(m.index, 'uses a prototype or Fairway class name; port it as .ch-*');
    }
    if (RED_TOKENS.test(src)) {
      for (const m of src.matchAll(new RegExp(RED_TOKENS.source, 'g'))) {
        const line = src.split('\n')[lineOf(src, m.index) - 1] ?? '';
        if (!RED_ALLOWED_CONTEXT.test(line)) add(m.index, 'red token used outside an under-par/flag/danger context');
      }
    }
  }
  return v;
}

export function parseChecklist(md) {
  const sections = new Map();
  let cur = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+([a-z-]+)\s*$/);
    if (h) {
      cur = { open: 0, closed: 0 };
      sections.set(h[1], cur);
      continue;
    }
    if (!cur) continue;
    if (/^\s*- \[ \]/.test(line)) cur.open += 1;
    else if (/^\s*- \[x\]/i.test(line)) cur.closed += 1;
  }
  return sections;
}

export function checkProgress(md, exists = existsSync, root = '.', read = (p) => readFileSync(p, 'utf8')) {
  const v = [];
  const block = md.split('<!-- clubhouse:screens:start -->')[1]?.split('<!-- clubhouse:screens:end -->')[0];
  if (!block) return ['PROGRESS.md: screens table markers missing'];
  const rows = block.trim().split('\n').slice(2);
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 2 + GATES.length) {
      v.push(`PROGRESS.md: row "${cells[0]}" has ${cells.length} cells, expected ${2 + GATES.length}`);
      continue;
    }
    const [screen, , ...states] = cells;
    const st = Object.fromEntries(GATES.map((g, i) => [g, states[i]]));
    for (const g of GATES) {
      if (!STATUSES.test(st[g])) v.push(`PROGRESS.md: ${screen} ${g} has invalid status "${st[g]}"`);
    }
    if (st.verified === 'done' && GATES.some((g) => st[g] !== 'done')) {
      v.push(`PROGRESS.md: ${screen} is verified but not every gate is done`);
    }
    if (st.phone === 'done' && st['phone-spec'] !== 'done') {
      v.push(`PROGRESS.md: ${screen} phone is done without an approved phone-spec`);
    }
    if (st.wired === 'done' && st.spec !== 'done') v.push(`PROGRESS.md: ${screen} is wired before its spec is done`);
    const slug = screen.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const started = GATES.slice(1).some((g) => st[g] === 'doing' || st[g] === 'done');
    const checklist = join(root, 'docs/clubhouse/screens', `${slug}.md`);
    if (started && !exists(checklist)) {
      v.push(`PROGRESS.md: ${screen} is past spec but ${checklist} is missing (copy CHECKLIST_TEMPLATE.md)`);
    } else if (started) {
      const sections = parseChecklist(read(checklist));
      for (const g of GATES) {
        if (st[g] !== 'done') continue;
        const sec = sections.get(g);
        if (!sec) v.push(`${checklist}: gate ${g} is done but the checklist has no "## ${g}" section`);
        else if (sec.open > 0) v.push(`${checklist}: gate ${g} is done but ${sec.open} item(s) are unchecked`);
      }
    }
    if (st['phone-spec'] === 'done') {
      const doc = join(root, 'docs/clubhouse/phone', `${slug}.md`);
      if (!exists(doc)) v.push(`PROGRESS.md: ${screen} phone-spec is done but ${doc} is missing`);
      else if (!/Status:\s*approved/i.test(read(doc))) {
        v.push(`PROGRESS.md: ${screen} phone-spec is done but ${doc} is not marked "Status: approved"`);
      }
    }
  }
  return v;
}

function main() {
  const argRoot = process.argv.indexOf('--root');
  const root = argRoot > -1 ? process.argv[argRoot + 1] : join(fileURLToPath(new URL('.', import.meta.url)), '../..');
  const files = walk(join(root, 'src/clubhouse')).filter((f) => /\.(tsx?|css)$/.test(f));
  const violations = [];
  for (const f of files) violations.push(...checkSource(relative(root, f), readFileSync(f, 'utf8')));
  const progress = join(root, 'docs/clubhouse/PROGRESS.md');
  if (!existsSync(progress)) violations.push('docs/clubhouse/PROGRESS.md is missing');
  else violations.push(...checkProgress(readFileSync(progress, 'utf8'), existsSync, root));

  if (violations.length) {
    console.error(`clubhouse:check found ${violations.length} violation(s):`);
    for (const x of violations) console.error('  ' + x);
    process.exit(1);
  }
  console.log(`clubhouse:check clean: ${files.length} file(s), tracker valid.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
