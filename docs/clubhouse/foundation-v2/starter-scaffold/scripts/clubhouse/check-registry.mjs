#!/usr/bin/env node
/**
 * Starter scaffold ONLY.
 *
 * Proposed Clubhouse registry validator.
 * Adapt to the repository's existing helper libraries before landing.
 *
 * This script performs no network, database, feature activation, or migration apply.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pagesDir = join(root, 'config', 'clubhouse', 'pages');
const bridgePath = join(root, 'config', 'clubhouse', 'bridge-contracts.json');
const tombstonePath = join(root, 'config', 'clubhouse', 'bridge-tombstones.json');

const errors = [];
const pageIds = new Set();
const namespaces = new Set();
const bridgeIds = new Set();

function fail(message) {
  errors.push(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function expectedPrefix(namespace, category, item) {
  return Number(`${namespace}${String(category).padStart(2, '0')}${item}`);
}

if (!existsSync(pagesDir)) fail('config/clubhouse/pages is missing');

const pages = existsSync(pagesDir)
  ? readdirSync(pagesDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({ file: name, value: readJson(join(pagesDir, name)) }))
  : [];

for (const { file, value: page } of pages) {
  if (pageIds.has(page.id)) fail(`${file}: duplicate page id ${page.id}`);
  pageIds.add(page.id);

  if (namespaces.has(page.bridgeNamespace)) {
    fail(`${file}: duplicate bridge namespace ${page.bridgeNamespace}`);
  }
  namespaces.add(page.bridgeNamespace);

  for (const path of Object.values(page.docs ?? {})) {
    if (typeof path === 'string' && !existsSync(join(root, path))) {
      fail(`${file}: missing doc ${path}`);
    }
  }

  if (page.implementation === 'complete' && page.status?.verification !== 'passing') {
    fail(`${file}: complete implementation without passing verification`);
  }
}

const contracts = existsSync(bridgePath) ? readJson(bridgePath) : [];
const tombstones = existsSync(tombstonePath) ? readJson(tombstonePath) : [];
const dead = new Set(tombstones.map((x) => x.id));

for (const c of contracts) {
  if (bridgeIds.has(c.id)) fail(`duplicate bridge id ${c.id}`);
  bridgeIds.add(c.id);

  if (dead.has(c.id)) fail(`bridge id ${c.id} reuses a tombstone`);

  const page = pages.find((p) => p.value.id === c.page)?.value;
  if (!page) {
    fail(`bridge id ${c.id} points to unknown page ${c.page}`);
    continue;
  }

  const expected = expectedPrefix(page.bridgeNamespace, c.category, c.item);
  if (expected !== c.id) {
    fail(`bridge id ${c.id} does not match namespace/category/item; expected ${expected}`);
  }
}

if (errors.length) {
  console.error(`clubhouse registry: ${errors.length} violation(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`clubhouse registry clean: ${pages.length} page(s), ${contracts.length} bridge contract(s)`);
