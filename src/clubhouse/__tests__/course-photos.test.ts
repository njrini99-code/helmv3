import { describe, expect, it } from 'vitest';
import { DEFAULT_COURSE_IMAGES, resolveDefaultCourseImage } from '@/lib/golf/course-image-assets';
import { coursePhotos } from '../screens/rounds/setup/CoursePicker';
import type { ChSetupCourse } from '../screens/rounds/setup/shape';

const course = (id: string, name: string, image: string | null = null): ChSetupCourse => ({ id, name, place: null, par: 72, teeCount: null, group: 'library', lastPlayed: null, image });

describe('course picker photos', () => {
  it("a course's own photo always wins", () => {
    expect(coursePhotos([course('a', 'Alpha', '/mine.webp')])).toEqual(['/mine.webp']);
  });

  it('no default scene repeats within six cards of itself (two rows of three), and the same list always gets the same photos', () => {
    // Twelve names that all hash to one scene would repeat without the rule.
    const scene = resolveDefaultCourseImage('Forest Creek');
    const names: string[] = [];
    for (let i = 0; names.length < 12 && i < 5000; i++) if (resolveDefaultCourseImage(`Course ${i}`) === scene) names.push(`Course ${i}`);
    const list = names.map((n, i) => course(String(i), n));
    const photos = coursePhotos(list);
    for (let i = 0; i < photos.length; i++) for (let j = Math.max(0, i - 6); j < i; j++) expect(photos[i]).not.toBe(photos[j]);
    expect(photos.every((p) => DEFAULT_COURSE_IMAGES.includes(p))).toBe(true);
    expect(coursePhotos(list)).toEqual(photos);
  });
});
