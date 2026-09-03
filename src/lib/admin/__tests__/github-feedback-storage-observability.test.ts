import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `uploadFeedbackAttachments` — the Storage WIRING pass (Phase 2, Track B
 * follow-up). Two `storage.from(` sites in one loop:
 *
 *   upload()         — its failure is surfaced ONLY as a `note` string on the
 *                      returned attachment; nothing else records it.
 *   createSignedUrl() — had NO error binding at all before this pass. A
 *                      failure uploaded the object and then attached an issue
 *                      with no link: a silent half-failure with no signal.
 *
 * Both are proven here in both directions — the returned
 * `FeedbackAttachment[]` is byte-for-byte what it was, and the observer is
 * called with the right feature/action/operation/bucketClass.
 *
 * PRIVACY: the object key embeds the uploader's own filename
 * (`ben-leah/<ts>/<uuid>-<safeName>`), so the last test asserts no key or
 * filename reaches the observer.
 */

const upload = vi.fn();
const createSignedUrl = vi.fn();
const observeStorageResult = vi.fn((_input: unknown) => ({ observed: true, bucket: null, envelope: null }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: () => ({ upload, createSignedUrl }) } }),
}));
vi.mock('@/lib/observability/supabase/observe-storage', () => ({ observeStorageResult }));
vi.mock('@/lib/admin/github-issues-config', () => ({
  githubIssuesHeaders: () => ({}),
  githubIssuesRepo: () => ({ owner: 'o', repo: 'r' }),
  githubIssuesToken: () => 'token',
}));
vi.mock('@/lib/admin/github-issues-workflow', () => ({
  BEN_LEAH_INITIAL_WORKFLOW_LABEL: 'label',
  ensureBenLeahGitHubLabels: vi.fn(async () => {}),
}));

const BUCKET = 'bridge-feedback';

function file(name = 'screenshot.png'): File {
  return new File(['x'], name, { type: 'image/png' });
}

async function uploadOne(name?: string) {
  const mod = await import('@/lib/admin/github-feedback');
  return mod.uploadFeedbackAttachments([file(name)]);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HELM_BRIDGE_FEEDBACK_BUCKET = BUCKET;
  upload.mockResolvedValue({ error: null });
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/abc' }, error: null });
});

describe('uploadFeedbackAttachments — return value is unchanged by the observers', () => {
  it('success path still returns the attachment carrying the signed url', async () => {
    await expect(uploadOne()).resolves.toEqual([
      { name: 'screenshot.png', size: 1, type: 'image/png', url: 'https://signed.example/abc' },
    ]);
  });

  it('upload failure still returns the note-carrying attachment with no url', async () => {
    upload.mockResolvedValue({ error: { code: 'EntityTooLarge', message: 'too big' } });
    await expect(uploadOne()).resolves.toEqual([
      { name: 'screenshot.png', size: 1, type: 'image/png', note: 'Upload failed: too big' },
    ]);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('a signing failure still returns url: undefined, exactly as before', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { code: 'InternalError', message: 'boom' } });
    await expect(uploadOne()).resolves.toEqual([
      { name: 'screenshot.png', size: 1, type: 'image/png', url: undefined },
    ]);
  });

  it('an unset bucket still short-circuits before any storage call or observation', async () => {
    delete process.env.HELM_BRIDGE_FEEDBACK_BUCKET;
    const result = await uploadOne();
    expect(result[0]?.note).toContain('not configured');
    expect(upload).not.toHaveBeenCalled();
    expect(observeStorageResult).not.toHaveBeenCalled();
  });
});

describe('uploadFeedbackAttachments — the observers receive the right context', () => {
  it('observes the upload as operation:upload with a safe bucketClass', async () => {
    upload.mockResolvedValue({ error: { code: 'InternalError', message: 'boom' } });
    await uploadOne();

    expect(observeStorageResult).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'upload',
        feature: 'admin_bridge_feedback',
        action: 'upload_feedback_screenshot',
        bucketClass: `${BUCKET}/feedback_screenshot`,
        accessDeniedOnOwnPath: true,
      }),
    );
  });

  it('observes the signing step separately, as operation:download', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { code: 'InternalError', message: 'boom' } });
    await uploadOne();

    expect(observeStorageResult).toHaveBeenCalledTimes(2);
    expect(observeStorageResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: 'download',
        action: 'sign_feedback_screenshot_url',
        bucketClass: `${BUCKET}/feedback_screenshot`,
      }),
    );
  });

  it('observes both steps on the fully successful path too, each with a null error (a no-op)', async () => {
    await uploadOne();
    expect(observeStorageResult).toHaveBeenCalledTimes(2);
    for (const call of observeStorageResult.mock.calls) {
      expect((call[0] as unknown as { error: unknown }).error).toBeNull();
    }
  });

  it('never hands an observer the object key or the uploader filename', async () => {
    upload.mockResolvedValue({ error: { code: 'InternalError', message: 'boom' } });
    await uploadOne('coach-medical-note-2026.png');

    const payloads = JSON.stringify(observeStorageResult.mock.calls.map((c) => c[0]));
    expect(payloads).not.toContain('coach-medical-note-2026');
    expect(payloads).not.toContain('ben-leah/');
  });
});
