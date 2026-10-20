/**
 * attachCourseImage (the new-round flow's best-effort course photo): when the
 * server refuses the save, the object it just uploaded to the public
 * course-images bucket is removed, so a refused save never leaves an orphan.
 * A thrown or lost response keeps the object, because the save may have landed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCourseDetail: vi.fn(),
  setCourseImageUrl: vi.fn(),
  uploadCourseImage: vi.fn(),
  discardCourseImageUpload: vi.fn(async () => {}),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/round-submit', () => ({ submitGolfRoundComprehensive: vi.fn() }));
vi.mock('@/app/golf/actions/round-partial', () => ({ savePartialRound: vi.fn(), deleteInProgressRound: vi.fn() }));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({ getPlayerQualifiers: vi.fn(), getNextQualifierRoundNumber: vi.fn() }));
vi.mock('@/app/golf/actions/saved-courses', () => ({
  getPlayerSavedCourses: vi.fn(),
  getRecentCoursesForPlayer: vi.fn(),
  savePlayerCourse: vi.fn(),
  touchSavedCourse: vi.fn(),
}));
vi.mock('@/app/golf/actions/course-library', () => ({
  contributeCourseFromRound: vi.fn(),
  getCourseDetail: (...a: unknown[]) => mocks.getCourseDetail(...a),
  setCourseImageUrl: (...a: unknown[]) => mocks.setCourseImageUrl(...a),
}));
vi.mock('@/lib/golf/upload-course-image', () => ({
  uploadCourseImage: (...a: unknown[]) => mocks.uploadCourseImage(...a),
  discardCourseImageUpload: (...a: unknown[]) => mocks.discardCourseImageUpload(...(a as [])),
}));
vi.mock('@/app/golf/actions/round-drafts', () => ({ checkRoundStaleness: vi.fn() }));
vi.mock('@/app/golf/actions/round-type', () => ({ updateRoundType: vi.fn() }));

import { attachCourseImage } from '../use-new-round-session';

const file = new File(['photo'], 'course.jpg', { type: 'image/jpeg' });

describe('attachCourseImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCourseDetail.mockResolvedValue({ course: { id: 'c1', image_url: null }, tees: [] });
    mocks.uploadCourseImage.mockResolvedValue({ ok: true, url: 'https://x/storage/v1/object/public/course-images/courses/c1/a.jpg', path: 'courses/c1/a.jpg' });
  });

  it('removes the uploaded object when the save is refused (a player before golf_set_course_image is applied)', async () => {
    mocks.setCourseImageUrl.mockResolvedValue({ success: false, error: 'Only coaches can manage the course library' });
    await attachCourseImage('c1', file);
    expect(mocks.setCourseImageUrl).toHaveBeenCalledWith('c1', 'https://x/storage/v1/object/public/course-images/courses/c1/a.jpg');
    expect(mocks.discardCourseImageUpload).toHaveBeenCalledWith('courses/c1/a.jpg');
  });

  it('keeps the object when the save lands', async () => {
    mocks.setCourseImageUrl.mockResolvedValue({ success: true, data: { imageUrl: 'u' } });
    await attachCourseImage('c1', file);
    expect(mocks.discardCourseImageUpload).not.toHaveBeenCalled();
  });

  it('keeps the object when the save throws (it may have landed), and never throws itself', async () => {
    mocks.setCourseImageUrl.mockRejectedValue(new Error('network lost'));
    await expect(attachCourseImage('c1', file)).resolves.toBeUndefined();
    expect(mocks.discardCourseImageUpload).not.toHaveBeenCalled();
  });

  it('uploads nothing when the course already has a photo, and discards nothing when the upload fails', async () => {
    mocks.getCourseDetail.mockResolvedValueOnce({ course: { id: 'c1', image_url: 'https://existing' }, tees: [] });
    await attachCourseImage('c1', file);
    expect(mocks.uploadCourseImage).not.toHaveBeenCalled();

    mocks.uploadCourseImage.mockResolvedValueOnce({ ok: false, error: 'Upload failed. Please try again.' });
    await attachCourseImage('c1', file);
    expect(mocks.setCourseImageUrl).not.toHaveBeenCalled();
    expect(mocks.discardCourseImageUpload).not.toHaveBeenCalled();
  });
});
