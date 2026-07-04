import { describe, expect, it } from 'vitest';
import {
  deriveBenLeahTrackStatus,
  latestProductionReadyAt,
  applyWorkflowSelection,
  currentWorkflowSelection,
  workflowLabelForSelection,
  type BenLeahGitHubIssue,
} from '@/lib/admin/ben-leah-issue-tracker';
import type { VercelDeployment } from '@/lib/admin/vercel-api';

function issue(overrides: Partial<BenLeahGitHubIssue> = {}): BenLeahGitHubIssue {
  return {
    number: 1,
    html_url: 'https://github.com/o/r/issues/1',
    title: '[Ben + Leah] Bug: Example',
    displayTitle: 'Example',
    state: 'open',
    created_at: '2026-07-01T12:00:00Z',
    updated_at: '2026-07-01T12:00:00Z',
    closed_at: null,
    labels: ['ben-leah'],
    kind: 'bug',
    priority: 'normal',
    category: 'GolfHelm',
    ...overrides,
  };
}

describe('deriveBenLeahTrackStatus', () => {
  it('marks open issues without workflow labels as open', () => {
    expect(deriveBenLeahTrackStatus(issue(), null)).toBe('open');
  });

  it('marks status:in-progress as in progress while open', () => {
    expect(
      deriveBenLeahTrackStatus(issue({ labels: ['ben-leah', 'status:in-progress'] }), null),
    ).toBe('in_progress');
  });

  it('marks status:wontfix regardless of state', () => {
    expect(
      deriveBenLeahTrackStatus(issue({ state: 'closed', labels: ['status:wontfix'] }), null),
    ).toBe('wont_fix');
  });

  it('marks closed issues shipped when production deploy is newer than close', () => {
    const closed = issue({
      state: 'closed',
      closed_at: '2026-07-04T12:00:00.000Z',
    });
    const prodReady = Date.parse('2026-07-04T13:00:00.000Z');
    expect(deriveBenLeahTrackStatus(closed, prodReady)).toBe('in_production');
  });

  it('marks closed issues pending deploy when production is older than close', () => {
    const closed = issue({
      state: 'closed',
      closed_at: '2026-07-04T14:00:00.000Z',
    });
    const prodReady = Date.parse('2026-07-04T12:00:00.000Z');
    expect(deriveBenLeahTrackStatus(closed, prodReady)).toBe('fixed_pending_deploy');
  });

  it('honors explicit status:in-production label', () => {
    expect(
      deriveBenLeahTrackStatus(issue({ labels: ['status:in-production'] }), null),
    ).toBe('in_production');
  });
});

describe('workflow labels', () => {
  it('maps selection to GitHub label names', () => {
    expect(workflowLabelForSelection('in_progress')).toBe('status:in-progress');
    expect(workflowLabelForSelection('in_production')).toBe('status:in-production');
  });

  it('replaces workflow labels while keeping metadata tags', () => {
    const next = applyWorkflowSelection(
      ['ben-leah', 'kind:bug', 'status:triaged', 'priority:high'],
      'in_progress',
    );
    expect(next).toEqual(['ben-leah', 'kind:bug', 'priority:high', 'status:in-progress']);
  });

  it('reads the active workflow selection from labels', () => {
    expect(currentWorkflowSelection(['status:in-production', 'ben-leah'])).toBe('in_production');
    expect(currentWorkflowSelection(['ben-leah'])).toBeNull();
  });
});

describe('latestProductionReadyAt', () => {
  it('returns the first READY production deployment', () => {
    const deployments: VercelDeployment[] = [
      {
        uid: 'preview',
        state: 'READY',
        createdAt: 1,
        ready: 2,
        target: null,
        url: 'preview.vercel.app',
        commitSha: 'abc',
        commitMessage: null,
        commitRef: null,
        commitAuthor: null,
      },
      {
        uid: 'prod',
        state: 'READY',
        createdAt: 3,
        ready: 4_000,
        target: 'production',
        url: 'helmsportslabs.com',
        commitSha: 'def4567890',
        commitMessage: 'fix',
        commitRef: 'main',
        commitAuthor: 'nick',
      },
    ];
    expect(latestProductionReadyAt(deployments)).toEqual({
      readyAt: 4_000,
      commitSha: 'def4567890',
    });
  });
});
