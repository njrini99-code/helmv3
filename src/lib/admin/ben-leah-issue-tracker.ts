/**
 * Pure Ben + Leah issue lifecycle helpers — safe to import from tests and
 * server fetchers alike (no secrets, no server-only).
 */

import type { VercelDeployment } from '@/lib/admin/vercel-api';

/** Workflow stage shown in Helm Bridge — derived from GitHub state, labels, and prod deploy timing. */
export type BenLeahTrackStatus =
  | 'open'
  | 'in_progress'
  | 'in_production'
  | 'fixed_pending_deploy'
  | 'fixed'
  | 'wont_fix';

export interface BenLeahGitHubIssue {
  number: number;
  html_url: string;
  title: string;
  displayTitle: string;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  labels: string[];
  kind: 'bug' | 'change' | 'addition' | null;
  priority: 'normal' | 'high' | 'urgent' | null;
  category: string | null;
}

export interface BenLeahTrackedIssue extends BenLeahGitHubIssue {
  trackStatus: BenLeahTrackStatus;
}

/** GitHub workflow labels Helm Bridge reads and writes. */
export const BEN_LEAH_WORKFLOW_LABELS = [
  'status:triaged',
  'status:in-progress',
  'status:in-production',
  'status:wontfix',
] as const;

export type BenLeahWorkflowLabel = (typeof BEN_LEAH_WORKFLOW_LABELS)[number];

/** Initial workflow label applied to every new Ben + Leah submission. */
export const BEN_LEAH_INITIAL_WORKFLOW_LABEL: BenLeahWorkflowLabel = 'status:triaged';

/** Values the Bridge UI can set on an issue (maps 1:1 to workflow labels). */
export type BenLeahWorkflowSelection =
  | 'triaged'
  | 'in_progress'
  | 'in_production'
  | 'wont_fix';

export const BEN_LEAH_WORKFLOW_LABEL_DEFS: ReadonlyArray<{
  name: BenLeahWorkflowLabel;
  color: string;
  description: string;
}> = [
  {
    name: 'status:triaged',
    color: '0E8A16',
    description: 'Ben + Leah: submitted, awaiting or in triage',
  },
  {
    name: 'status:in-progress',
    color: 'FBCA04',
    description: 'Ben + Leah: work started',
  },
  {
    name: 'status:in-production',
    color: '1D76DB',
    description: 'Ben + Leah: manually confirmed live in production',
  },
  {
    name: 'status:wontfix',
    color: '888888',
    description: 'Ben + Leah: will not ship',
  },
];

const WORKFLOW_SELECTION_TO_LABEL: Record<BenLeahWorkflowSelection, BenLeahWorkflowLabel> = {
  triaged: 'status:triaged',
  in_progress: 'status:in-progress',
  in_production: 'status:in-production',
  wont_fix: 'status:wontfix',
};

export function workflowLabelForSelection(selection: BenLeahWorkflowSelection): BenLeahWorkflowLabel {
  return WORKFLOW_SELECTION_TO_LABEL[selection];
}

export function isBenLeahWorkflowLabel(label: string): label is BenLeahWorkflowLabel {
  return (BEN_LEAH_WORKFLOW_LABELS as readonly string[]).includes(label);
}

/** Current workflow label on the issue, if any. */
export function currentWorkflowSelection(labels: string[]): BenLeahWorkflowSelection | null {
  if (labels.includes('status:wontfix')) return 'wont_fix';
  if (labels.includes('status:in-production')) return 'in_production';
  if (labels.includes('status:in-progress')) return 'in_progress';
  if (labels.includes('status:triaged')) return 'triaged';
  return null;
}

/** Replace workflow labels while preserving ben-leah / kind / priority / category tags. */
export function applyWorkflowSelection(
  labels: string[],
  selection: BenLeahWorkflowSelection,
): string[] {
  const preserved = labels.filter((label) => !isBenLeahWorkflowLabel(label));
  return [...preserved, workflowLabelForSelection(selection)];
}

export function stripWorkflowLabels(labels: string[]): string[] {
  return labels.filter((label) => !isBenLeahWorkflowLabel(label));
}

/** Latest READY production deployment timestamp (epoch ms), if Vercel data is available. */
export function latestProductionReadyAt(deployments: VercelDeployment[]): {
  readyAt: number | null;
  commitSha: string | null;
} {
  const prod = deployments.find(
    (deployment) =>
      deployment.state === 'READY' &&
      deployment.target === 'production' &&
      deployment.ready != null,
  );
  if (!prod?.ready) return { readyAt: null, commitSha: null };
  return { readyAt: prod.ready, commitSha: prod.commitSha };
}

/**
 * Derive Helm Bridge lifecycle from GitHub metadata + optional production deploy time.
 *
 * Label conventions (optional on the GitHub issue):
 * - `status:in-progress` / `status:triaged` → In progress
 * - `status:in-production` → In production (manual confirmation)
 * - `status:wontfix` → Won't fix
 *
 * When an issue is closed, a production deploy whose `ready` time is at or after
 * `closed_at` is treated as "In production".
 */
export function deriveBenLeahTrackStatus(
  issue: BenLeahGitHubIssue,
  productionReadyAt: number | null,
): BenLeahTrackStatus {
  const labels = issue.labels;

  if (labels.includes('status:wontfix')) return 'wont_fix';
  if (labels.includes('status:in-production')) return 'in_production';

  if (issue.state === 'open') {
    if (labels.includes('status:in-progress') || labels.includes('status:triaged')) {
      return 'in_progress';
    }
    return 'open';
  }

  const closedAt = issue.closed_at ? Date.parse(issue.closed_at) : null;
  if (closedAt != null && productionReadyAt != null && productionReadyAt >= closedAt) {
    return 'in_production';
  }
  if (closedAt != null && productionReadyAt != null && productionReadyAt < closedAt) {
    return 'fixed_pending_deploy';
  }

  return 'fixed';
}

export function emptyBenLeahStatusCounts(): Record<BenLeahTrackStatus, number> {
  return {
    open: 0,
    in_progress: 0,
    in_production: 0,
    fixed_pending_deploy: 0,
    fixed: 0,
    wont_fix: 0,
  };
}

export function countBenLeahByStatus(issues: BenLeahTrackedIssue[]): Record<BenLeahTrackStatus, number> {
  const counts = emptyBenLeahStatusCounts();
  for (const issue of issues) counts[issue.trackStatus] += 1;
  return counts;
}

export function withBenLeahTrackStatus(
  issues: BenLeahGitHubIssue[],
  productionReadyAt: number | null,
): BenLeahTrackedIssue[] {
  return issues.map((issue) => ({
    ...issue,
    trackStatus: deriveBenLeahTrackStatus(issue, productionReadyAt),
  }));
}
