// Structural checks YAML parsing alone misses: a workflow that parses can still
// reference a job it does not need, a step id it does not have, an output it
// does not declare, or a local action that is not there. Those fail only at run
// time on GitHub, where the failure is a confusing skipped job or an empty
// string. Cheap to prove statically, so prove it here.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';

const ROOT = resolve(process.cwd());
const WORKFLOWS = join(ROOT, '.github/workflows');
const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'));

/** The outputs a reusable workflow exposes, from its own `on.workflow_call.outputs`. */
function calledOutputs(uses) {
  const called = load(readFileSync(join(ROOT, uses), 'utf8'));
  return (called.on ?? called[true])?.workflow_call?.outputs ?? {};
}

const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const refs = (text, re) => [...String(text).matchAll(re)].map((m) => m[1]);

describe.each(files)('%s', (file) => {
  const text = readFileSync(join(WORKFLOWS, file), 'utf8');
  const wf = load(text);
  const jobs = wf.jobs ?? {};

  it('parses and has jobs', () => {
    expect(Object.keys(jobs).length).toBeGreaterThan(0);
  });

  it('every `needs` entry is a job in this workflow', () => {
    for (const [id, job] of Object.entries(jobs)) {
      for (const need of asList(job.needs)) expect(Object.keys(jobs), `${id} needs ${need}`).toContain(need);
    }
  });

  it('every `needs.<job>` reference is one of that job\'s needs', () => {
    for (const [id, job] of Object.entries(jobs)) {
      const allowed = new Set(asList(job.needs));
      for (const ref of refs(JSON.stringify(job), /needs\.([A-Za-z0-9_-]+)/g)) {
        expect(allowed.has(ref), `${file}: job ${id} reads needs.${ref} without needing it`).toBe(true);
      }
    }
  });

  it('every `steps.<id>` reference names a step with that id in the same job', () => {
    for (const [id, job] of Object.entries(jobs)) {
      if (!Array.isArray(job.steps)) continue;
      const ids = new Set(job.steps.map((s) => s.id).filter(Boolean));
      for (const ref of refs(JSON.stringify(job), /steps\.([A-Za-z0-9_-]+)/g)) {
        expect(ids.has(ref), `${file}: job ${id} reads steps.${ref}, which has no step id`).toBe(true);
      }
    }
  });

  it('every `needs.<job>.outputs.<name>` is declared by that job', () => {
    for (const [id, job] of Object.entries(jobs)) {
      for (const m of JSON.stringify(job).matchAll(/needs\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)/g)) {
        const needed = jobs[m[1]];
        // A job that calls a reusable workflow gets its outputs from that
        // workflow's `workflow_call.outputs`; an output it no longer declares
        // evaluates to an empty string at run time, which fails open or closed
        // depending on the caller's expression.
        const declared = needed?.uses ? calledOutputs(needed.uses) : needed?.outputs;
        expect(declared && m[2] in declared, `${file}: job ${id} reads needs.${m[1]}.outputs.${m[2]}, which is not declared`).toBe(true);
      }
    }
  });

  it('local actions and reusable workflows exist', () => {
    const uses = [];
    for (const job of Object.values(jobs)) {
      if (typeof job.uses === 'string') uses.push(job.uses);
      for (const step of job.steps ?? []) if (typeof step.uses === 'string') uses.push(step.uses);
    }
    for (const u of uses.filter((x) => x.startsWith('./'))) {
      const target = join(ROOT, u);
      const ok = existsSync(join(target, 'action.yml')) || existsSync(join(target, 'action.yaml')) || existsSync(target);
      expect(ok, `${file}: ${u} does not exist`).toBe(true);
    }
  });

  it('every remote `uses:` is pinned to a full commit SHA', () => {
    const uses = [];
    for (const job of Object.values(jobs)) {
      if (typeof job.uses === 'string') uses.push(job.uses);
      for (const step of job.steps ?? []) if (typeof step.uses === 'string') uses.push(step.uses);
    }
    for (const u of uses.filter((x) => !x.startsWith('./') && !x.startsWith('docker://'))) {
      expect(/@[0-9a-f]{40}$/.test(u), `${file}: ${u} is not pinned to a SHA`).toBe(true);
    }
  });

  it('a workflow_call workflow only exposes outputs its jobs declare', () => {
    const outputs = wf.on?.workflow_call?.outputs ?? wf[true]?.workflow_call?.outputs;
    if (!outputs) return;
    for (const [name, def] of Object.entries(outputs)) {
      const m = /jobs\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)/.exec(def.value ?? '');
      expect(m, `${file}: output ${name} has no jobs.<id>.outputs.<name> value`).not.toBeNull();
      expect(jobs[m[1]]?.outputs && m[2] in jobs[m[1]].outputs, `${file}: output ${name} points at an undeclared job output`).toBe(true);
    }
  });
});

describe('codeql matrix', () => {
  it('every matrix language names a detect-changes output (indexed reads are invisible to the regex checks)', () => {
    const wf = load(readFileSync(join(WORKFLOWS, 'codeql.yml'), 'utf8'));
    const outputs = calledOutputs(wf.jobs['detect-changes'].uses);
    for (const leg of wf.jobs.analyze.strategy.matrix.include) {
      if (leg.language === 'javascript-typescript') continue; // reads `code`
      expect(leg.language in outputs, `no detect-changes output for the ${leg.language} leg`).toBe(true);
    }
    expect('code' in outputs).toBe(true);
  });
});

describe('composite actions', () => {
  const dirs = readdirSync(join(ROOT, '.github/actions'));
  it.each(dirs)('%s steps either use an action or declare a shell', (dir) => {
    const action = load(readFileSync(join(ROOT, '.github/actions', dir, 'action.yml'), 'utf8'));
    for (const step of action.runs.steps) {
      if (step.run) expect(step.shell, `${dir}: a run step needs a shell`).toBeTruthy();
    }
  });
});
