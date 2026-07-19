/**
 * #157 (round 2 mustFix) — TeePickerDrawer is a second, independent
 * course-name renderer (course list rows + the "Choose a tee at {course}"
 * header) that formatCourseName had NOT reached, so a shouty/all-lowercase
 * name looked normalized everywhere else in the New Round flow except here.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/sonner', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/app/golf/actions/course-library', () => ({
  listCourses: vi.fn(async () => [
    { id: 'c1', name: 'AUGUSTA NATIONAL GOLF CLUB', city: 'Augusta', state: 'GA', image_url: null, normalized_name: 'augusta national golf club' },
  ]),
  getCourseDetail: vi.fn(async () => ({ tees: [] })),
  getTeeRoundDefaults: vi.fn(async () => null),
}));

import { TeePickerDrawer } from '@/components/golf/courses/TeePickerDrawer';

describe('TeePickerDrawer — casing normalization (#157)', () => {
  it('title-cases a shouty course name in the course list row', async () => {
    render(<TeePickerDrawer open onOpenChange={() => {}} onPick={() => {}} />);
    expect(await screen.findByText('Augusta National Golf Club')).toBeInTheDocument();
    expect(screen.queryByText('AUGUSTA NATIONAL GOLF CLUB')).not.toBeInTheDocument();
  });

  it('title-cases the course name in the "choose a tee" header after selecting a course', async () => {
    render(<TeePickerDrawer open onOpenChange={() => {}} onPick={() => {}} />);
    const row = await screen.findByText('Augusta National Golf Club');
    fireEvent.click(row.closest('button')!);
    expect(await screen.findAllByText('Augusta National Golf Club')).not.toHaveLength(0);
  });
});
