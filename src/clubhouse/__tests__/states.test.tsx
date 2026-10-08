import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartColumn, Users } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The shared state layer (states audit, 2026-10-08): the section empty is a flush Ledger line, the page empty and the
 * route error share one anatomy (and so does a page whose one read failed, CH-1211), a notice is flush with its action
 * in its own slot, several failed parts or crashed sections are told once with one Try again (CH-1209, CH-1210),
 * skeleton blocks are ruled rather than filled (CH-1609), and titles never end in a full stop. The pixels are checked
 * in a browser; these pin the structure and the rules the CSS hangs on.
 */

const refreshSpy = vi.hoisted(() => vi.fn());
const reportSpy = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshSpy, push: vi.fn() }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: reportSpy, chTrail: vi.fn(), chTagSession: vi.fn() }));

import { EmptyState, SkelLine, SkelRows, SkelRule, Skeleton, stateTitle } from '../ui/States';
import { InlineNotice, PageNotice, RouteErrorView } from '../ui/Notices';
import { PageRefreshNotice, RefreshNotice } from '../ui/RefreshNotice';
import { SectionBoundary, SectionGroup, SectionGroupNotice } from '../ui/SectionBoundary';

const root = join(process.cwd(), 'src/clubhouse');
const shellCss = readFileSync(join(root, 'styles/shell.css'), 'utf8');
/** One rule's declarations, by its exact selector. */
const rule = (selector: string) => {
  const at = shellCss.indexOf(`${selector} {`);
  expect(at, `${selector} is in shell.css`).toBeGreaterThan(-1);
  return shellCss.slice(at, shellCss.indexOf('}', at));
};

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });

afterEach(() => {
  refreshSpy.mockReset();
  reportSpy.mockReset();
  setOnline(true);
});

