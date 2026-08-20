// Feature registry integrity: every concrete doc path a feature points at must
// exist. A dead current-state doc means feature-awareness routing sends the next
// agent to a file that isn't there.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { check, Status } from '../result.mjs';

export const meta = { id: 'registry', title: 'Feature registry' };

// Collect concrete (non-glob) doc paths worth validating for a feature.
function docPaths(feature) {
  const paths = [];
  const d = feature?.docs ?? {};
  if (typeof d.feature === 'string') paths.push({ kind: 'docs.feature', p: d.feature });
  for (const arr of [d.flows, feature?.review?.required_docs]) {
    if (Array.isArray(arr)) for (const p of arr) if (typeof p === 'string') paths.push({ kind: 'doc', p });
  }
  return paths.filter(({ p }) => !p.includes('*'));
}

export async function run(ctx) {
  const { repoRoot, manifest } = ctx;
  const rel = manifest?.authority?.feature_registry ?? 'memory/registry.yml';
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) {
    return [check('registry.exists', Status.FAIL, `${rel} missing`, { expected: rel })];
  }

  let doc;
  try {
    doc = YAML.parse(readFileSync(abs, 'utf-8'));
  } catch (err) {
    return [check('registry.parse', Status.BLOCKED, `${rel} is not valid YAML`, { detail: String(err) })];
  }

  const features = doc?.features ?? {};
  const dead = [];
  let checked = 0;
  for (const [key, feature] of Object.entries(features)) {
    for (const { kind, p } of docPaths(feature)) {
      checked += 1;
      if (!existsSync(join(repoRoot, p))) dead.push({ feature: key, kind, path: p });
    }
  }

  const out = [
    check('registry.parse', Status.PASS, `${Object.keys(features).length} features parsed`),
  ];
  out.push(
    dead.length === 0
      ? check('registry.doc-paths', Status.PASS, `all ${checked} referenced doc paths resolve`)
      : check('registry.doc-paths', Status.FAIL, `${dead.length} of ${checked} referenced doc paths do not resolve`, {
          evidence: dead.slice(0, 20),
          source: rel,
        }),
  );
  return out;
}
