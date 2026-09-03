import 'server-only';

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';

/**
 * Charter and verifier visibility (brief §37-40): what the mutation gate is
 * currently configured to require, what each feature's contract currently
 * resolves to, and what the Janitor's ranked entropy findings are — each
 * with the evidence command a human runs to see the full picture. Three
 * independent sources, three independent read paths: one source being
 * absent (the Janitor report is not committed; the mutation report only
 * exists on the weekly CircleCI container) must not blank the other two.
 */

// ── Mutation gate config ────────────────────────────────────────────────

export interface MutationGateCharter {
  floor: number;
  scope: string;
  provisional: boolean;
  evidenceCommand: string;
}

interface MutationGateConfigFile {
  floor: number;
  scope: string;
  $comment?: string[];
}

/** Pure. */
export function toMutationGateCharter(config: MutationGateConfigFile): MutationGateCharter {
  return {
    floor: config.floor,
    scope: config.scope,
    provisional: (config.$comment ?? []).some((line) => /PROVISIONAL/.test(line)),
    evidenceCommand: 'node scripts/mutation-gate.mjs  # report only exists on the weekly stryker-coachhelm CircleCI job',
  };
}

export async function fetchMutationGateCharter(): Promise<AdminFetchResult<MutationGateCharter>> {
  try {
    const raw = await readFile(join(process.cwd(), 'config/mutation-gate.json'), 'utf-8');
    return ok(toMutationGateCharter(JSON.parse(raw) as MutationGateConfigFile));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return unconfigured('mutation gate config (config/mutation-gate.json)');
    }
    return failed(error instanceof Error ? error.message : String(error));
  }
}

// ── Resolved contracts per feature ──────────────────────────────────────

export interface ContractCharterSummary {
  featureId: string;
  anchorSha: string;
  resolvedVia: string;
  claimCount: number;
  supersededCount: number;
  evidenceCommand: string;
}

interface ResolvedContractFile {
  feature_id: string;
  anchor_sha: string;
  resolution: { via: string };
  current_contract: unknown[];
  superseded_claims: unknown[];
}

/** Pure. */
export function toContractCharterSummary(contract: ResolvedContractFile): ContractCharterSummary {
  return {
    featureId: contract.feature_id,
    anchorSha: contract.anchor_sha,
    resolvedVia: contract.resolution.via,
    claimCount: contract.current_contract.length,
    supersededCount: contract.superseded_claims?.length ?? 0,
    evidenceCommand: `npm run contract:resolve -- --feature ${contract.feature_id}`,
  };
}

export async function fetchContractsCharter(): Promise<AdminFetchResult<ContractCharterSummary[]>> {
  const dir = join(process.cwd(), 'docs/generated/contracts');
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));
    if (jsonFiles.length === 0) return unconfigured('resolved contracts (docs/generated/contracts/*.json)');

    const summaries = await Promise.all(
      jsonFiles.map(async (entry) => {
        const raw = await readFile(join(dir, entry.name), 'utf-8');
        return toContractCharterSummary(JSON.parse(raw) as ResolvedContractFile);
      }),
    );
    return ok(summaries.sort((a, b) => a.featureId.localeCompare(b.featureId)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return unconfigured('resolved contracts (docs/generated/contracts/*.json)');
    }
    return failed(error instanceof Error ? error.message : String(error));
  }
}

// ── Janitor's ranked findings ───────────────────────────────────────────

export interface JanitorCharterClass {
  classId: string;
  title: string;
  verdict: 'FINDINGS' | 'ZERO_FINDINGS_VERIFIED' | 'NO_SIGNAL';
  findingCount: number;
  evidenceCommand: string;
}

export interface JanitorCharterFinding {
  id: string;
  classId: string;
  scope: string;
  reason: string;
  confidence: string;
  sizeOfChange: string;
}

export interface JanitorCharter {
  generatedAt: string;
  generatedAtSha: string;
  classes: JanitorCharterClass[];
  topFindings: JanitorCharterFinding[];
}

interface JanitorFindingsFile {
  generated_at: string;
  generated_at_sha: string;
  classes: Array<{ classId: string; title: string; verdict: JanitorCharterClass['verdict']; findingCount: number; evidenceCommand: string }>;
  findings: Array<{ id: string; class: string; scope: string; reason: string; confidence: string; size_of_change: string }>;
}

/** Pure. */
export function toJanitorCharter(file: JanitorFindingsFile, topN = 20): JanitorCharter {
  return {
    generatedAt: file.generated_at,
    generatedAtSha: file.generated_at_sha,
    classes: file.classes.map((c) => ({
      classId: c.classId,
      title: c.title,
      verdict: c.verdict,
      findingCount: c.findingCount,
      evidenceCommand: c.evidenceCommand,
    })),
    topFindings: file.findings.slice(0, topN).map((f) => ({
      id: f.id,
      classId: f.class,
      scope: f.scope,
      reason: f.reason,
      confidence: f.confidence,
      sizeOfChange: f.size_of_change,
    })),
  };
}

export async function fetchJanitorCharter(): Promise<AdminFetchResult<JanitorCharter>> {
  try {
    const raw = await readFile(join(process.cwd(), 'docs/generated/janitor-findings.json'), 'utf-8');
    return ok(toJanitorCharter(JSON.parse(raw) as JanitorFindingsFile));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return unconfigured('Janitor findings (docs/generated/janitor-findings.json — run `npm run janitor` to generate)');
    }
    return failed(error instanceof Error ? error.message : String(error));
  }
}