describe('Titles are headlines', () => {
  it('one trailing full stop is dropped; an ellipsis and a bare title are kept', () => {
    expect(stateTitle('No trips planned.')).toBe('No trips planned');
    expect(stateTitle('Still saving...')).toBe('Still saving...');
    expect(stateTitle('No players yet')).toBe('No players yet');
  });

  it('the shared state files write their own copy with curly apostrophes', () => {
    for (const file of ['ui/States.tsx', 'ui/Notices.tsx', 'ui/RefreshNotice.tsx', 'ui/Retry.tsx', 'ui/SectionBoundary.tsx']) {
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

describe('CH-1211 a page whose one read failed is the page empty in the danger tone', () => {
  const failed = (extra?: { code?: string; secondaryAction?: ReactNode }) => (
    <EmptyState size="page" tone="danger" title="Team rounds didn’t load." body="Every figure would be incomplete, so they’re hidden." {...extra} />
  );

  it('an alert under the page head: the brick medallion, an h2 title, and Try again first, which re-runs the page', async () => {
    render(failed({ code: 'CH-4201', secondaryAction: <a href="/golf/dashboard">Back to Home</a> }));
    const page = screen.getByRole('alert');
    expect(page.className).toBe('ch-empty-page ch-empty-page--danger');
    expect(page.getAttribute('data-ch-code')).toBe('CH-4201');
    expect(page.querySelector('.ch-empty-page__art .ch-empty-page__ic svg')).not.toBeNull();
    expect(page.querySelector('.ch-sheet, .ch-notice')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Team rounds didn’t load');
    expect([...page.querySelector('.ch-empty-page__a')!.children].map((a) => a.textContent)).toEqual(['Try again', 'Back to Home']);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('CH-1905 offline, Try again says so instead of re-running the page, until the connection is back', async () => {
    render(failed());
    expect(screen.getByRole('alert').getAttribute('data-ch-code')).toBe('CH-1211');
    setOnline(false);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refreshSpy).not.toHaveBeenCalled();
    const line = document.querySelector('.ch-empty-page__note[data-ch-code="CH-1905"]')!;
    expect(line.textContent).toBe('You’re offline. Reconnect, then try again.');
    expect(line.nextElementSibling!.className).toBe('ch-empty-page__a');
    setOnline(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(document.querySelector('[data-ch-code="CH-1905"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('renders on the server, and a page empty without the tone is unchanged', () => {
    const html = renderToString(failed({ code: 'CH-4201' }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Try again');
    render(<EmptyState size="page" code="CH-4301" icon={ChartColumn} title="No 18-hole rounds in this window yet" />);
    const quiet = document.querySelector('[data-ch-code="CH-4301"]')!;
    expect(quiet.className).toBe('ch-empty-page');
    expect(quiet.getAttribute('role')).toBeNull();
    expect(quiet.querySelector('.ch-empty-page__a')).toBeNull();
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
    // Between the section's own rules: no stripe, no ring, no fill, and no inset, so the icon is on the heading's edge.
    const css = rule('.ch-notice');
    expect(css).toMatch(/container: ch-notice \/ inline-size;[\s\S]*padding: 1px 0;[\s\S]*background: var\(--ch-notice-fill\);/);
    expect(css).not.toMatch(/border|box-shadow|outline/);
    expect(css).toContain('--ch-notice-fill: none;');
    expect(rule('.ch-notice--danger')).not.toContain('--ch-notice-rule');
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

describe('CH-1210 sections that crash together are told once', () => {
  const broken = new Set<string>();
  const Part = ({ name }: { name: string }) => {
    if (broken.has(name)) throw new Error(`${name} broke`);
    return <p>{`${name} is here`}</p>;
  };
  const page = ({ slot = true }: { slot?: boolean } = {}) => (
    <main>
      {slot && <SectionGroupNotice />}
      <SectionBoundary surface="stats.team.figures" label="Team figures" code="CH-4204">
        <Part name="figures" />
      </SectionBoundary>
      <SectionBoundary surface="stats.team.trend" label="The trend chart" code="CH-4205">
        <Part name="trend" />
      </SectionBoundary>
      <SectionBoundary surface="hub.rsvps" label="RSVPs" code="CH-4206">
        <Part name="rsvps" />
      </SectionBoundary>
    </main>
  );
  let quiet: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    broken.clear();
    quiet.mockRestore();
  });

  it('two or more: one alert names them in reading order, each keeps only its title, and one Try again tries them all', async () => {
    for (const name of ['figures', 'trend', 'rsvps']) broken.add(name);
    render(<SectionGroup>{page()}</SectionGroup>);
    const notice = screen.getByRole('alert');
    expect(notice.getAttribute('data-ch-code')).toBe('CH-1210');
    expect(notice.querySelector('.ch-notice__title')!.textContent).toBe('Some of this page couldn’t be shown');
    expect(notice.querySelector('.ch-notice__body')!.textContent).toBe(
      'Team figures, the trend chart and RSVPs couldn’t be shown. The rest of the page is fine, and this has been reported automatically.',
    );
    expect([...document.querySelectorAll('.ch-notice--covered')].map((n) => [n.getAttribute('data-ch-code'), n.textContent])).toEqual([
      ['CH-4204', 'Team figures couldn’t be shown'],
      ['CH-4205', 'The trend chart couldn’t be shown'],
      ['CH-4206', 'RSVPs couldn’t be shown'],
    ]);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(reportSpy.mock.calls.map(([, ctx]) => ctx.surface)).toEqual(['stats.team.figures', 'stats.team.trend', 'hub.rsvps']);

    // Two come back and one still fails: that one is alone now, so it has its own notice and Try again again.
    broken.delete('figures');
    broken.delete('rsvps');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('figures is here')).toBeTruthy();
    expect(screen.getByText('rsvps is here')).toBeTruthy();
    const alone = screen.getByRole('alert');
    expect(alone.getAttribute('data-ch-code')).toBe('CH-4205');
    expect(document.querySelector('[data-ch-code="CH-1210"], .ch-notice--covered')).toBeNull();
    broken.clear();
    await userEvent.click(within(alone).getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('trend is here')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('in StrictMode, sections that crash as they first mount are still told together', () => {
    // StrictMode (dev) and <Activity> detach a mounted boundary and attach it again without catching again; the phone
    // tree mounts after hydration, so its boundaries catch in the commit that mounts them.
    broken.add('figures');
    broken.add('rsvps');
    render(
      <StrictMode>
        <SectionGroup>{page()}</SectionGroup>
      </StrictMode>,
    );
    expect(screen.getAllByRole('alert').map((n) => n.getAttribute('data-ch-code'))).toEqual(['CH-1210']);
    expect(screen.getByRole('alert').querySelector('.ch-notice__body')!.textContent).toMatch(/^Team figures and RSVPs couldn’t be shown\. /);
    expect([...document.querySelectorAll('.ch-notice--covered')].map((n) => n.getAttribute('data-ch-code'))).toEqual(['CH-4204', 'CH-4206']);
  });

  it('one crash keeps its own notice, and the group notice says nothing', () => {
    broken.add('trend');
    render(<SectionGroup>{page()}</SectionGroup>);
    const notice = screen.getByRole('alert');
    expect(notice.getAttribute('data-ch-code')).toBe('CH-4205');
    expect(notice.querySelector('.ch-notice__body')!.textContent).toBe('The rest of the page is fine. This has been reported automatically.');
    expect(within(notice).getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('with no group notice on the page, or no group at all, every crash keeps its own notice', () => {
    broken.add('figures');
    broken.add('trend');
    const { unmount } = render(<SectionGroup>{page({ slot: false })}</SectionGroup>);
    expect(screen.getAllByRole('alert').map((n) => n.getAttribute('data-ch-code'))).toEqual(['CH-4204', 'CH-4205']);
    expect(document.querySelector('.ch-notice--covered')).toBeNull();
    unmount();
    render(page());
    expect(screen.getAllByRole('alert').map((n) => n.getAttribute('data-ch-code'))).toEqual(['CH-4204', 'CH-4205']);
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(2);
  });

  it('nothing is registered on the server, so the server HTML carries no group notice', () => {
    for (const name of ['figures', 'trend']) broken.add(name);
    const html = renderToString(<SectionGroup>{page()}</SectionGroup>);
    expect(html).toContain('rsvps is here');
    expect(html).not.toContain('CH-1210');
    expect(html).not.toContain('couldn’t be shown');
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
