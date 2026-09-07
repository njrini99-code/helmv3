#!/usr/bin/env node
/**
 * advisor-ratchet.mjs — ratchet for Supabase security/performance advisors.
 *
 * WHY THIS EXISTS
 *
 * The Supabase advisor lints (security + performance) already run
 * continuously against production, but nothing in this repo watches the
 * COUNT. A finding can appear the day a migration ships and sit unnoticed
 * for months — this is D4's answer to "drift that pages instead of waits"
 * applied to advisor findings, not just schema/ledger drift.
 *
 * WHAT IT ENFORCES
 *
 * Pulls both advisor types through the Supabase Management API
 * (`GET /v1/projects/{ref}/advisors/{security|performance}`, same
 * SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_ID secrets db-drift.yml already
 * uses — no new credential), tallies findings by advisor NAME (the class,
 * e.g. `unused_index`, `rls_enabled_no_policy`), and compares each class's
 * count against `supabase-advisor-baseline.json`. A class may only shrink.
 * A brand-new class at count > 0 is also a regression (baseline treats an
 * absent key as 0).
 *
 * READ-ONLY. GET requests only, never writes, never applies anything.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_ID=... node scripts/db/advisor-ratchet.mjs
 *   ... --update    # re-baseline after a class shrinks or a finding is fixed
 *
 * Exit 0: no class grew.  Exit 1: at least one class grew.  Exit 2: could not reach the API.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE_PATH = resolve(ROOT, 'supabase-advisor-baseline.json');
const UPDATE = process.argv.includes('--update');

/** @param {'security'|'performance'} type */
async function fetchAdvisors(type, projectId, accessToken) {
  const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectId)}/advisors/${type}`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`advisors/${type} returned ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Tally findings by their advisor "name" (class), pure function so it can be
 * unit-tested against a fixture payload shape rather than a live pull.
 * @param {{ lints?: Array<{ name?: string, cache_key?: string }> }} payload
 */
export function tallyByClass(payload) {
  const counts = {};
  for (const finding of payload?.lints ?? []) {
    const key = finding.name ?? finding.cache_key ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * @param {Record<string, number>} current
 * @param {Record<string, number>} baseline
 * @returns {{ class: string, current: number, baseline: number }[]} classes that grew
 */
export function findRegressions(current, baseline) {
  const regressions = [];
  for (const [cls, count] of Object.entries(current)) {
    const prior = baseline[cls] ?? 0;
    if (count > prior) regressions.push({ class: cls, current: count, baseline: prior });
  }
  return regressions;
}

async function main() {
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!projectId || !accessToken) {
    console.error(
      'advisor-ratchet: missing SUPABASE_PROJECT_ID and/or SUPABASE_ACCESS_TOKEN. This script only performs read-only GETs against the Management API.',
    );
    process.exit(2);
  }

  let security, performance;
  try {
    [security, performance] = await Promise.all([
      fetchAdvisors('security', projectId, accessToken),
      fetchAdvisors('performance', projectId, accessToken),
    ]);
  } catch (err) {
    console.error(`advisor-ratchet: could not reach the Management API — ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const securityCounts = tallyByClass(security);
  const performanceCounts = tallyByClass(performance);
  const current = {
    security: securityCounts,
    performance: performanceCounts,
  };
  const totalCurrent = Object.values(securityCounts).reduce((a, b) => a + b, 0) +
    Object.values(performanceCounts).reduce((a, b) => a + b, 0);

  console.log('Supabase advisor ratchet\n' + '='.repeat(60));
  console.log(`security findings: ${Object.values(securityCounts).reduce((a, b) => a + b, 0)}`);
  console.log(`performance findings: ${Object.values(performanceCounts).reduce((a, b) => a + b, 0)}`);

  if (UPDATE) {
    const header = existsSync(BASELINE_PATH)
      ? JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).$note
      : undefined;
    const out = {
      $note:
        header ??
        'Counts by advisor class, security and performance separately. May only shrink; a new class at count > 0 is a regression too. ' +
          'The pg_graphql_authenticated_table_exposed and pg_graphql_anon_table_exposed classes under security drop to zero once the owner removes the exposed GraphQL schema in the Supabase dashboard — that is an owner action, not something this repo can fix.',
      updated_at: new Date().toISOString().slice(0, 10),
      security: securityCounts,
      performance: performanceCounts,
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nbaseline updated -> ${totalCurrent} total findings across both classes`);
    process.exit(0);
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error('advisor-ratchet: no baseline. Run with --update to create one.');
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  const securityRegressions = findRegressions(securityCounts, baseline.security ?? {});
  const performanceRegressions = findRegressions(performanceCounts, baseline.performance ?? {});
  const regressions = [
    ...securityRegressions.map((r) => ({ ...r, type: 'security' })),
    ...performanceRegressions.map((r) => ({ ...r, type: 'performance' })),
  ];

  if (regressions.length > 0) {
    console.error(`\n${regressions.length} class(es) grew:`);
    for (const r of regressions) {
      console.error(`   [${r.type}] ${r.class}: ${r.current} > baseline ${r.baseline}`);
    }
    process.exit(1);
  }

  console.log('\nOK: no advisor class grew.');
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  main();
}
