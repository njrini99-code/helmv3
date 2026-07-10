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
  color: '16A34A',
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

  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      headers: {
        ...githubIssuesHeaders(token),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ labels }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue label update failed (${res.status}): ${text.slice(0, 400)}`);
  }
}

export { BEN_LEAH_INITIAL_WORKFLOW_LABEL };
