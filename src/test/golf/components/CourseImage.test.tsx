/**
 * CourseImage regression guards.
 *
 * #163 — every course card must eventually show SOMETHING (a real photo or
 * the designed accent-gradient placeholder), never a permanent blank box.
 * This pins the three-tier onError cascade: uploaded photo -> bundled photo
 * -> gradient-with-initial, firing the <img> error event at each tier.
 *
 * #157 — formatCourseName normalizes ALL CAPS / all-lowercase course names
 * for display while leaving already-mixed-case tokens (acronyms, surnames)
 * alone.
 *
 * #32 — a per-image shimmer skeleton covers the slot until the photo's
 * `load` event fires, instead of a flat, static placeholder box.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CourseImage, formatCourseName } from '@/components/golf/courses/CourseImage';

describe('formatCourseName', () => {
  it('title-cases an all-lowercase name', () => {
    expect(formatCourseName('pebble beach golf links')).toBe('Pebble Beach Golf Links');
  });

  it('title-cases an ALL CAPS name', () => {
    expect(formatCourseName('AUGUSTA NATIONAL GOLF CLUB')).toBe('Augusta National Golf Club');
  });

  it('leaves already mixed-case names untouched', () => {
    expect(formatCourseName('Bethpage Black')).toBe('Bethpage Black');
    expect(formatCourseName('TPC Sawgrass')).toBe('TPC Sawgrass');
  });

  it('preserves short all-caps acronyms', () => {
    expect(formatCourseName('RIVERBEND GC')).toBe('Riverbend GC');
  });

  it('lowercases minor words except the first', () => {
    expect(formatCourseName('THE LINKS AT ASHEVILLE')).toBe('The Links at Asheville');
  });
});

describe('CourseImage — broken-image fallback cascade', () => {
  it('degrades uploaded -> bundled -> gradient, never leaving a blank box', () => {
    render(
      <CourseImage
        name="Test Course"
        imageUrl="https://example.supabase.co/storage/v1/object/public/course-photos/broken.jpg"
      />,
    );

    // Tier 1: the uploaded photo is attempted first.
    const img1 = screen.getByAltText('Test Course course photo') as HTMLImageElement;
    expect(img1).toBeInTheDocument();

    // Simulate the uploaded photo 404ing — falls through to the bundled tier.
    fireEvent.error(img1);
    const img2 = screen.getByAltText('Test Course course photo') as HTMLImageElement;
    expect(img2.src).not.toBe(img1.src);

    // Simulate the bundled asset ALSO failing — falls through to the
    // gradient-with-initial placeholder, which must always render (never a
    // permanently blank/broken box).
    fireEvent.error(img2);
    expect(screen.queryByAltText('Test Course course photo')).not.toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('shows a shimmer skeleton until the photo finishes loading', () => {
    const { container } = render(<CourseImage name="Pebble Beach" imageUrl={null} />);
    // Skeleton block is present before the image's load event fires.
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    const img = screen.getByAltText('Pebble Beach course photo');
    expect(img.className).toContain('opacity-0');
    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');
  });
});
