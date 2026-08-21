import 'server-only';
import {
  BEN_LEAH_INITIAL_WORKFLOW_LABEL,
  BEN_LEAH_WORKFLOW_LABEL_DEFS,
  applyWorkflowSelection,
  type BenLeahWorkflowSelection,
} from '@/lib/admin/ben-leah-issue-tracker';
import {
  githubIssuesHeaders,
  githubIssuesRepo,
  githubIssuesToken,
} from '@/lib/admin/github-issues-config';

const BEN_LEAH_REPO_LABEL = {
  name: 'ben-leah',
  // Bridge audit 2026-08-21: the live GitHub label's actual color is
  // ededed, not 16A34A — createLabelIfMissing silently no-ops on a color
  // mismatch for an already-existing label (GitHub returns 422, swallowed
  // as "already there"), so this constant drifting from reality never
  // surfaced as an error. Matched to the live value rather than re-asserted,
  // since there's no evidence 16A34A was ever the intended color.
  color: 'ededed',
  description: 'Submitted from Helm Bridge Ben + Leah',
} as const;

async function createLabelIfMissing(
  token: string,
  owner: string,
  repo: string,
  name: string,
  color: string,
  description: string,
): Promise<void> {
  // owner/repo originate from githubIssuesRepo() (env-configured constants,
  // never end-user input), but path segments are still encoded defensively
  // so a misconfigured/odd env value can never be interpreted as extra path
  // segments or a different host.
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
    {
      method: 'POST',
      headers: {
        ...githubIssuesHeaders(token),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name, color, description }),
    },
  );
  if (res.ok || res.status === 422) return;
  const text = await res.text();
  throw new Error(`GitHub label create failed for ${name} (${res.status}): ${text.slice(0, 200)}`);
}

/** Idempotent — creates ben-leah + workflow labels when missing. */
export async function ensureBenLeahGitHubLabels(): Promise<void> {
  const token = githubIssuesToken();
  if (!token) return;

  const { owner, repo } = githubIssuesRepo();
  await createLabelIfMissing(
    token,
    owner,
    repo,
    BEN_LEAH_REPO_LABEL.name,
    BEN_LEAH_REPO_LABEL.color,
    BEN_LEAH_REPO_LABEL.description,
  );
  for (const label of BEN_LEAH_WORKFLOW_LABEL_DEFS) {
    await createLabelIfMissing(token, owner, repo, label.name, label.color, label.description);
  }
}

export async function setBenLeahIssueWorkflow(
  issueNumber: number,
  currentLabels: string[],
  selection: BenLeahWorkflowSelection,
): Promise<void> {
  // SECURITY (js/request-forgery): issueNumber ultimately traces back to a
  // caller-supplied value (updateBenLeahIssueWorkflow's argument). The caller
  // already validates it, but this sink must not rely on that — enforce the
  // same "positive integer" allowlist here so this function is safe to call
  // from anywhere. Rejecting anything that isn't `^[0-9]+$`-shaped means the
  // value can never inject extra path segments, a different host, or a query
  // string into the request URL below.
  if (!Number.isInteger(issueNumber) || issueNumber < 1 || !/^[0-9]+$/.test(String(issueNumber))) {
    throw new Error('Invalid GitHub issue number.');
  }

  const token = githubIssuesToken();
  if (!token) {
    throw new Error('GitHub issue token is not configured. Set GITHUB_ISSUES_TOKEN or GITHUB_TOKEN.');
  }

  await ensureBenLeahGitHubLabels();

  // owner/repo are env-configured constants (githubIssuesRepo()), never
  // end-user input; still encoded defensively (see createLabelIfMissing).
  const { owner, repo } = githubIssuesRepo();
  const labels = applyWorkflowSelection(currentLabels, selection);

  // Bridge audit 2026-08-21: the sidebar copy states `status:wontfix` means
  // "closed without shipping", but this PATCH used to touch only `labels` —
  // an admin selecting "Won't fix" could leave the GitHub issue open while
  // the Bridge UI implied it was closed. `state` is now touched in exactly
  // the two cases that keep it in sync with the label, and left untouched
  // otherwise (so this can never reopen an issue closed for an unrelated
  // reason, e.g. #785, closed `completed` outside this workflow entirely):
  //   - newly selecting wont_fix  -> close (state_reason: not_planned)
  //   - moving AWAY from wont_fix -> reopen, since the issue may still need
  //     work and a closed-but-"in progress"-labeled issue would be its own
  //     inconsistency (deriveBenLeahTrackStatus would read it as shipped).
  const wasWontFix = currentLabels.includes('status:wontfix');
  const movingToWontFix = selection === 'wont_fix';
  const stateFields = movingToWontFix
    ? { state: 'closed' as const, state_reason: 'not_planned' as const }
    : wasWontFix
      ? { state: 'open' as const }
      : {};

  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      headers: {
        ...githubIssuesHeaders(token),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ labels, ...stateFields }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue label update failed (${res.status}): ${text.slice(0, 400)}`);
  }
}

export { BEN_LEAH_INITIAL_WORKFLOW_LABEL };
