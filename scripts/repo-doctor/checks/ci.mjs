// CI check-name uniqueness: a required status-check context must be produced by
// EXACTLY ONE workflow job. Two jobs posting the same name is the phantom-context
// trap (PR #1125 — a red smoke merged because a same-named job reported green).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { check, Status } from '../result.mjs';

export const meta = { id: 'ci', title: 'CI workflow semantics' };

export async function run(ctx) {
  const { repoRoot, manifest } = ctx;
  const dir = join(repoRoot, '.github/workflows');
  if (!existsSync(dir)) {
    return [check('ci.workflows', Status.UNKNOWN, '.github/workflows not found')];
  }

  // Map every job's rendered check-run name -> [workflow files that produce it].
  const producers = new Map();
  let parsed = 0;
  const parseErrors = [];
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    let wf;
    try {
      wf = YAML.parse(readFileSync(join(dir, f), 'utf-8'));
      parsed += 1;
    } catch (err) {
      parseErrors.push({ file: f, error: String(err) });
      continue;
    }
    for (const [jobId, job] of Object.entries(wf?.jobs ?? {})) {
      const name = typeof job?.name === 'string' ? job.name : jobId;
      if (!producers.has(name)) producers.set(name, []);
      producers.get(name).push(f);
    }
  }

  const out = [];
  if (parseErrors.length) {
    out.push(check('ci.parse', Status.BLOCKED, `${parseErrors.length} workflow(s) failed to parse`, { evidence: parseErrors }));
  } else {
    out.push(check('ci.parse', Status.PASS, `${parsed} workflow file(s) parsed`));
  }

  // The names the manifest says must be unique (they are required contexts).
  const mustBeUnique = manifest?.ci?.unique_check_names ?? [];
  const collisions = [];
  const missing = [];
  for (const name of mustBeUnique) {
    const p = producers.get(name);
    if (!p || p.length === 0) missing.push(name);
    else if (p.length > 1) collisions.push({ name, produced_by: p });
  }

  out.push(
    collisions.length === 0
      ? check('ci.unique-producers', Status.PASS, `all ${mustBeUnique.length} required check names have a single producer`)
      : check('ci.unique-producers', Status.FAIL, `${collisions.length} required check name(s) produced by more than one job`, {
          evidence: collisions,
          source: 'config/repo/manifest.yml (ci.unique_check_names)',
        }),
  );
  if (missing.length) {
    out.push(check('ci.required-producer', Status.FAIL, `${missing.length} required check name(s) have NO producing job`, {
      evidence: missing,
      detail: 'A required status check that nothing posts makes every PR unsatisfiable.',
    }));
  }

  return out;
}
