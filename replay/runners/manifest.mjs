// replay/runners/manifest.mjs
//
// Pure manifest loading + validation, kept separate from run.mjs's process
// orchestration so both the CLI and the vitest meta-test
// (replay/__tests__/replay-manifest-schema.test.ts) exercise the exact same
// code path — a malformed manifest fails CI the same way it would fail a
// real run, not two independently-drifting checks.
//
// Deliberately no ajv/zod dependency: the schema
// (replay/schema/manifest.schema.json) is small and stable, and this repo's
// own convention (scripts/knowledge/*.mjs) favors hand-rolled validation
// over a new dependency for a narrow, internal contract.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPLAY_DIR = resolve(HERE, '..');
export const MANIFESTS_DIR = join(REPLAY_DIR, 'manifests');
export const FIXTURES_DIR = join(REPLAY_DIR, 'fixtures');
export const PROOFS_DIR = join(REPLAY_DIR, 'proofs');
export const SCHEMA_PATH = join(REPLAY_DIR, 'schema', 'manifest.schema.json');

export function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

/**
 * Minimal, dependency-free validator covering exactly what
 * manifest.schema.json declares: additionalProperties, required, type,
 * const, enum, pattern, minItems/minLength, and one level of nested object
 * properties (fixture[], expected{}, sanitization{}). Not a general JSON
 * Schema implementation — deliberately narrow to this one contract.
 */
export function validateManifest(manifest, schema = loadSchema()) {
  const errors = [];
  checkObject(manifest, schema, '$', errors);
  return errors;
}

function checkObject(value, schema, path, errors) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }
  for (const key of schema.required ?? []) {
    if (!(key in value)) errors.push(`${path}.${key}: missing required field`);
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in (schema.properties ?? {}))) {
        errors.push(`${path}.${key}: unknown field not permitted by schema`);
      }
    }
  }
  for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
    if (!(key in value)) continue;
    checkValue(value[key], propSchema, `${path}.${key}`, errors);
  }
}

function checkValue(value, schema, path, errors) {
  if ('const' in schema && value !== schema.const) {
    errors.push(`${path}: expected constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
    return;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${path}: expected a string`);
      return;
    }
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') errors.push(`${path}: expected a boolean`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected an array`);
      return;
    }
    if (schema.minItems && value.length < schema.minItems) {
      errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((item, i) => checkObject(item, schema.items, `${path}[${i}]`, errors));
    }
  } else if (schema.type === 'object') {
    checkObject(value, schema, path, errors);
  }
}

export function listManifestFiles() {
  return readdirSync(MANIFESTS_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()
    .map((f) => join(MANIFESTS_DIR, f));
}

/**
 * js-yaml 5's `.load()` types its return as `unknown` (was `any` in 4.x) —
 * this manifest is validated dynamically by `validateManifest`/`checkObject`
 * above, never by a static type, so re-annotate it `any` here rather than
 * let `unknown` leak into every .ts consumer (replay-manifest-schema.test.ts
 * destructures and reads properties off this return value directly).
 * @returns {{ manifest: any, path: string }}
 */
export function loadManifest(pathOrReplayId) {
  const path = pathOrReplayId.endsWith('.yml') || pathOrReplayId.endsWith('.yaml')
    ? resolve(pathOrReplayId)
    : join(MANIFESTS_DIR, `${pathOrReplayId}.yml`);
  const manifest = yaml.load(readFileSync(path, 'utf8'));
  return { manifest, path };
}

/** Resolves a manifest's fixture entries to absolute source paths, checked to exist. */
export function resolveFixtureFiles(manifest) {
  const dir = join(FIXTURES_DIR, manifest.feature_id, manifest.replay_id);
  return manifest.fixture.map((f) => ({
    absSource: join(dir, f.source),
    target: f.target,
  }));
}
