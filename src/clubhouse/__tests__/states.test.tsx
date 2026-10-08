import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Users } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The shared state layer (states audit, 2026-10-08): the section empty is a flush Ledger line, the page empty and the
 * route error share one anatomy, a notice is flush with its action in its own slot, several failed parts are told once
 * with one Try again (CH-1209), skeleton blocks are ruled rather than filled (CH-1609), and titles never end in a full
 * stop. The pixels are checked in a browser; these pin the structure and the rules the CSS hangs on.
 */

const refreshSpy = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshSpy, push: vi.fn() }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));

import { EmptyState, SkelLine, SkelRows, SkelRule, Skeleton, stateTitle } from '../ui/States';
import { InlineNotice, PageNotice, RouteErrorView } from '../ui/Notices';
import { PageRefreshNotice, RefreshNotice } from '../ui/RefreshNotice';

const root = join(process.cwd(), 'src/clubhouse');
const shellCss = readFileSync(join(root, 'styles/shell.css'), 'utf8');
/** One rule's declarations, by its exact selector. */
const rule = (selector: string) => {
  const at = shellCss.indexOf(`${selector} {`);
  expect(at, `${selector} is in shell.css`).toBeGreaterThan(-1);
  return shellCss.slice(at, shellCss.indexOf('}', at));
};

afterEach(() => refreshSpy.mockReset());

