/**
 * Course library long tail (screen walk-through 2026-09-24): "More courses"
 * rendered 65 photo cards (~21,500px on a phone), and a city with a trailing
 * space printed "Lexington , KY".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CourseCard } from './CourseCard';
import type { GolfCourse } from '@/lib/types/golf-course';

vi.mock('./CourseImage', () => ({
  CourseImage: () => <span data-testid="course-image" />,
  formatCourseName: (n: string) => n,
}));

const course = {
  id: 'c1',
  name: 'Big Blue Course',
  city: 'Lexington ',
  state: ' KY',
  country: null,
  course_rating: null,
  slope_rating: null,
  default_tee_name: null,
  default_tee_color: null,
  total_yardage: null,
  total_par: null,
  created_by: null,
  is_public: true,
  created_at: null,
  updated_at: null,
} as GolfCourse;

describe('CourseCard', () => {
  it('trims city and state before joining the location', () => {
    render(<CourseCard course={course} />);
    expect(screen.getByText('Lexington, KY')).toBeInTheDocument();
  });

  it('row variant: one tap target with name, location and tee count', () => {
    const onSelect = vi.fn();
    render(<CourseCard variant="row" course={course} teeCount={1} onSelect={onSelect} />);
    const button = screen.getByRole('button', { name: 'Open Big Blue Course' });
    expect(button).toHaveClass('min-h-[64px]');
    expect(screen.getByText('Lexington, KY')).toBeInTheDocument();
    expect(screen.getByText(/1 tee/)).toBeInTheDocument();
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith('c1');
  });
});
