'use server';

import {
  createGitHubFeedbackIssue,
  parseFeedbackForm,
  uploadFeedbackAttachments,
  validateFeedback,
  type GitHubIssueResult,
} from '@/lib/admin/github-feedback';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { describeError } from '@/lib/utils/describe-error';

export interface BenLeahSubmitState {
  ok: boolean;
  message: string;
  issue?: GitHubIssueResult;
}

const MAX_FILES = 6;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function selectedImages(formData: FormData): { files: File[]; error: string | null } {
  const raw = formData.getAll('screenshots').filter((value): value is File => value instanceof File && value.size > 0);
  if (raw.length > MAX_FILES) return { files: [], error: `Attach up to ${MAX_FILES} images per submission.` };
  for (const file of raw) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return { files: [], error: `${file.name} is not a supported image type.` };
    if (file.size > MAX_FILE_BYTES) return { files: [], error: `${file.name} is larger than 8 MB.` };
  }
  return { files: raw, error: null };
}

export async function submitBenLeahFeedback(
  _prev: BenLeahSubmitState,
  formData: FormData,
): Promise<BenLeahSubmitState> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return {
      ok: false,
      message: describeError(err) === 'Unauthorized'
        ? 'Your session expired. Sign in again and retry.'
        : 'You do not have permission to submit from Helm Bridge.',
    };
  }

  const parsed = parseFeedbackForm(formData);
  const validationError = validateFeedback(parsed);
  if (validationError) return { ok: false, message: validationError };

  const images = selectedImages(formData);
  if (images.error) return { ok: false, message: images.error };

  try {
    const attachments = await uploadFeedbackAttachments(images.files);
    const created = await createGitHubFeedbackIssue({ ...parsed, attachments });
    // No revalidatePath — this page has no server-fetched data to refresh, and
    // revalidating during the action response races the client (see golf.ts
    // save-round comment on "unexpected response from the server").
    const issue: GitHubIssueResult = { number: created.number, html_url: created.html_url };
    return { ok: true, message: `Submitted to GitHub issue #${issue.number}.`, issue };
  } catch (err) {
    return {
      ok: false,
      message: `Submission could not create a GitHub issue: ${describeError(err)}`,
    };
  }
}