describe('Titles are headlines', () => {
  it('one trailing full stop is dropped; an ellipsis and a bare title are kept', () => {
    expect(stateTitle('No trips planned.')).toBe('No trips planned');
    expect(stateTitle('Still saving...')).toBe('Still saving...');
    expect(stateTitle('No players yet')).toBe('No players yet');
  });

  it('the shared state files write their own copy with curly apostrophes', () => {
    for (const file of ['ui/States.tsx', 'ui/Notices.tsx', 'ui/RefreshNotice.tsx']) {
      const src = readFileSync(join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, file).not.toMatch(/[A-Za-z]'[A-Za-z]/);
      expect(src, file).not.toContain('&apos;');
    }
  });
});

describe('The section empty is a line on the Ledger', () => {
  it('flush and left-aligned: no well, the glyph beside the title, the title without its full stop', () => {
    const { container } = render(<EmptyState code="CH-10301" icon={Users} title="No trips planned." body="Plan a trip and players see the itinerary here." />);
    const el = container.querySelector('[data-ch-code="CH-10301"]')!;
    expect(el.className).toBe('ch-empty ch-empty--icon');
    expect(el.querySelector('.ch-well-soft')).toBeNull();
    expect(el.querySelector(':scope > .ch-empty__icon > svg')).not.toBeNull();
    expect(screen.getByText('No trips planned').className).toBe('ch-empty__title');
    expect(rule('.ch-empty')).toMatch(/justify-items: start;[\s\S]*text-align: left;/);
    expect(rule('.ch-empty__icon')).toContain('color: var(--ch-ledger-ink);');
  });

  it('without a glyph it is one column, and compact only tightens it', () => {
    const { container } = render(<EmptyState compact code="CH-10302" title="Nothing new." body="Posts show here as they happen." />);
    expect(container.querySelector('[data-ch-code="CH-10302"]')!.className).toBe('ch-empty ch-empty--compact');
  });
});

describe('The page empty and the route error share one anatomy', () => {
  it('the page empty names its title in the forest ink, and in the Ledger it sits under the head with measured air', () => {
    render(<EmptyState size="page" code="CH-3301" icon={Users} title="No players yet." body="Share your team code." />);
    expect(screen.getByRole('heading', { level: 2, name: 'No players yet' }).className).toBe('ch-empty-page__title');
    expect(rule('.ch-empty-page__title')).toContain('color: var(--ch-ledger-ink);');
    expect(rule("  [data-ui='clubhouse'] main[data-canopy] .ch-empty-page")).toMatch(/min-height: 0;[\s\S]*padding-block: 72px 88px;/);
  });

  it('CH-1206 the route error is the page empty in the danger tone: no card, Try again first, the reference as a caption', () => {
    render(<RouteErrorView kind="unknown" isRetrying={false} retryCount={0} onRetry={vi.fn()} homePath="/golf" digest="1234567890" />);
    const view = screen.getByRole('alert');
    expect(view.getAttribute('data-ch-code')).toBe('CH-1206');
    expect(view.querySelector('.ch-sheet, .ch-notyet__card')).toBeNull();
    expect(view.querySelector('.ch-empty-page.ch-empty-page--danger .ch-empty-page__ic svg')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Something went wrong on this page');
    const actions = view.querySelector('.ch-empty-page__a')!;
    expect([...actions.children].map((a) => a.textContent)).toEqual(['Try again', 'Back to Home']);
    expect(within(view).getByRole('link', { name: 'Back to Home' }).querySelector('svg')).not.toBeNull();
    expect(view.querySelector('.ch-empty-page__ref')!.textContent).toBe('Reference 1234567890');
  });

  it('the route error titles carry no full stop', () => {
    for (const kind of ['chunk', 'stale-action', 'transient', 'load', 'unknown'] as const) {
      const { unmount } = render(<RouteErrorView kind={kind} isRetrying={false} retryCount={0} onRetry={vi.fn()} />);
      expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/\.$/);
      unmount();
    }
  });
});

describe('A notice is flush, with its action in its own slot', () => {
  it('the title, the body and Try again; the title without its full stop', async () => {
    const onRetry = vi.fn();
    render(<InlineNotice code="CH-2201" title="This week’s schedule didn’t load." body="Your events are safe." onRetry={onRetry} />);
    const notice = screen.getByRole('alert');
    expect(notice.className).toBe('ch-notice ch-notice--danger');
    expect(notice.querySelector(':scope > .ch-notice__in > .ch-notice__txt > .ch-notice__title')!.textContent).toBe('This week’s schedule didn’t load');
    const act = notice.querySelector(':scope > .ch-notice__in > .ch-notice__act')!;
    await userEvent.click(within(act as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(rule('.ch-notice')).toMatch(/container: ch-notice \/ inline-size;[\s\S]*border-left: 2px solid var\(--ch-notice-rule\);/);
    expect(shellCss).toMatch(/@container ch-notice \(max-width: 40rem\) \{\s*\.ch-notice__in \{\s*grid-template-columns: 16px minmax\(0, 1fr\);/);
  });

  it('covered: the title alone marks the gap, with no body, no button and no second alert', () => {
    render(<RefreshNotice covered code="CH-2202" title="Recent rounds didn’t load." body="Posted rounds are safe." />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Posted rounds are safe.')).toBeNull();
    const el = document.querySelector('[data-ch-code="CH-2202"]')!;
    expect(el.className).toBe('ch-notice ch-notice--danger ch-notice--covered');
    expect(el.textContent).toBe('Recent rounds didn’t load');
  });
});

describe('CH-1209 several failed parts are told once, with one Try again', () => {
  it('one failed part keeps its own notice, so the page notice renders nothing', () => {
    const { container } = render(<PageNotice parts={['the leaderboard']} onRetry={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('names the parts in one sentence, is one alert, and its one Try again retries the page', async () => {
    const onRetry = vi.fn();
    render(<PageNotice parts={['this week’s schedule', 'recent rounds', 'the leaderboard']} onRetry={onRetry} />);
    const notice = screen.getByRole('alert');
    expect(notice.getAttribute('data-ch-code')).toBe('CH-1209');
    expect(notice.querySelector('.ch-notice__title')!.textContent).toBe('Some of this page didn’t load');
    expect(notice.querySelector('.ch-notice__body')!.textContent).toMatch(/^This week’s schedule, recent rounds and the leaderboard didn’t load\. /);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('PageRefreshNotice re-runs the server render, and the covered parts stay quiet', async () => {
    render(
      <>
        <PageRefreshNotice parts={['the roster', 'join requests']} />
        <RefreshNotice covered code="CH-3201" title="The roster didn’t load." body="Your players are safe." />
        <RefreshNotice covered code="CH-3202" title="Join requests didn’t load." body="Requests are safe." />
      </>,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});

describe('CH-1609 skeletons draw bars and rules, not filled cards', () => {
  it('a fluid placeholder from 56px tall is a ruled block; a bar, a fixed-width tile and shape="solid" stay filled', () => {
    const { container } = render(
      <>
        <Skeleton width="100%" height={236} radius={20} />
        <Skeleton height={80} />
        <Skeleton width="60%" height={13} />
        <Skeleton width={96} height={92} radius={12} />
        <Skeleton width="100%" height={430} shape="solid" />
        <Skeleton width={40} height={12} shape="block" />
      </>,
    );
    expect([...container.querySelectorAll('.ch-skel')].map((s) => s.classList.contains('ch-skel--block'))).toEqual([true, true, false, false, false, true]);
    expect(rule("  [data-ui='clubhouse'] main[data-canopy] .ch-skel--block")).toMatch(/border-radius: 0 !important;[\s\S]*animation: none;/);
    expect(rule('.ch-skel')).toContain('#e2dbca');
  });

  it('SkelLine holds the line box; SkelRows are Ledger rows; SkelRule is the rule', () => {
    const { container } = render(
      <>
        <SkelLine line={47.5} bar={36} width={260} />
        <SkelRows rows={3} lead trail />
        <SkelRule />
      </>,
    );
    const line = container.querySelector<HTMLElement>('.ch-skel-ln')!;
    expect(line.style.height).toBe('47.5px');
    expect(line.querySelector<HTMLElement>('.ch-skel')!.style.height).toBe('36px');
    const rows = container.querySelectorAll('.ch-skel-rows > .ch-skel-rows__r');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.querySelectorAll('.ch-skel')).toHaveLength(4);
    expect(container.querySelector('.ch-skel-rule')).not.toBeNull();
    for (const el of container.querySelectorAll('.ch-skel-ln, .ch-skel-rows, .ch-skel-rule')) expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});
