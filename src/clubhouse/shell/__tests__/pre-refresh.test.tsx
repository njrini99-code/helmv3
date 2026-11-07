import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClubhouseMarker } from '../context';
import { CoachHelmTabs } from '../../screens/coachhelm/chat/SubTabs';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));
afterEach(cleanup);

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

/** With every redesign flag off, Clubhouse keeps its look from before Nov 4 (owner, 2026-11-07). The browser proof is the before and after diff in the PR. */
describe('Clubhouse with clubhouse_refresh_v1 off', () => {
  it('the live layout always says which way the flag is, so the root can tell off from unset', () => {
    expect(src('src/app/golf/(dashboard)/layout.tsx')).toContain('refresh: refreshEnabled()');
    expect(src('src/clubhouse/shell/ClubhouseFrame.tsx')).toContain('preRefresh={shell.refresh === false}');
    expect(src('src/clubhouse/shell/ClubhouseFrame.tsx')).toContain("data-ch-pre-refresh={preRefresh ? '' : undefined}");
  });

  it('holds the looks the redesign changed in shared CSS', () => {
    const css = src('src/clubhouse/styles/pre-refresh.css');
    // The tight page head is the redesign's, except on the pages that were tight before it.
    expect(src('src/clubhouse/styles/shell.css')).toContain(".ch-root:not([data-ch-pre-refresh]) main[data-canopy] [data-canopy-head='tight']");
    expect(src('src/clubhouse/screens/roster/TeamRoster.tsx')).toContain('data-canopy-tight-always');
    expect(css).toMatch(/\.ch-es--page > \.ch-es__copy \{\s*padding: 32px 0 24px;/);
    expect(css).toMatch(/\.ch-empty \{\s*justify-items: start;/);
    expect(css).toContain('--ch-track-avatar: 0.04em');
    expect(src('src/clubhouse/styles/base.css')).toMatch(/\.ch-root:not\(\[data-ch-pre-refresh\]\) \.ch-num/);
  });

  it('CoachHelm keeps its small well; the large flat one comes with the Team board', () => {
    const tabs = (team: boolean) =>
      render(
        <ClubhouseMarker {...{ role: 'coach' as const }} helmViews={{ team }}>
          <CoachHelmTabs active="board" />
        </ClubhouseMarker>,
      );
    tabs(false);
    expect(screen.getByRole('radiogroup').className).not.toContain('ch-seg--lg');
    cleanup();
    tabs(true);
    expect(screen.getByRole('radiogroup').className).toContain('ch-seg--lg');
  });
});
