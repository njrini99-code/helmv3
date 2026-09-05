// Node version pinning: `package.json#engines.node` must be an EXACT MAJOR
// ("22.x"), not a range ("^22", ">=22", "22"), and any local version-manager
// file (.nvmrc / .node-version) must name the same major. A range lets
// `npm ci`/CI/a contributor's own manager silently pick a different minor —
// the exact class of drift `engines` exists to close — and two files naming
// two different majors is worse than either alone, because the reader who
// checks only one of them sees a confident, wrong answer.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, Status } from '../result.mjs';

export const meta = { id: 'node', title: 'Node engine pinning' };

// "22.x" -> 22. Anything else (a range, a full semver, a bare major with no
// ".x") does not match — this check exists specifically to forbid those
// forms, not merely to extract a number from them.
function exactMajor(spec) {
  const m = typeof spec === 'string' ? spec.trim().match(/^(\d+)\.x$/) : null;
  return m ? Number(m[1]) : null;
}

// A version-manager file's content is typically a bare major ("22"), a full
// version ("22.9.0"), or a "v"-prefixed form ("v22.9.0"). Read only the
// leading major digits; that is all a manager file is required to promise.
function fileMajor(raw) {
  const m = raw.trim().match(/^v?(\d+)/);
  return m ? Number(m[1]) : null;
}

export async function run(ctx) {
  const out = [];
  const { repoRoot } = ctx;

  const pkgPath = join(repoRoot, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch (err) {
    return [check('node.package', Status.BLOCKED, 'package.json unreadable', { detail: String(err) })];
  }

  const spec = pkg?.engines?.node;
  const major = exactMajor(spec);
  if (major === null) {
    out.push(
      check('node.engines-exact-major', Status.FAIL,
        'package.json engines.node is not an exact major ("NN.x") — a range lets npm/CI pick any minor', {
          expected: '"<major>.x", e.g. "22.x"',
          actual: spec ?? '(absent)',
        }),
    );
    // Nothing to cross-check a version-manager file against without a major.
    return out;
  }
  out.push(check('node.engines-exact-major', Status.PASS, `engines.node pins an exact major (${spec})`));

  // Cross-check .nvmrc and .node-version, if present, against the same major.
  for (const name of ['.nvmrc', '.node-version']) {
    const id = name.replace(/^\./, '');
    const p = join(repoRoot, name);
    if (!existsSync(p)) continue;
    let raw;
    try {
      raw = readFileSync(p, 'utf-8');
    } catch (err) {
      out.push(check(`node.${id}-readable`, Status.BLOCKED, `${name} exists but could not be read`, { detail: String(err) }));
      continue;
    }
    const fm = fileMajor(raw);
    if (fm === null) {
      out.push(check(`node.${id}-agrees`, Status.FAIL, `${name} does not name a readable version`, { actual: raw.trim() }));
    } else if (fm !== major) {
      out.push(check(`node.${id}-agrees`, Status.FAIL, `${name} names major ${fm}, package.json engines.node names ${major}`, {
        expected: String(major),
        actual: String(fm),
      }));
    } else {
      out.push(check(`node.${id}-agrees`, Status.PASS, `${name} agrees with engines.node (${major})`));
    }
  }

  return out;
}
