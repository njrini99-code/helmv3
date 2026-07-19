/**
 * CourseCard — #157 casing regression guard: both the "featured" (image-forward
 * hero) and "standard" (compact grid) variants must render the shared
 * formatCourseName()-normalized name, not the raw (possibly ALL CAPS /
 * all-lowercase) course.name.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CourseCard } from '@/components/golf/courses/CourseCard';
import type { GolfCourse } from '@/lib/types/golf-course';

const shoutyCourse = {
  id: 'course-1',
  name: 'AUGUSTA NATIONAL GOLF CLUB',
  city: 'Augusta',
  state: 'GA',
  image_url: null,
  normalized_name: 'augusta national golf club',
} as unknown as GolfCourse;

describe('CourseCard — casing normalization', () => {
  it('title-cases a shouty course name on the featured variant', () => {
    render(<CourseCard course={shoutyCourse} variant="featured" onSelect={vi.fn()} />);
    expect(screen.getByText('Augusta National Golf Club')).toBeInTheDocument();
    expect(screen.queryByText('AUGUSTA NATIONAL GOLF CLUB')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Augusta National Golf Club' })).toBeInTheDocument();
  });

  it('title-cases a shouty course name on the standard variant', () => {
    render(<CourseCard course={shoutyCourse} variant="standard" onSelect={vi.fn()} />);
    expect(screen.getByText('Augusta National Golf Club')).toBeInTheDocument();
  });
});
