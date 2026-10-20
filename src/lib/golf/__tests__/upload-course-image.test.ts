/**
 * uploadCourseImage returns the object key it wrote, and discardCourseImageUpload
 * removes that key from the course-images bucket — best-effort, never throwing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  from: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => storage.createClient() }));

import { discardCourseImageUpload, uploadCourseImage } from '../upload-course-image';
import { COURSE_IMAGE_BUCKET } from '@/lib/golf/course-library';

describe('upload-course-image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.from.mockReturnValue({ upload: storage.upload, remove: storage.remove, getPublicUrl: storage.getPublicUrl });
    storage.createClient.mockReturnValue({ storage: { from: storage.from } });
    storage.upload.mockResolvedValue({ data: {}, error: null });
    storage.remove.mockResolvedValue({ data: [], error: null });
    storage.getPublicUrl.mockImplementation((p: string) => ({ data: { publicUrl: `https://x/storage/v1/object/public/${COURSE_IMAGE_BUCKET}/${p}` } }));
  });

  it('returns the uploaded object path alongside its public URL', async () => {
    const res = await uploadCourseImage('c1', new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.path).toMatch(/^courses\/c1\/[0-9a-f-]+\.jpg$/);
    expect(storage.upload).toHaveBeenCalledWith(res.path, expect.any(File), expect.objectContaining({ upsert: false }));
    expect(res.url).toBe(`https://x/storage/v1/object/public/${COURSE_IMAGE_BUCKET}/${res.path}`);
  });

  it('discardCourseImageUpload removes exactly that path from the course-images bucket', async () => {
    await discardCourseImageUpload('courses/c1/a.jpg');
    expect(storage.from).toHaveBeenCalledWith(COURSE_IMAGE_BUCKET);
    expect(storage.remove).toHaveBeenCalledWith(['courses/c1/a.jpg']);
  });

  it('never throws: not on a storage error, a rejected call, or a client that fails to build', async () => {
    storage.remove.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(discardCourseImageUpload('courses/c1/a.jpg')).resolves.toBeUndefined();

    storage.remove.mockRejectedValueOnce(new Error('network'));
    await expect(discardCourseImageUpload('courses/c1/a.jpg')).resolves.toBeUndefined();

    storage.createClient.mockImplementationOnce(() => { throw new Error('no env'); });
    await expect(discardCourseImageUpload('courses/c1/a.jpg')).resolves.toBeUndefined();
  });

  it('does nothing for an empty path', async () => {
    await discardCourseImageUpload('');
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
