import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { githubIssuesHeaders, githubIssuesRepo, githubIssuesToken } from '@/lib/admin/github-issues-config';
import {
  BEN_LEAH_INITIAL_WORKFLOW_LABEL,
  ensureBenLeahGitHubLabels,
} from '@/lib/admin/github-issues-workflow';

export type FeedbackKind = 'bug' | 'change' | 'addition';
export type FeedbackPriority = 'normal' | 'high' | 'urgent';

export interface FeedbackAttachment {
  name: string;
  size: number;
  type: string;
  url?: string;
  note?: string;
}

export interface FeedbackIssueInput {
  reporter: string;
  kind: FeedbackKind;
  category: string;
  priority: FeedbackPriority;
  title: string;
  pageUrl: string;
  signalUrl: string;
  summary: string;
  expected: string;
  actual: string;
  steps: string;
  impact: string;
  attachments: FeedbackAttachment[];
}

export interface GitHubIssueResult {
  number: number;
  html_url: string;
}

const KIND_LABEL: Record<FeedbackKind, string> = {
  bug: 'Bug',
  change: 'Change',
  addition: 'Addition',
};

function clean(value: FormDataEntryValue | null, maxLength: number): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.trim().slice(0, maxLength).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function parseFeedbackForm(formData: FormData): Omit<FeedbackIssueInput, 'attachments'> {
  const kind = clean(formData.get('kind'), 32);
  const priority = clean(formData.get('priority'), 32);
  return {
    reporter: clean(formData.get('reporter'), 80) || 'Ben + Leah',
    kind: kind === 'bug' || kind === 'change' || kind === 'addition' ? kind : 'bug',
    category: clean(formData.get('category'), 80) || 'Uncategorized',
    priority: priority === 'high' || priority === 'urgent' ? priority : 'normal',
    title: clean(formData.get('title'), 180),
    pageUrl: clean(formData.get('pageUrl'), 500),
    signalUrl: clean(formData.get('signalUrl'), 500),
    summary: clean(formData.get('summary'), 8000),
    expected: clean(formData.get('expected'), 4000),
    actual: clean(formData.get('actual'), 4000),
    steps: clean(formData.get('steps'), 8000),
    impact: clean(formData.get('impact'), 4000),
  };
}

export function validateFeedback(input: Omit<FeedbackIssueInput, 'attachments'>): string | null {
  if (input.title.length < 8) return 'Give this a clear title with at least 8 characters.';
  if (input.summary.length < 30) return 'Add more detail so the issue is actionable.';
  if (input.kind === 'bug' && input.actual.length < 10) return 'For bugs, describe what actually happened.';
  return null;
}

export function buildFeedbackIssueBody(input: FeedbackIssueInput): string {
  const attachmentLines = input.attachments.length
    ? input.attachments.map((a) => {
        const sizeKb = Math.round(a.size / 1024);
        if (a.url) return `- [${a.name}](${a.url}) (${sizeKb} KB, ${a.type || 'unknown type'})`;
        return `- ${a.name} (${sizeKb} KB, ${a.type || 'unknown type'})${a.note ? `: ${a.note}` : ''}`;
      }).join('\n')
    : 'None attached.';

  return [
    `## ${KIND_LABEL[input.kind]} Request`,
    '',
    `**Reporter:** ${input.reporter}`,
    `**Category:** ${input.category}`,
    `**Priority:** ${input.priority}`,
    `**Page / URL:** ${input.pageUrl || 'Not provided'}`,
    `**Signal URL:** ${input.signalUrl || 'Not provided'}`,
    '',
    '## Summary',
    input.summary,
    '',
    '## Expected',
    input.expected || 'Not provided.',
    '',
    '## Actual',
    input.actual || 'Not provided.',
    '',
    '## Steps / Context',
    input.steps || 'Not provided.',
    '',
    '## Impact',
    input.impact || 'Not provided.',
    '',
    '## Screenshots',
    attachmentLines,
    '',
    '---',
    'Submitted from Helm Bridge Ben + Leah.',
  ].join('\n');
}

function issueToken(): string | null {
  return githubIssuesToken();
}

function issueRepo(): { owner: string; repo: string } {
  const { owner, repo } = githubIssuesRepo();
  return { owner, repo };
}

export async function uploadFeedbackAttachments(files: File[]): Promise<FeedbackAttachment[]> {
  const bucket = process.env.HELM_BRIDGE_FEEDBACK_BUCKET?.trim();
  if (!bucket) {
    return files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      note: 'Image upload storage is not configured. The selected filename was captured with the issue.',
    }));
  }

  const admin = createAdminClient();
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const uploaded: FeedbackAttachment[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_').slice(0, 120) || 'screenshot';
    const path = `ben-leah/${now}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await admin.storage.from(bucket).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) {
      uploaded.push({ name: file.name, size: file.size, type: file.type, note: `Upload failed: ${error.message}` });
      continue;
    }
    const { data } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365);
    uploaded.push({ name: file.name, size: file.size, type: file.type, url: data?.signedUrl ?? undefined });
  }
  return uploaded;
}

export async function createGitHubFeedbackIssue(input: FeedbackIssueInput): Promise<GitHubIssueResult> {
  const token = issueToken();
  if (!token) {
    throw new Error('GitHub issue token is not configured. Set GITHUB_ISSUES_TOKEN or GITHUB_TOKEN.');
  }
  await ensureBenLeahGitHubLabels();

  const { owner, repo } = issueRepo();
  const headers = {
    ...githubIssuesHeaders(token),
    'content-type': 'application/json',
  };
  const payload = {
    title: `[Ben + Leah] ${KIND_LABEL[input.kind]}: ${input.title}`,
    body: buildFeedbackIssueBody(input),
    labels: [
      'ben-leah',
      BEN_LEAH_INITIAL_WORKFLOW_LABEL,
      `kind:${input.kind}`,
      `priority:${input.priority}`,
      `category:${input.category}`,
    ],
  };

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status === 422) {
    const retry = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: payload.title,
        body: payload.body,
        labels: ['ben-leah', BEN_LEAH_INITIAL_WORKFLOW_LABEL],
      }),
    });
    if (!retry.ok) {
      const text = await retry.text();
      throw new Error(`GitHub issue create failed (${retry.status}): ${text.slice(0, 500)}`);
    }
    return (await retry.json()) as GitHubIssueResult;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue create failed (${res.status}): ${text.slice(0, 500)}`);
  }

  return (await res.json()) as GitHubIssueResult;
}
