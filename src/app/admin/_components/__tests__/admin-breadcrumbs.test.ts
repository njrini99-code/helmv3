import { describe, it, expect } from 'vitest';
import { computeBreadcrumbs } from '@/app/admin/_components/admin-breadcrumbs';

describe('computeBreadcrumbs', () => {
  it('names the tab that owns the path, by longest match', () => {
    expect(computeBreadcrumbs('/admin/clubhouse/codes/70603')).toEqual([
      { label: 'Bridge', href: '/admin' },
      { label: 'Codes', href: '/admin/clubhouse/codes' },
      { label: '70603', href: undefined },
    ]);
    expect(computeBreadcrumbs('/admin/clubhouse/P007').map((c) => c.label)).toEqual(['Bridge', 'Pages', 'P007']);
    expect(computeBreadcrumbs('/admin/clubhouse')).toEqual([
      { label: 'Bridge', href: '/admin' },
      { label: 'Pages', href: undefined },
    ]);
  });

  // Regression: every intermediate crumb used to link to the FULL current
  // path, so on a user's View as page the "Detail" crumb linked to the page you
  // were already on instead of back to the user.
  it('links each intermediate crumb to its own level, not to the current page', () => {
    const id = '3f1c2b9e-7a41-4c2d-9f00-1234567890ab';
    expect(computeBreadcrumbs(`/admin/users/${id}/view-as`)).toEqual([
      { label: 'Bridge', href: '/admin' },
      { label: 'Users & Teams', href: '/admin/users' },
      { label: 'Detail', href: `/admin/users/${id}` },
      { label: 'View as', href: undefined },
    ]);
  });

  it('falls back to the first segment when no tab owns the path', () => {
    expect(computeBreadcrumbs('/admin/thread/user/42')).toEqual([
      { label: 'Bridge', href: '/admin' },
      { label: 'Thread' },
    ]);
    expect(computeBreadcrumbs('/admin')).toEqual([
      { label: 'Bridge', href: '/admin' },
      { label: 'Pulse', href: undefined },
    ]);
  });
});
