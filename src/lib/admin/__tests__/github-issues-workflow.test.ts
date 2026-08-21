import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setBenLeahIssueWorkflow, ensureBenLeahGitHubLabels } from '@/lib/admin/github-issues-workflow';

/**
 * Bridge audit 2026-08-21: the ben-leah sidebar copy says `status:wontfix`
 * means "closed without shipping", but setBenLeahIssueWorkflow only ever
 * PATCHed `{labels}` — an admin selecting "Won't fix" could leave the
 * GitHub issue open while the Bridge UI implied it was closed. Fixed by
 * closing on wont_fix and reopening when moving away from it (only when the
 * issue was actually wontfix'd through this workflow — never touches state
 * for any other transition, so an issue closed for an unrelated reason is
 * never force-reopened).
 */
describe('setBenLeahIssueWorkflow — state stays in sync with the wontfix label', () => {
  const originalToken = process.env.GITHUB_ISSUES_TOKEN;
  const originalFetch = global.fetch;
  let lastBody: Record<string, unknown> | null = null;
  let labelCreateBodies: Record<string, unknown>[] = [];

  beforeEach(() => {
    process.env.GITHUB_ISSUES_TOKEN = 'test-token';
    lastBody = null;
    labelCreateBodies = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/labels')) {
        // ensureBenLeahGitHubLabels' createLabelIfMissing calls — 422 means
        // "already exists", the normal steady-state path.
        labelCreateBodies.push(JSON.parse(String(init?.body ?? '{}')));
        return new Response('{}', { status: 422 });
      }
      lastBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.GITHUB_ISSUES_TOKEN = originalToken;
    global.fetch = originalFetch;
  });

  it('closes the issue (not_planned) when newly selecting wont_fix', async () => {
    await setBenLeahIssueWorkflow(785, ['ben-leah', 'status:triaged'], 'wont_fix');
    expect(lastBody?.state).toBe('closed');
    expect(lastBody?.state_reason).toBe('not_planned');
    expect(lastBody?.labels).toContain('status:wontfix');
  });

  it('reopens the issue when moving away from wont_fix', async () => {
    await setBenLeahIssueWorkflow(785, ['ben-leah', 'status:wontfix'], 'in_progress');
    expect(lastBody?.state).toBe('open');
    expect(lastBody?.state_reason).toBeUndefined();
    expect(lastBody?.labels).toContain('status:in-progress');
  });

  it('touches only labels — no state field at all — for any transition not involving wontfix', async () => {
    await setBenLeahIssueWorkflow(785, ['ben-leah', 'status:triaged'], 'in_progress');
    expect(lastBody?.state).toBeUndefined();
    expect(lastBody?.state_reason).toBeUndefined();
  });

  it('re-selecting wont_fix when already wontfix stays closed, never reopens', async () => {
    await setBenLeahIssueWorkflow(785, ['ben-leah', 'status:wontfix'], 'wont_fix');
    expect(lastBody?.state).toBe('closed');
    expect(lastBody?.state_reason).toBe('not_planned');
  });
});

describe('ensureBenLeahGitHubLabels — repo label color matches the live label', () => {
  const originalToken = process.env.GITHUB_ISSUES_TOKEN;
  const originalFetch = global.fetch;

  it('creates the ben-leah label with color ededed, not the stale 16A34A constant', async () => {
    process.env.GITHUB_ISSUES_TOKEN = 'test-token';
    const createdBodies: Array<{ name: string; color: string }> = [];
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      createdBodies.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response('{}', { status: 422 });
    }) as unknown as typeof fetch;

    await ensureBenLeahGitHubLabels();

    const repoLabel = createdBodies.find((b) => b.name === 'ben-leah');
    expect(repoLabel?.color).toBe('ededed');

    process.env.GITHUB_ISSUES_TOKEN = originalToken;
    global.fetch = originalFetch;
  });
});
