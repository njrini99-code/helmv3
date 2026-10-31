// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/live' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const phone = vi.hoisted(() => ({ on: false }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => phone.on }));
vi.mock('../../../shell/phone-chrome', () => ({ PhoneTop: ({ title }: { title: React.ReactNode }) => <header>{title}</header> }));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_LIVE, PREVIEW_LIVE_EMPTY, PREVIEW_LIVE_FAILED, PREVIEW_LIVE_NOW, PREVIEW_LIVE_ONE } from '../../../preview/fixtures-live';
import { LiveDenied, LiveView } from '../LiveView';
import type { LiveSnapshot } from '../../../live/model';

const view = (initial: LiveSnapshot) => render(<LiveView initial={initial} frozen now={PREVIEW_LIVE_NOW} />);

beforeEach(() => {
  phone.on = false;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  try {
    window.localStorage.clear();
  } catch {
    // Storage can be blocked; the test then starts from the page's own defaults.
  }
});
afterEach(cleanup);

describe('the live view', () => {
  it('groups lanes: on the course, finished today, and not heard from, each with its count', () => {
    view(PREVIEW_LIVE);
    expect(screen.getByRole('heading', { name: 'On the course · 5' }).getAttribute('data-ch-code')).toBe('CH-16612');
    expect(screen.getByRole('heading', { name: 'Finished today · 1' }).getAttribute('data-ch-code')).toBe('CH-16613');
    expect(screen.getByRole('heading', { name: 'Not heard from · 1' }).getAttribute('data-ch-code')).toBe('CH-16614');
    const quiet = screen.getByRole('heading', { name: 'Not heard from · 1' }).closest('section')!;
    expect(within(quiet).getByText('Noor Haddad')).toBeTruthy();
  });

  it('sorts the group by to-par, best on top', () => {
    view(PREVIEW_LIVE);
    const section = screen.getByRole('heading', { name: 'On the course · 5' }).closest('section')!;
    const names = [...section.querySelectorAll('.ch-lv-name')].map((n) => n.textContent);
    expect(names[0]).toBe('Priya Shah');
    expect(names.indexOf('Mateo Lind')).toBe(names.length - 1);
  });

  it('shows the filter only while two round types have lanes, and only the types that do', () => {
    view(PREVIEW_LIVE);
    const seg = screen.getByRole('radiogroup', { name: 'Round type' });
    expect(within(seg).getAllByRole('radio').map((r) => r.textContent)).toEqual(['All', 'Qualifier', 'Practice']);
    cleanup();
    view(PREVIEW_LIVE_ONE);
    expect(screen.queryByRole('radiogroup', { name: 'Round type' })).toBeNull();
  });

  it('filters to one round type', async () => {
    view(PREVIEW_LIVE);
    await userEvent.click(screen.getByRole('radio', { name: 'Practice' }));
    expect(screen.getAllByText('Jonah Okafor').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sofia Reyes')).toBeNull();
  });

  it('remembers the sort on this device', async () => {
    const { unmount } = view(PREVIEW_LIVE);
    await userEvent.click(screen.getByRole('button', { name: /Sort: To par/ }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Name' }));
    expect(window.localStorage.getItem('ch.live.sort')).toBe('name');
    unmount();
    view(PREVIEW_LIVE);
    expect(await screen.findByRole('button', { name: /Sort: Name/ })).toBeTruthy();
  });

  it('hides the sort for a single lane', () => {
    view(PREVIEW_LIVE_ONE);
    expect(screen.queryByRole('button', { name: /Sort:/ })).toBeNull();
  });

  it('says nobody is out when nobody is (CH-16619) and draws no groups', () => {
    const { container } = view(PREVIEW_LIVE_EMPTY);
    expect(container.querySelector('[data-ch-code="CH-16619"]')!.textContent).toBe('No one is on the course right now.Rounds show up here as soon as a player starts one.');
    expect(container.querySelector('.ch-lv-group')).toBeNull();
  });

  it('keeps what loaded and offers Try again when the first read failed (CH-16604)', () => {
    const { container } = view(PREVIEW_LIVE_FAILED);
    expect(container.querySelector('[data-ch-code="CH-16604"]')!.textContent).toContain('Can’t refresh right now');
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
  });

  it('says it is not theirs to read when the coach has no team (CH-16609)', () => {
    const { container } = render(<LiveDenied />);
    expect(container.querySelector('[data-ch-code="CH-16609"]')!.textContent).toBe('You don’t have access to this team’s live rounds.');
  });

  it('walks the lanes with the arrow keys as one tab stop, and Enter opens the player in the panel', async () => {
    const { container } = view(PREVIEW_LIVE);
    const rows = [...container.querySelectorAll<HTMLElement>('.ch-lv-hit')];
    expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    rows[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(rows[1]);
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(rows.at(-1));
    await userEvent.keyboard('{Home}{Enter}');
    expect(container.querySelector('.ch-lv-panel h2')!.textContent).toBe(rows[0]!.closest('li')!.querySelector('.ch-lv-name')!.textContent);
  });

  it('Escape clears the selection and puts focus back on the lane', async () => {
    const { container } = view(PREVIEW_LIVE);
    const first = container.querySelector<HTMLElement>('.ch-lv-hit')!;
    first.focus();
    await userEvent.keyboard('{Enter}');
    expect(container.querySelector('.ch-lv-panel h2')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await vi.waitFor(() => expect(document.activeElement).toBe(first));
    expect(container.querySelector('.ch-lv-panel__title')!.getAttribute('data-ch-code')).toBe('CH-16618');
  });

  it('with nothing selected the panel shows where everyone is (CH-16618)', () => {
    const { container } = view(PREVIEW_LIVE);
    expect(container.querySelector('[data-ch-code="CH-16618"]')!.textContent).toBe('Where everyone is');
    expect(container.querySelectorAll('.ch-lv-ribbon__token').length).toBeGreaterThan(3);
  });

  it('on a phone it is a pushed screen with sheets, not a panel', () => {
    phone.on = true;
    const { container } = view(PREVIEW_LIVE);
    expect(container.querySelector('.ch-lv--phone')).toBeTruthy();
    expect(container.querySelector('.ch-lv-panel')).toBeNull();
    expect(container.querySelector('[data-ch-code="CH-16610"]')!.textContent).toBe('Live');
  });
});
