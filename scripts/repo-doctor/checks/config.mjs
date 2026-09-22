// Cross-cutting config: required npm scripts, exactly one Supabase root,
// the Vercel deployment model, and Vercel route/upload contracts.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, Status } from '../result.mjs';
import { coverage } from '../../check-vercelignore-coverage.mjs';

export const meta = { id: 'config', title: 'Scripts, Supabase root, deploy model, Vercel upload and cron routes' };

function findRoute(repoRoot, apiPath) {
  const segments = apiPath.replace(/^\/api\//, '').split('/').filter(Boolean);
  let dir = join(repoRoot, 'src', 'app', 'api', ...segments);
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir);
  for (const name of ['route.ts', 'route.tsx', 'route.js', 'route.mjs']) {
    if (entries.includes(name)) return join(dir, name);
  }
  return null;
}

export async function run(ctx) {
  const out = [];
  const { repoRoot, manifest } = ctx;

  const pkgPath = join(repoRoot, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch (err) {
    return [check('config.package', Status.BLOCKED, 'package.json unreadable', { detail: String(err) })];
  }

  const scripts = pkg.scripts ?? {};
  const required = manifest?.required_scripts ?? [];
  const missing = required.filter((s) => !(s in scripts));
  out.push(
    missing.length === 0
      ? check('config.required-scripts', Status.PASS, `all ${required.length} required npm scripts present`)
      : check('config.required-scripts', Status.FAIL, `${missing.length} required npm script(s) missing`, {
          evidence: missing,
          source: 'config/repo/manifest.yml (required_scripts)',
        }),
  );

  const expectedRoot = manifest?.supabase?.root ?? 'supabase';
  const rootToml = join(repoRoot, expectedRoot, 'config.toml');
  out.push(
    existsSync(rootToml)
      ? check('config.supabase-root', Status.PASS, `Supabase root ${expectedRoot}/ present`)
      : check('config.supabase-root', Status.FAIL, `expected ${expectedRoot}/config.toml not found`, {
          expected: `${expectedRoot}/config.toml`,
        }),
  );

  const vjPath = join(repoRoot, 'vercel.json');
  let vj = null;
  if (!existsSync(vjPath)) {
    out.push(check('config.vercel-json', Status.FAIL, 'vercel.json is missing'));
  } else {
    try {
      vj = JSON.parse(readFileSync(vjPath, 'utf-8'));
      const deploymentEnabled = vj?.git?.deploymentEnabled;
      const disabled = deploymentEnabled?.['*'] === false;
      out.push(
        disabled
          ? check('config.deploy-model', Status.PASS, 'production deploy model: MANUAL (all Git auto-deploys disabled)')
          : check('config.deploy-model', Status.FAIL, 'vercel.json must disable Git deployment for every branch', {
              expected: 'git.deploymentEnabled["*"] === false',
              actual: deploymentEnabled ?? '(missing)',
            }),
      );

      const crons = Array.isArray(vj.crons) ? vj.crons : [];
      const invalid = crons.filter((cron) => {
        if (!cron || typeof cron.path !== 'string' || !/^\/api\//.test(cron.path)) return true;
        return !findRoute(repoRoot, cron.path);
      });
      const duplicatePaths = [...new Set(crons.map((cron) => cron?.path).filter(Boolean))]
        .filter((path) => crons.filter((cron) => cron.path === path).length > 1);
      out.push(
        invalid.length === 0 && duplicatePaths.length === 0
          ? check('config.vercel-cron-routes', Status.PASS, `all ${crons.length} Vercel cron paths resolve to unique API routes`)
          : check('config.vercel-cron-routes', Status.FAIL, 'Vercel cron configuration has missing or duplicate routes', {
              missingOrInvalid: invalid.map((cron) => cron?.path ?? '(missing path)'),
              duplicates: duplicatePaths,
            }),
      );
    } catch (err) {
      out.push(check('config.vercel-json', Status.FAIL, 'vercel.json is not valid JSON', { detail: String(err) }));
    }
  }

  const mustIgnore = manifest?.vercel?.must_ignore ?? [];
  if (mustIgnore.length) {
    const viPath = join(repoRoot, '.vercelignore');
    if (!existsSync(viPath)) {
      out.push(check('config.vercelignore-coverage', Status.FAIL, '.vercelignore is missing', {
        expected: `${mustIgnore.length} path(s) excluded`,
      }));
    } else {
      const r = coverage(mustIgnore, readFileSync(viPath, 'utf-8'));
      out.push(
        r.uncovered.length === 0
          ? check('config.vercelignore-coverage', Status.PASS, `.vercelignore covers all ${mustIgnore.length} protected paths`)
          : check('config.vercelignore-coverage', Status.FAIL, `${r.uncovered.length} protected path(s) are not excluded`, {
              evidence: r.uncovered,
              source: 'config/repo/manifest.yml (vercel.must_ignore)',
            }),
      );
    }
  }

  return out;
}
