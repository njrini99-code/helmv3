import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Recruiting (P014): every numbered state in docs/clubhouse/catalog/recruiting.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const report = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: report, chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/recruiting', redirect: (to: string) => redirect(to) }));
const redirect = vi.hoisted(() => vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const actions = vi.hoisted(() => ({
  getRecruits: vi.fn(),
  createRecruit: vi.fn(),
  updateRecruit: vi.fn(),
  deleteRecruit: vi.fn(),
  getDocs: vi.fn(),
  upload: vi.fn(),
  deleteDoc: vi.fn(),
  docUrl: vi.fn(),
}));
vi.mock('@/app/golf/actions/recruiting', () => ({
  getRecruits: actions.getRecruits,
  createRecruit: actions.createRecruit,
  updateRecruit: actions.updateRecruit,
  deleteRecruit: actions.deleteRecruit,
}));
vi.mock('@/app/golf/actions/recruit-documents', () => ({
  getRecruitDocuments: actions.getDocs,
  uploadRecruitDocument: actions.upload,
  deleteRecruitDocument: actions.deleteDoc,
  getRecruitDocumentUrl: actions.docUrl,
}));
const native = vi.hoisted(() => ({ is: false, open: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => native.is, openExternalUrl: native.open }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: () => Promise.resolve(session.current) }));
const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: () => flag.on }));
vi.mock('@/components/fairway', () => ({ Button: () => null, EmptyState: () => null }));
vi.mock('@/components/fairway/pages/recruiting', () => ({ FairwayRecruitingPage: () => <p>The current recruiting page</p> }));
vi.mock('@/lib/redesign/flag', () => ({ fairwayScope: (c: string) => c }));

import RecruitingPage from '@/app/golf/(dashboard)/dashboard/recruiting/page';
import RecruitingLoading from '@/app/golf/(dashboard)/dashboard/recruiting/loading';
import { loadRecruiting } from '../data/recruiting';
import {
  FIELD_LIMITS,
  checkDraft,
  countByStage,
  dateLabel,
  draftOf,
  inputFromDraft,
  matchesQuery,
  screenFile,
  sharesOf,
  sortProspects,
  telHref,
  toDocument,
  toProspect,
  visibleProspects,
  whenLabel,
  type ChDocument,
  type ChProspect,
  type ChRecruiting,
} from '../data/recruiting-shape';
import { ClubhouseRecruitingRoute } from '../routes/recruiting';
import { Recruiting } from '../screens/recruiting/Recruiting';
import { RecruitingSkeleton } from '../screens/recruiting/RecruitingSkeleton';
import { RecruitingView, type RecInitial } from '../screens/recruiting/RecruitingView';
import { createLiveRecruitingWrites, type ChRecruitingWrites } from '../screens/recruiting/writes';
import { CH_NAV_COACH, CH_REBUILT_ROUTES, isRebuilt, phoneTabsFor } from '../shell/nav';
import { ClubhouseMarker } from '../shell/context';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_DOCUMENTS, PREVIEW_PROSPECTS, PREVIEW_RECRUITING, PREVIEW_RECRUITING_EMPTY, PREVIEW_RECRUITING_FAILED, PREVIEW_RECRUITING_NOW } from '../preview/fixtures-recruiting';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const codes = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)];
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const dlg = () => document.querySelector('dialog[open]') as HTMLElement;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const ok = <T,>(data?: T) => Promise.resolve({ success: true as const, data });
const fail = (error = 'nope') => Promise.resolve({ success: false as const, error });

/** Fake writes that answer like the server when it is happy. Each test overrides the one it is about. */
function fakeWrites() {
  return {
    create: vi.fn((): Promise<{ success: boolean; data?: { id: string }; error?: string }> => ok({ id: 'new-1' })),
    update: vi.fn((): Promise<{ success: boolean; error?: string }> => ok()),
    remove: vi.fn((): Promise<{ success: boolean; error?: string }> => ok()),
    documents: {
      list: vi.fn((id: string): Promise<{ success: boolean; data?: ChDocument[]; error?: string }> => ok((PREVIEW_DOCUMENTS[id] ?? []).map((d) => ({ ...d })))),
      upload: vi.fn((): Promise<{ success: boolean; data?: { id: string }; error?: string }> => ok({ id: 'd-new' })),
      remove: vi.fn((): Promise<{ success: boolean; error?: string }> => ok()),
      open: vi.fn((): Promise<{ success: boolean; error?: string }> => ok()),
    },
  };
}
type Fake = ReturnType<typeof fakeWrites>;

const COACH = { role: 'coach' as const };
const tree = (data: ChRecruiting, w: Fake, initial?: RecInitial) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <PhoneChromeProvider>
        <ClubhouseMarker {...COACH}>
          <div className="ch-root" data-ui="clubhouse">
            <SlotHost />
            <RecruitingView data={data} writes={w as unknown as ChRecruitingWrites} initial={initial} />
          </div>
        </ClubhouseMarker>
      </PhoneChromeProvider>
    </ToastProvider>
  </LazyMotion>
);
/** The shell's phone top bar, where the page's PhoneTop renders. */
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
/** `initial` freezes the page's clock at the fixture's, so dates read as the board's do. */
function wrap(data: ChRecruiting = PREVIEW_RECRUITING, w: Fake = fakeWrites(), initial: RecInitial | null = {}) {
  const r = render(tree(data, w, initial ?? undefined));
  return { w, ...r, again: (next: ChRecruiting) => r.rerender(tree(next, w, initial ?? undefined)) };
}

const rowNames = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => r.querySelector('b')!.textContent);
const panel = (name: string) => screen.getByRole('complementary', { name });
const stageOf = (name: string) => within(within(screen.getByRole('table')).getByRole('button', { name: new RegExp(`^${name}`) }).closest('tr')!).getByText(/^(Watched|Recruiting|Offered|Committed)$/).textContent;

beforeEach(() => {
  hapticSpy.mockClear();
  report.mockClear();
  router.refresh.mockClear();
  redirect.mockClear();
  logServer.mockClear();
  for (const f of Object.values(actions)) f.mockReset();
  native.is = false;
  native.open.mockReset();
  session.current = null;
  flag.on = true;
  localStorage.clear();
});

// ── The pure rules ───────────────────────────────────────────────────────────

describe('Recruiting · the rules', () => {
  it('CH-14801 the pipeline reads the board: 3, 3, 1 and 1 of 8 are 38%, 38%, 12% and 12%, always adding to 100', () => {
    const counts = countByStage(PREVIEW_PROSPECTS);
    expect(counts).toEqual({ watched: 3, recruiting: 3, offered: 1, committed: 1 });
    expect(sharesOf(counts)).toEqual({ watched: 38, recruiting: 38, offered: 12, committed: 12 });
    for (const c of [{ watched: 1, recruiting: 1, offered: 1, committed: 0 }, { watched: 5, recruiting: 0, offered: 0, committed: 2 }, { watched: 1, recruiting: 2, offered: 3, committed: 4 }]) {
      expect(Object.values(sharesOf(c)!).reduce((a, b) => a + b, 0)).toBe(100);
    }
    expect(sharesOf({ watched: 0, recruiting: 0, offered: 0, committed: 0 })).toBeNull();
  });

  it('search looks at name, hometown, state, email and notes, and the stage filter narrows before the search does', () => {
    const find = (q: string) => PREVIEW_PROSPECTS.filter((p) => matchesQuery(p, q)).map((p) => p.firstName);
    expect(find('reilly')).toEqual(['Mason']);
    expect(find('charleston')).toEqual(['Maya']);
    expect(find('sc')).toEqual(['Lila', 'Maya', 'Owen']);
    expect(find('caleb.nguyen@')).toEqual(['Caleb']);
    expect(find('carolinas junior')).toEqual(['Mason']);
    expect(find('  ')).toHaveLength(8);
    expect(visibleProspects(PREVIEW_PROSPECTS, { stage: 'recruiting', query: 'sc', sort: 'name' }).map((p) => p.firstName)).toEqual(['Maya']);
  });

  it('sort: recently updated is newest first, name is A to Z, class year puts no year last', () => {
    const order = (sort: 'updated' | 'name' | 'class', list: ChProspect[] = PREVIEW_PROSPECTS) => sortProspects(list, sort).map((p) => p.firstName);
    expect(order('updated')).toEqual(['Mason', 'Caleb', 'Lila', 'Hannah', 'Maya', 'Owen', 'Jack', 'Ben']);
    expect(order('name')).toEqual(['Ben', 'Caleb', 'Hannah', 'Jack', 'Lila', 'Mason', 'Maya', 'Owen']);
    expect(order('class', [{ ...PREVIEW_PROSPECTS[0]!, classYear: null }, PREVIEW_PROSPECTS[5]!, PREVIEW_PROSPECTS[1]!])).toEqual(['Caleb', 'Owen', 'Mason']);
  });

  it('dates read as the board does: Today, Yesterday, "2 days ago", then the day, with the year only when it differs', () => {
    const now = new Date(PREVIEW_RECRUITING_NOW);
    expect(whenLabel('2026-09-25T09:00:00.000Z', now, 'UTC')).toBe('Today');
    expect(whenLabel('2026-09-24T09:00:00.000Z', now, 'UTC')).toBe('Yesterday');
    expect(whenLabel('2026-09-23T09:00:00.000Z', now, 'UTC')).toBe('2 days ago');
    expect(whenLabel('2026-09-22T09:00:00.000Z', now, 'UTC')).toBe('3 days ago');
    expect(whenLabel('2026-09-21T09:00:00.000Z', now, 'UTC')).toBe('Sep 21');
    expect(dateLabel('2025-12-03T09:00:00.000Z', now, 'UTC')).toBe('Dec 3, 2025');
    expect(whenLabel('not a date', now)).toBe('—');
  });

  it('CH-14101 CH-14102 CH-14103 CH-14104 a draft is refused as the server refuses it, in the order of the form', () => {
    const d = { ...draftOf(null), first: '', classYear: '1999', state: 'N', notes: 'x'.repeat(FIELD_LIMITS.notes + 1) };
    expect(checkDraft(d).map((p) => [p.field, p.code])).toEqual([
      ['first', 'CH-14101'],
      ['state', 'CH-14103'],
      ['classYear', 'CH-14102'],
      ['notes', 'CH-14104'],
    ]);
    expect(checkDraft({ ...d, first: 'Ellie', classYear: '2040', state: 'nc', notes: '' })).toEqual([]);
    expect(checkDraft({ ...d, first: 'Ellie', classYear: '2041', state: '', notes: '' }).map((p) => p.code)).toEqual(['CH-14102']);
    expect(checkDraft({ ...draftOf(null), first: 'a'.repeat(121) })[0]?.message).toBe('First name is too long (120 characters at most).');
  });

  it('a draft goes to the server trimmed, with the state in capitals, the year as a number and the stage always sent', () => {
    expect(inputFromDraft({ ...draftOf(null), first: ' Ellie ', last: 'Morrow', state: 'nc', classYear: '2028', hometown: ' Wilmington ' })).toEqual({
      first_name: 'Ellie',
      last_name: 'Morrow',
      hs_class: 2028,
      email: '',
      phone: '',
      hometown: 'Wilmington',
      state: 'NC',
      notes: '',
      status: 'watched',
    });
  });

  it('CH-14105 CH-14106 a file is screened with the bucket\'s own limits, before anything is sent', () => {
    expect(screenFile({ name: 'film.pdf', size: 25 * 1024 * 1024 + 1 })?.code).toBe('CH-14105');
    expect(screenFile({ name: 'clip.avi', size: 9_000_000 })?.code).toBe('CH-14106');
    expect(screenFile({ name: 'noextension', size: 10 })?.code).toBe('CH-14106');
    expect(screenFile({ name: 'Transcript.PDF', size: 25 * 1024 * 1024 })).toBeNull();
    // Film (MP4, MOV, M4V) is taken, up to 100 MB; anything else stays at 25 MB.
    for (const name of ['swing.mov', 'Swing.MP4', 'drill.m4v']) expect(screenFile({ name, size: 100 * 1024 * 1024 }), name).toBeNull();
    expect(screenFile({ name: 'swing.mov', size: 100 * 1024 * 1024 + 1 })).toMatchObject({ code: 'CH-14105', title: 'That film is over 100 MB' });
    expect(screenFile({ name: 'scan.png', size: 26 * 1024 * 1024 })).toMatchObject({ code: 'CH-14105', title: 'That file is over 25 MB' });
  });

  it('CH-14805 a phone number becomes a tel: link of digits and a plus only', () => {
    expect(telHref('(555) 010-4418')).toBe('tel:5550104418');
    expect(telHref('+1 555 010 4418 ext 2;<x>')).toBe('tel:+155501044182');
  });

  it('a row the table does not know reads as Recruiting, and a document category it does not know as Other', () => {
    expect(toProspect({ id: 'x', team_id: 't', first_name: 'A', last_name: null, hs_class: null, email: null, phone: null, hometown: null, state: null, notes: null, status: 'signed' as never, created_at: '', updated_at: '' }).stage).toBe('recruiting');
    expect(toDocument({ id: 'd', recruit_id: 'x', team_id: 't', title: '', category: 'video', file_name: 'a.pdf', storage_path: 'p', file_type: null, file_size: null, uploaded_by: null, created_at: '', updated_at: '' })).toMatchObject({ category: 'other', title: 'a.pdf' });
  });
});

// ── The loader, the route, the page ─────────────────────────────────────────

describe('Recruiting · the loader, the route and the page', () => {
  const row = (over: Record<string, unknown> = {}) => ({ id: 'r1', team_id: 't1', first_name: 'Ada', last_name: 'Lovelace', hs_class: 2027, email: null, phone: null, hometown: 'Raleigh', state: 'NC', notes: null, status: 'offered', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z', ...over });

  it('the loader reads through the current page\'s own action and shapes the rows', async () => {
    actions.getRecruits.mockResolvedValue({ success: true, data: [row()] });
    const load = await loadRecruiting(new Date('2026-09-30T12:00:00Z'));
    expect(load).toEqual({ kind: 'ready', data: { prospects: [expect.objectContaining({ id: 'r1', name: 'Ada Lovelace', stage: 'offered', classYear: 2027 })], error: false, now: '2026-09-30T12:00:00.000Z' } });
  });

  it('CH-14201 a read that fails is flagged and logged, never an empty list; one that throws is the same', async () => {
    actions.getRecruits.mockResolvedValueOnce({ success: false, error: 'Failed to load recruits' });
    expect(await loadRecruiting()).toMatchObject({ kind: 'ready', data: { prospects: [], error: true } });
    expect(logServer).toHaveBeenCalledWith('recruiting', 'prospects', 'Failed to load recruits', 'recruiting');
    actions.getRecruits.mockRejectedValueOnce(new Error('boom'));
    expect(await loadRecruiting()).toMatchObject({ kind: 'ready', data: { prospects: [], error: true } });
  });

  it('CH-14306 a coach with no team gets the no-team answer, not a failed list', async () => {
    actions.getRecruits.mockResolvedValue({ success: false, error: 'No team found for coach', errorCode: 'no_team' });
    expect(await loadRecruiting()).toEqual({ kind: 'noTeam' });
    session.current = { coach: { id: 'c1' } };
    render(<ToastProvider>{await ClubhouseRecruitingRoute()}</ToastProvider>);
    expect(code('CH-14306')?.textContent).toMatch(/You aren't on a team yet/);
    expect(screen.getByRole('link', { name: 'Open team settings' }).getAttribute('href')).toBe('/golf/dashboard/settings?section=team');
  });

  it('CH-14902 the route draws nothing for a session with no coach, and never reads the list for it', async () => {
    session.current = { player: { id: 'p1' }, role: 'player' };
    expect(await ClubhouseRecruitingRoute()).toBeNull();
    expect(actions.getRecruits).not.toHaveBeenCalled();
  });

  it('CH-14902 a player who opens Recruiting is sent Home, flag on or off; a coach gets Clubhouse with the flag on and the current page with it off', async () => {
    session.current = { role: 'player', player: { id: 'p1' }, coach: null };
    await expect(RecruitingPage()).rejects.toThrow('REDIRECT:/golf/dashboard');
    flag.on = false;
    await expect(RecruitingPage()).rejects.toThrow('REDIRECT:/golf/dashboard');
    expect(actions.getRecruits).not.toHaveBeenCalled();

    session.current = { role: 'coach', coach: { id: 'c1' } };
    actions.getRecruits.mockResolvedValue({ success: true, data: [row()] });
    flag.on = false;
    const legacy = await RecruitingPage();
    render(legacy);
    expect(screen.getByText('The current recruiting page')).toBeTruthy();

    flag.on = true;
    const element = (await RecruitingPage()) as { type: unknown };
    expect(element.type).toBe(ClubhouseRecruitingRoute);
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>{await ClubhouseRecruitingRoute()}</ToastProvider>
      </LazyMotion>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Recruiting' })).toBeTruthy();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
  });

  it('CH-14401 the route skeleton is the Clubhouse one inside the shell and the existing one outside it', () => {
    render(<RecruitingSkeleton />);
    expect(code('CH-14401')?.getAttribute('aria-busy')).toBe('true');
    const { container } = render(<RecruitingLoading />);
    expect(container.querySelector('[data-ch-code="CH-14401"]')).toBeNull();
    render(
      <ClubhouseMarker {...COACH}>
        <RecruitingLoading />
      </ClubhouseMarker>,
    );
    expect(codes('CH-14401')).toHaveLength(2);
  });

  it('the live wrapper runs on the current page\'s own server actions', async () => {
    actions.updateRecruit.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    actions.getDocs.mockResolvedValue({ success: true, data: [] });
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <Recruiting data={{ ...PREVIEW_RECRUITING }} />
          </div>
        </ToastProvider>
      </LazyMotion>,
    );
    await user.click(within(panel('Mason Reilly')).getByRole('radio', { name: 'Committed' }));
    await waitFor(() => expect(actions.updateRecruit).toHaveBeenCalledWith('p-mason', { status: 'committed' }));
    expect(actions.getDocs).toHaveBeenCalledWith('p-mason');
  });

  it('the live writes: documents read, removed and opened through the current actions; a link opens in the in-app browser on the iPhone and through an anchor on the web', async () => {
    const w = createLiveRecruitingWrites();
    actions.getDocs.mockResolvedValue({ success: true, data: [{ id: 'd1', recruit_id: 'r', team_id: 't', title: 'Schedule', category: 'schedule', file_name: 's.pdf', storage_path: 'p', file_type: 'application/pdf', file_size: 10, uploaded_by: null, created_at: 'x', updated_at: 'x' }] });
    expect(await w.documents.list('r')).toEqual({ success: true, data: [expect.objectContaining({ id: 'd1', title: 'Schedule', category: 'schedule', size: 10 })] });
    actions.getDocs.mockResolvedValue({ success: false, error: 'Failed to load documents' });
    expect(await w.documents.list('r')).toEqual({ success: false, error: 'Failed to load documents' });
    const doc = { id: 'd1', title: 'Schedule', category: 'schedule' as const, fileName: 's.pdf', fileType: null, size: 1, createdAt: 'x' };
    actions.docUrl.mockResolvedValue({ success: false, error: 'Failed to open document' });
    expect(await w.documents.open(doc)).toEqual({ success: false, error: 'Failed to open document' });
    actions.docUrl.mockResolvedValue({ success: true, data: { url: 'https://signed.example/x?token=1', fileName: 's.pdf', fileType: null } });
    native.is = true;
    expect(await w.documents.open(doc)).toEqual({ success: true });
    expect(native.open).toHaveBeenCalledWith('https://signed.example/x?token=1');
    native.is = false;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await w.documents.open(doc)).toEqual({ success: true });
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('Recruiting is in the coach\'s sidebar under Team, after Roster, and is a rebuilt route for coaches only', () => {
    const i = CH_NAV_COACH.findIndex((n) => n.id === 'recruiting');
    expect(CH_NAV_COACH[i]).toMatchObject({ label: 'Recruiting', href: '/golf/dashboard/recruiting', section: 'Team' });
    expect(CH_NAV_COACH[i - 1]?.id).toBe('roster');
    expect(isRebuilt('/golf/dashboard/recruiting', 'coach')).toBe(true);
    expect(isRebuilt('/golf/dashboard/recruiting', 'player')).toBe(false);
    expect(CH_REBUILT_ROUTES.player).not.toContain('/golf/dashboard/recruiting');
    // On the phone it opens from More.
    expect(phoneTabsFor('coach').more.map((n) => n.id)).toContain('recruiting');
  });
});

// ── Desktop ──────────────────────────────────────────────────────────────────

describe('Recruiting · desktop', () => {
  it('CH-14904 CH-14801 CH-14802 it opens on the pipeline, the list by recently updated and the first prospect, as the board does', () => {
    wrap();
    expect(code('CH-14904')?.tagName).toBe('MAIN');
    expect(screen.getByRole('heading', { level: 1, name: 'Recruiting' })).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Filter by stage' });
    expect(group.getAttribute('data-ch-code')).toBe('CH-14801');
    for (const [name, pct] of [['Watched, 3 prospects', '38% of list'], ['Recruiting, 3 prospects', '38% of list'], ['Offered, 1 prospect', '12% of list'], ['Committed, 1 prospect', '12% of list']] as const) {
      const b = within(group).getByRole('button', { name });
      expect(b.getAttribute('aria-pressed')).toBe('false');
      expect(b.textContent).toContain(pct);
    }
    expect(screen.getByText('8 prospects · 1 committed')).toBeTruthy();
    expect(screen.getByRole('table').getAttribute('data-ch-code')).toBe('CH-14802');
    expect(rowNames()).toEqual(['Mason Reilly', 'Caleb Nguyen', 'Lila Brennan', 'Hannah Duarte', 'Maya Castillo', 'Owen Park', 'Jack Whitfield', 'Ben Adler']);
    const mason = within(screen.getByRole('table')).getByRole('button', { name: /^Mason Reilly/ });
    expect(mason.getAttribute('aria-current')).toBe('true');
    expect(within(mason.closest('tr')!).getByText('2 days ago')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('Sep 21')).toBeTruthy();
    // The panel: who, stage, contact, notes, documents and the footer.
    const p = panel('Mason Reilly');
    expect(within(p).getByText('Class of 2027 · Charlotte, NC')).toBeTruthy();
    expect(within(p).getByRole('radio', { name: 'Offered' }).getAttribute('aria-checked')).toBe('true');
    expect(within(p).getByText(/Saw Mason at the Carolinas Junior/)).toBeTruthy();
    expect(within(p).getByText('Added Aug 12 · Updated 2 days ago')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add prospect' })).toBeTruthy();
  });

  it('CH-14801 CH-14701 a stage is a filter: pressing it shows only those prospects, "Show all 8" and pressing it again undo it, and the counts ignore the search', async () => {
    const user = userEvent.setup();
    wrap();
    const offered = screen.getByRole('button', { name: 'Offered, 1 prospect' });
    await user.click(offered);
    expect(offered.getAttribute('aria-pressed')).toBe('true');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(rowNames()).toEqual(['Mason Reilly']);
    expect(within(offered).getByText('Showing only these')).toBeTruthy();
    expect(localStorage.getItem('ch-recruiting-stage')).toBe('offered');
    await user.click(screen.getByRole('button', { name: /^Show all/ }));
    expect(rowNames()).toHaveLength(8);
    expect(localStorage.getItem('ch-recruiting-stage')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Watched, 3 prospects' }));
    expect(rowNames()).toEqual(['Owen Park', 'Jack Whitfield', 'Ben Adler']);
    await user.click(screen.getByRole('button', { name: 'Watched, 3 prospects' }));
    expect(rowNames()).toHaveLength(8);
    // A search narrows the list and leaves the pipeline's counts alone.
    await user.type(screen.getByRole('searchbox', { name: 'Search prospects' }), 'tampa');
    expect(screen.getByRole('button', { name: 'Watched, 3 prospects' })).toBeTruthy();
    expect(screen.getByText('8 prospects · 1 committed')).toBeTruthy();
  });

  it('search finds a prospect by name, hometown, state, email or notes, Esc clears it, and the list keeps the open prospect', async () => {
    const user = userEvent.setup();
    wrap();
    const box = screen.getByRole('searchbox', { name: 'Search prospects' });
    await user.click(within(screen.getByRole('table')).getByRole('button', { name: /^Mason Reilly/ }));
    await user.type(box, 'carolinas');
    expect(rowNames()).toEqual(['Mason Reilly']);
    await user.clear(box);
    await user.type(box, 'savannah');
    expect(rowNames()).toEqual(['Hannah Duarte']);
    // Mason was picked, so he is still the open prospect although the search hides his row.
    expect(panel('Mason Reilly')).toBeTruthy();
    await user.clear(box);
    await user.type(box, 'nguyen');
    expect(rowNames()).toEqual(['Caleb Nguyen']);
    await user.keyboard('{Escape}');
    expect((box as HTMLInputElement).value).toBe('');
    expect(rowNames()).toHaveLength(8);
    await user.type(box, 'zzz');
    await user.click(within(code('CH-14302') as HTMLElement).getByRole('button', { name: 'Clear search' }));
    expect(rowNames()).toHaveLength(8);
  });

  it('sort: Name, Class year and Recently updated re-order the list, and the choice is remembered for the next visit', async () => {
    const user = userEvent.setup();
    const { unmount } = wrap(PREVIEW_RECRUITING, fakeWrites(), null);
    await user.click(screen.getByRole('radio', { name: 'Name' }));
    expect(rowNames()).toEqual(['Ben Adler', 'Caleb Nguyen', 'Hannah Duarte', 'Jack Whitfield', 'Lila Brennan', 'Mason Reilly', 'Maya Castillo', 'Owen Park']);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await user.click(screen.getByRole('radio', { name: 'Class year' }));
    expect(rowNames()).toEqual(['Mason Reilly', 'Lila Brennan', 'Jack Whitfield', 'Caleb Nguyen', 'Hannah Duarte', 'Maya Castillo', 'Owen Park', 'Ben Adler']);
    expect(localStorage.getItem('ch-recruiting-sort')).toBe('class');
    unmount();
    wrap(PREVIEW_RECRUITING, fakeWrites(), null);
    await waitFor(() => expect(rowNames()[1]).toBe('Lila Brennan'));
    await user.click(screen.getByRole('radio', { name: 'Recently updated' }));
    expect(rowNames()[0]).toBe('Mason Reilly');
    expect(rowNames()[1]).toBe('Caleb Nguyen');
  });

  it('CH-14302 a search and a stage that match nothing say so, and Search all stages and Clear search are the ways back; the open prospect stays open', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_RECRUITING, fakeWrites(), { query: 'Tampa', stage: 'offered', openId: 'p-owen' });
    expect(code('CH-14302')?.textContent).toContain('No prospects match "Tampa" in Offered');
    expect(code('CH-14302')?.textContent).toContain('Search looks at names, hometowns, email and notes. Try another word, or look across every stage.');
    expect(panel('Owen Park')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Offered, 1 prospect' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Search all stages' }));
    // The search is kept; only the stage goes.
    expect(code('CH-14302')?.textContent).toContain('No prospects match "Tampa"');
    expect(code('CH-14302')?.textContent).not.toContain('in Offered');
    expect(screen.queryByRole('button', { name: 'Search all stages' })).toBeNull();
    await user.click(within(code('CH-14302') as HTMLElement).getByRole('button', { name: 'Clear search' }));
    expect(rowNames()).toHaveLength(8);
  });

  it('CH-14302 a stage with nobody in it says so, with a way to show every stage', async () => {
    const user = userEvent.setup();
    wrap({ ...PREVIEW_RECRUITING, prospects: PREVIEW_PROSPECTS.filter((p) => p.stage !== 'offered') });
    await user.click(screen.getByRole('button', { name: 'Offered, 0 prospects' }));
    expect(code('CH-14302')?.textContent).toContain('No prospects in Offered');
    await user.click(screen.getByRole('button', { name: 'Show all stages' }));
    expect(rowNames()).toHaveLength(7);
  });

  it('CH-14301 first run is its own page: four zeros with their buttons off, no header Add, and Add your first prospect, which opens the dialog', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_RECRUITING_EMPTY);
    expect(code('CH-14301')?.textContent).toContain('Your prospect list starts here');
    expect(code('CH-14301')?.textContent).toContain('move them through Watched, Recruiting, Offered and Committed.');
    expect(screen.getByText('Nobody yet. Stages fill as you add prospects.')).toBeTruthy();
    for (const name of ['Watched, 0 prospects', 'Recruiting, 0 prospects', 'Offered, 0 prospects', 'Committed, 0 prospects']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Add/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add your first prospect' }));
    expect(dlg().textContent).toContain('Only a first name is required. Everything else can wait.');
  });

  it('CH-14201 CH-14911 a list that did not load says so with Try again, which asks the server again; it is never "your list starts here"', async () => {
    const user = userEvent.setup();
    const { again } = wrap(PREVIEW_RECRUITING_FAILED);
    expect(code('CH-14201')?.textContent).toMatch(/Your prospects didn't load.*Nothing was lost; this page just couldn't reach them/);
    expect(code('CH-14301')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filter by stage' })).toBeNull();
    // The board keeps Add prospect in the header beside the notice.
    expect(screen.getByRole('button', { name: 'Add prospect' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // CH-14912: what the server sends next replaces what the page held.
    again(PREVIEW_RECRUITING);
    await waitFor(() => expect(rowNames()).toHaveLength(8));
    expect(code('CH-14201')).toBeNull();
  });

  it('CH-14201 Try again offline says so instead of trying', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_RECRUITING_FAILED);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).not.toHaveBeenCalled();
    await expectCode('CH-1905');
    online.mockRestore();
  });

  it('CH-14203 a section that crashes is named and reported, and the rest of the page keeps working', () => {
    const broken = { ...PREVIEW_PROSPECTS[0]!, name: null as unknown as string };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    wrap({ ...PREVIEW_RECRUITING, prospects: [broken, ...PREVIEW_PROSPECTS.slice(1)] });
    quiet.mockRestore();
    expect(codes('CH-14203').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/The prospect list couldn.t be shown/)).toBeTruthy();
    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ surface: 'recruiting.list', severity: 'high' }));
    // The pipeline is its own section and still reads 8 prospects.
    expect(screen.getByText('8 prospects · 1 committed')).toBeTruthy();
  });

  it('CH-14303 CH-14304 CH-14305 a prospect with nothing yet says what is missing, and each Add opens the form on the field it is about', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_RECRUITING, fakeWrites(), { openId: 'p-owen' });
    const p = panel('Owen Park');
    expect(within(p).getByText('No contact details yet')).toBeTruthy();
    expect(within(p).getByText('Add an email or phone number to reach Owen or their family from here.')).toBeTruthy();
    expect(within(p).getByText('No notes yet')).toBeTruthy();
    expect(within(p).getByText('Where you saw them, what stood out, and what happens next.')).toBeTruthy();
    await expectCode('CH-14305', /No documents yet.*Schedules, transcripts and film, private to your staff\./);
    expect(code('CH-14303')).not.toBeNull();
    expect(code('CH-14304')).not.toBeNull();
    expect(within(p).queryByRole('link', { name: /Email|Call/ })).toBeNull();
    expect(within(p).getByText('Added Sep 12')).toBeTruthy();
    await user.click(within(code('CH-14303') as HTMLElement).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(document.activeElement?.id).toMatch(/-email$/));
    await user.click(within(dlg()).getByRole('button', { name: 'Cancel' }));
    await user.click(within(code('CH-14304') as HTMLElement).getByRole('button', { name: 'Add a note' }));
    await waitFor(() => expect(document.activeElement?.id).toMatch(/-notes$/));
  });

  it('CH-14805 Email and Call are plain mailto: and tel: links: nothing is sent from GolfHelm', () => {
    wrap();
    const p = panel('Mason Reilly');
    const email = within(p).getByRole('link', { name: /mason\.reilly@example\.com/ });
    expect(email.getAttribute('href')).toBe('mailto:mason.reilly@example.com');
    expect(within(email).getByText('Email')).toBeTruthy();
    const call = within(p).getByRole('link', { name: /\(555\) 010-4418/ });
    expect(call.getAttribute('href')).toBe('tel:5550104418');
    expect(actionsTouched()).toBe(false);
  });

  // ── A stage, saved when it is picked ───────────────────────────────────────

  it('CH-14909 CH-14803 a stage is saved the moment it is picked: the prospect moves before the server answers, the counts follow, and it is announced once saved', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    const save = deferred<{ success: boolean }>();
    w.update.mockReturnValue(save.promise);
    wrap(PREVIEW_RECRUITING, w);
    await user.click(within(panel('Mason Reilly')).getByRole('radio', { name: 'Committed' }));
    expect(w.update).toHaveBeenCalledWith('p-mason', { status: 'committed' });
    // Before the answer: moved everywhere.
    expect(stageOf('Mason Reilly')).toBe('Committed');
    expect(screen.getByRole('button', { name: 'Committed, 2 prospects' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Offered, 0 prospects' })).toBeTruthy();
    expect(within(panel('Mason Reilly')).getByRole('radio', { name: 'Committed' }).getAttribute('aria-checked')).toBe('true');
    expect(code('CH-14803')?.querySelector('[role="radiogroup"]')).not.toBeNull();
    // Nothing is announced until it has saved.
    expect(document.querySelector('p[data-ch-code="CH-14803"]')).toBeNull();
    await act(async () => save.resolve({ success: true }));
    await waitFor(() => expect(document.querySelector('p[data-ch-code="CH-14803"]')?.textContent).toBe('Mason Reilly is now Committed'));
    expect(document.querySelector('p[data-ch-code="CH-14803"]')?.getAttribute('role')).toBe('status');
    expect(hapticSpy).toHaveBeenCalledWith('success');
    // A picked stage is the most recently updated.
    expect(rowNames()[0]).toBe('Mason Reilly');
  });

  it('CH-14003 CH-14909 CH-14911 a stage that does not save goes back, says so with Retry, and Retry moves it again and puts it back again if it fails again', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.update.mockImplementation(() => fail('Failed to update recruit'));
    wrap(PREVIEW_RECRUITING, w);
    await user.click(within(panel('Mason Reilly')).getByRole('radio', { name: 'Committed' }));
    await expectCode('CH-14003', /Couldn't move Mason Reilly to Committed/);
    expect(code('CH-14003')!.textContent).toMatch(/Failed to update recruit\./);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    // Back where they were, everywhere.
    expect(stageOf('Mason Reilly')).toBe('Offered');
    expect(screen.getByRole('button', { name: 'Offered, 1 prospect' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Committed, 1 prospect' })).toBeTruthy();
    expect(within(panel('Mason Reilly')).getByRole('radio', { name: 'Offered' }).getAttribute('aria-checked')).toBe('true');
    expect(within(panel('Mason Reilly')).getByText('Added Aug 12 · Updated 2 days ago')).toBeTruthy();
    expect(report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'recruiting.stage' }));
    // Retry: the same move, through the same action.
    w.update.mockImplementation(() => ok());
    await user.click(within(code('CH-14003') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(stageOf('Mason Reilly')).toBe('Committed'));
    expect(w.update).toHaveBeenCalledTimes(2);
    expect(w.update).toHaveBeenLastCalledWith('p-mason', { status: 'committed' });
  });

  it('CH-14003 a retry that fails again puts the prospect back again, and a write that throws is undone too', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.update.mockImplementation(() => fail());
    wrap(PREVIEW_RECRUITING, w);
    await user.click(within(panel('Mason Reilly')).getByRole('radio', { name: 'Watched' }));
    await expectCode('CH-14003');
    await user.click(within(code('CH-14003') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(w.update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(stageOf('Mason Reilly')).toBe('Offered'));
    w.update.mockImplementation(() => Promise.reject(new Error('network down')));
    await user.click(within(panel('Mason Reilly')).getByRole('radio', { name: 'Recruiting' }));
    await waitFor(() => expect(w.update).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(stageOf('Mason Reilly')).toBe('Offered'));
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'network down' }), expect.objectContaining({ action: 'recruiting.stage' }));
    await waitFor(() => expect(codes('CH-14003').map((t) => t.textContent).join(' ')).toMatch(/Couldn't move Mason Reilly to Recruiting/));
  });

  it('CH-14901 offline a stage change is refused before it moves anything: the shell says so, nothing is sent and nothing has to be put back', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await user.click(within(panel('Mason Reilly')).getByRole('radio', { name: 'Committed' }));
    await expectCode('CH-1903', /Couldn't move Mason Reilly to Committed: you're offline/);
    expect(w.update).not.toHaveBeenCalled();
    expect(stageOf('Mason Reilly')).toBe('Offered');
    // Back online, Retry does it.
    online.mockRestore();
    await user.click(within(code('CH-1903') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(stageOf('Mason Reilly')).toBe('Committed'));
  });

  it('CH-14913 CH-14803 arrow keys move the stage, and each move is saved', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    within(panel('Mason Reilly')).getByRole('radio', { name: 'Offered' }).focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(w.update).toHaveBeenCalledWith('p-mason', { status: 'committed' }));
    await waitFor(() => expect(stageOf('Mason Reilly')).toBe('Committed'));
  });

  // ── Delete, and the question first ─────────────────────────────────────────

  it('CH-14501 CH-14702 CH-14907 CH-14406 delete asks first, with a warning felt before the question; Keep them leaves everything; Delete removes the prospect and opens the next', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await user.click(within(panel('Mason Reilly')).getByRole('button', { name: 'Delete prospect' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(code('CH-14501')?.textContent).toMatch(/Delete Mason Reilly\?.*This removes them from your list, with their notes and documents\. This can't be undone\./);
    expect(w.remove).not.toHaveBeenCalled();
    await user.click(within(dlg()).getByRole('button', { name: 'Keep them' }));
    expect(w.remove).not.toHaveBeenCalled();
    expect(rowNames()).toHaveLength(8);
    // Delete, answered slowly: "Deleting" and nothing can be double-tapped.
    const slow = deferred<{ success: boolean }>();
    w.remove.mockReturnValue(slow.promise);
    await user.click(within(panel('Mason Reilly')).getByRole('button', { name: 'Delete prospect' }));
    await user.click(within(dlg()).getByRole('button', { name: 'Delete prospect' }));
    expect(code('CH-14406')?.textContent).toBe('Deleting');
    expect((within(dlg()).getByRole('button', { name: 'Deleting' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => slow.resolve({ success: true }));
    await waitFor(() => expect(rowNames()).toHaveLength(7));
    expect(w.remove).toHaveBeenCalledTimes(1);
    expect(w.remove).toHaveBeenCalledWith('p-mason');
    expect(rowNames()).not.toContain('Mason Reilly');
    await expectCode('CH-14907', /Mason Reilly deleted/);
    // The counts follow and the next prospect opens.
    expect(screen.getByText('7 prospects · 1 committed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Offered, 0 prospects' })).toBeTruthy();
    expect(panel('Caleb Nguyen')).toBeTruthy();
  });

  it('CH-14004 a delete that fails keeps the prospect and the question, and says so with Retry', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.remove.mockImplementation(() => fail());
    wrap(PREVIEW_RECRUITING, w);
    await user.click(within(panel('Mason Reilly')).getByRole('button', { name: 'Delete prospect' }));
    await user.click(within(dlg()).getByRole('button', { name: 'Delete prospect' }));
    await expectCode('CH-14004', /Couldn't delete Mason Reilly/);
    expect(code('CH-14501')).not.toBeNull();
    expect(rowNames()).toHaveLength(8);
    w.remove.mockImplementation(() => ok());
    await user.click(within(code('CH-14004') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(rowNames()).toHaveLength(7));
    expect(w.remove).toHaveBeenCalledTimes(2);
  });

  // ── Add and edit ───────────────────────────────────────────────────────────

  it('CH-14101 CH-14102 CH-14103 CH-14104 CH-14804 a refused save names each problem beside its field, focuses the first, and sends nothing', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await user.click(screen.getByRole('button', { name: 'Add prospect' }));
    const form = within(dlg());
    await user.click(form.getByRole('button', { name: 'Add prospect' }));
    const first = form.getByRole('textbox', { name: 'First name' });
    expect(first.getAttribute('aria-invalid')).toBe('true');
    expect(form.getByText('Add a first name.').getAttribute('role')).toBe('alert');
    expect(form.getByText('Add a first name.').getAttribute('data-ch-code')).toBe('CH-14101');
    expect(first.getAttribute('aria-describedby')).toBe(form.getByText('Add a first name.').id);
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(w.create).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    // The other refusals, all at once, in the order of the form.
    await user.type(first, 'Ellie');
    await user.type(form.getByRole('textbox', { name: 'State' }), 'n');
    await user.type(form.getByRole('textbox', { name: 'Class of' }), '1999');
    await user.click(form.getByRole('textbox', { name: 'Notes' }));
    await user.paste('x'.repeat(FIELD_LIMITS.notes + 1));
    await user.click(form.getByRole('button', { name: 'Add prospect' }));
    expect(form.getByText('Use the two-letter state code, like NC.').getAttribute('data-ch-code')).toBe('CH-14103');
    expect(form.getByText('Class year is a four-digit year from 2020 to 2040.').getAttribute('data-ch-code')).toBe('CH-14102');
    expect(form.getByText('Notes is too long (5,000 characters at most).').getAttribute('data-ch-code')).toBe('CH-14104');
    expect(form.queryByText('Add a first name.')).toBeNull();
    expect(w.create).not.toHaveBeenCalled();
    // A refusal goes away as it is fixed.
    await user.clear(form.getByRole('textbox', { name: 'State' }));
    await user.type(form.getByRole('textbox', { name: 'State' }), 'nc');
    expect(form.queryByText('Use the two-letter state code, like NC.')).toBeNull();
    expect((form.getByRole('textbox', { name: 'State' }) as HTMLInputElement).value).toBe('NC');
  });

  it('CH-14905 CH-14913 a prospect is added with Enter or the button: only a first name is required, the stage starts at Watched, and they are in the list and open', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await user.click(screen.getByRole('button', { name: 'Add prospect' }));
    const form = within(dlg());
    expect(form.getByRole('radio', { name: 'Watched' }).getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(form.getByRole('textbox', { name: 'First name' })));
    await user.type(form.getByRole('textbox', { name: 'First name' }), 'Ellie');
    await user.type(form.getByRole('textbox', { name: 'Last name' }), 'Morrow');
    await user.type(form.getByRole('textbox', { name: 'Hometown' }), 'Wilmington');
    await user.type(form.getByRole('textbox', { name: 'State' }), 'nc');
    await user.type(form.getByRole('textbox', { name: 'Class of' }), '2028');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(w.create).toHaveBeenCalledTimes(1));
    expect(w.create).toHaveBeenCalledWith({ first_name: 'Ellie', last_name: 'Morrow', hs_class: 2028, email: '', phone: '', hometown: 'Wilmington', state: 'NC', notes: '', status: 'watched' }, expect.any(String));
    await expectCode('CH-14905', /Ellie Morrow added/);
    expect(hapticSpy).toHaveBeenCalledWith('success');
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
    expect(rowNames()[0]).toBe('Ellie Morrow');
    expect(panel('Ellie Morrow')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Watched, 4 prospects' })).toBeTruthy();
    expect(screen.getByText('9 prospects · 1 committed')).toBeTruthy();
  });

  it('CH-14905 a prospect the stage filter or the search would hide is shown anyway after it is added', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_RECRUITING, fakeWrites(), { stage: 'offered', query: 'mason' });
    await user.click(screen.getByRole('button', { name: 'Add prospect' }));
    await user.type(within(dlg()).getByRole('textbox', { name: 'First name' }), 'Ellie');
    await user.click(within(dlg()).getByRole('button', { name: 'Add prospect' }));
    await waitFor(() => expect(rowNames()[0]).toBe('Ellie'));
    expect(rowNames()).toHaveLength(9);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });

  it('CH-14001 CH-14403 CH-14910 CH-14911 an add that fails says so with Retry and leaves the dialog open with what was typed; while it runs the button says Saving', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    const answer = deferred<{ success: boolean; error?: string }>();
    w.create.mockReturnValue(answer.promise as never);
    wrap(PREVIEW_RECRUITING, w);
    await user.click(screen.getByRole('button', { name: 'Add prospect' }));
    await user.type(within(dlg()).getByRole('textbox', { name: 'First name' }), 'Ellie');
    await user.type(within(dlg()).getByRole('textbox', { name: 'Hometown' }), 'Wilmington');
    await user.click(within(dlg()).getByRole('button', { name: 'Add prospect' }));
    expect(code('CH-14403')?.textContent).toBe('Saving');
    expect((within(dlg()).getByRole('button', { name: 'Saving' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => answer.resolve({ success: false, error: 'Failed to add recruit' }));
    await expectCode('CH-14001', /Couldn't add Ellie.*Failed to add recruit\./);
    expect((within(dlg()).getByRole('textbox', { name: 'First name' }) as HTMLInputElement).value).toBe('Ellie');
    expect((within(dlg()).getByRole('textbox', { name: 'Hometown' }) as HTMLInputElement).value).toBe('Wilmington');
    expect(rowNames()).toHaveLength(8);
    w.create.mockImplementation(() => ok({ id: 'new-2' }));
    await user.click(within(code('CH-14001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(rowNames()).toHaveLength(9));
    expect(w.create).toHaveBeenCalledTimes(2);
    expect(w.create).toHaveBeenLastCalledWith(expect.objectContaining({ first_name: 'Ellie', hometown: 'Wilmington' }), expect.any(String));
  });

  it('CH-14906 Edit opens the form on the prospect as they are; Save sends everything, updates the row, the panel and the list, and says so', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await user.click(within(panel('Mason Reilly')).getByRole('button', { name: 'Edit' }));
    const form = within(dlg());
    expect(form.getByText('Edit prospect')).toBeTruthy();
    expect((form.getByRole('textbox', { name: 'First name' }) as HTMLInputElement).value).toBe('Mason');
    expect((form.getByRole('textbox', { name: 'Email' }) as HTMLInputElement).value).toBe('mason.reilly@example.com');
    expect((form.getByRole('textbox', { name: 'Class of' }) as HTMLInputElement).value).toBe('2027');
    expect(form.getByRole('radio', { name: 'Offered' }).getAttribute('aria-checked')).toBe('true');
    const hometown = form.getByRole('textbox', { name: 'Hometown' });
    await user.clear(hometown);
    await user.type(hometown, 'Raleigh');
    await user.clear(form.getByRole('textbox', { name: 'Phone' }));
    await user.click(form.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(w.update).toHaveBeenCalledTimes(1));
    expect(w.update).toHaveBeenCalledWith('p-mason', {
      first_name: 'Mason',
      last_name: 'Reilly',
      hs_class: 2027,
      email: 'mason.reilly@example.com',
      phone: '',
      hometown: 'Raleigh',
      state: 'NC',
      notes: expect.stringContaining('Carolinas Junior'),
      status: 'offered',
    });
    await expectCode('CH-14906', /Mason Reilly saved/);
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
    const p = panel('Mason Reilly');
    expect(within(p).getByText('Class of 2027 · Raleigh, NC')).toBeTruthy();
    // The phone number is gone, so there is no Call link, and the email is still a link.
    expect(within(p).queryByRole('link', { name: /Call/ })).toBeNull();
    expect(within(p).getByRole('link', { name: /Email/ })).toBeTruthy();
  });

  it('CH-14002 CH-14910 a save that fails says so with Retry and the form keeps what was typed; the list and the panel are unchanged', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.update.mockImplementation(() => fail('Failed to update recruit'));
    wrap(PREVIEW_RECRUITING, w);
    await user.click(within(panel('Mason Reilly')).getByRole('button', { name: 'Edit' }));
    const hometown = within(dlg()).getByRole('textbox', { name: 'Hometown' });
    await user.clear(hometown);
    await user.type(hometown, 'Raleigh');
    await user.click(within(dlg()).getByRole('button', { name: 'Save changes' }));
    await expectCode('CH-14002', /Couldn't save Mason Reilly's changes.*Failed to update recruit\./);
    expect((within(dlg()).getByRole('textbox', { name: 'Hometown' }) as HTMLInputElement).value).toBe('Raleigh');
    expect(within(panel('Mason Reilly')).getByText('Class of 2027 · Charlotte, NC')).toBeTruthy();
    w.update.mockImplementation(() => ok());
    await user.click(within(code('CH-14002') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
    expect(within(panel('Mason Reilly')).getByText('Class of 2027 · Raleigh, NC')).toBeTruthy();
  });

  // ── Documents ──────────────────────────────────────────────────────────────

  it('CH-14402 the documents are read when a prospect opens, with a busy placeholder first; the rows carry their category', async () => {
    const w = fakeWrites();
    const slow = deferred<{ success: boolean; data: unknown[] }>();
    w.documents.list.mockReturnValue(slow.promise as never);
    wrap(PREVIEW_RECRUITING, w);
    expect(code('CH-14402')?.getAttribute('aria-busy')).toBe('true');
    expect(w.documents.list).toHaveBeenCalledWith('p-mason');
    await act(async () => slow.resolve({ success: true, data: PREVIEW_DOCUMENTS['p-mason']!.map((d) => ({ ...d })) }));
    const p = panel('Mason Reilly');
    await within(p).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    expect(code('CH-14402')).toBeNull();
    expect(within(p).getByRole('button', { name: /^Transcript, junior year\.pdf/ })).toBeTruthy();
    expect(within(p).getByRole('button', { name: /^Swing, down the line\.mov/ })).toBeTruthy();
    expect(within(p).getByText('Private to your staff. Files open through a link that expires.')).toBeTruthy();
  });

  it('CH-14202 CH-14911 documents that do not load say so in their own section, with Try again; the rest of the prospect still works', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.documents.list.mockImplementation(() => fail('Failed to load documents'));
    wrap(PREVIEW_RECRUITING, w);
    await expectCode('CH-14202', /Documents didn't load.*Nothing is lost/);
    expect(within(panel('Mason Reilly')).getByText(/Saw Mason at the Carolinas Junior/)).toBeTruthy();
    expect(code('CH-14305')).toBeNull();
    w.documents.list.mockImplementation((id: string) => ok((PREVIEW_DOCUMENTS[id] ?? []).map((d) => ({ ...d }))));
    await user.click(within(code('CH-14202') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    expect(code('CH-14202')).toBeNull();
    expect(w.documents.list).toHaveBeenCalledTimes(2);
  });

  it('opening a prospect and then another never leaves the first one\'s documents on the second', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    await user.click(within(screen.getByRole('table')).getByRole('button', { name: /^Caleb Nguyen/ }));
    await expectCode('CH-14305');
    expect(screen.queryByText('Fall tournament schedule.pdf')).toBeNull();
    expect(w.documents.list).toHaveBeenLastCalledWith('p-caleb');
  });

  it('CH-14007 a document opens through a link that expires; one that cannot be opened says so with Retry', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    const row = await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    await user.click(row);
    await waitFor(() => expect(w.documents.open).toHaveBeenCalledWith(expect.objectContaining({ id: 'd-1', title: 'Fall tournament schedule.pdf' })));
    expect(code('CH-14007')).toBeNull();
    w.documents.open.mockImplementation(() => fail('Failed to open document'));
    await user.click(row);
    await expectCode('CH-14007', /Couldn't open Fall tournament schedule\.pdf.*Failed to open document\./);
  });

  it('CH-14502 CH-14405 CH-14908 CH-14006 removing a document asks first; the list is read again, inside the action, so a failed first try can be retried to the end', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    await user.click(within(panel('Mason Reilly')).getByRole('button', { name: 'Remove Fall tournament schedule.pdf' }));
    expect(code('CH-14502')?.textContent).toMatch(/Remove this document\?.*Fall tournament schedule\.pdf is deleted from Mason's documents\. This can't be undone\./);
    expect(w.documents.remove).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    w.documents.remove.mockImplementation(() => fail('Failed to delete document'));
    await user.click(within(dlg()).getByRole('button', { name: 'Remove document' }));
    await expectCode('CH-14006', /Couldn't remove Fall tournament schedule\.pdf.*Failed to delete document\./);
    expect(code('CH-14502')).not.toBeNull();
    // Retry: it lands, the question closes, the list is read again without the file.
    w.documents.remove.mockImplementation(() => ok());
    w.documents.list.mockImplementation(() => ok(PREVIEW_DOCUMENTS['p-mason']!.slice(1).map((d) => ({ ...d }))));
    const slow = deferred<{ success: boolean }>();
    w.documents.remove.mockReturnValueOnce(slow.promise as never);
    await user.click(within(code('CH-14006') as HTMLElement).getByRole('button', { name: 'Retry' }));
    expect(code('CH-14405')?.textContent).toBe('Removing');
    await act(async () => slow.resolve({ success: true }));
    await waitFor(() => expect(screen.queryByText('Fall tournament schedule.pdf')).toBeNull());
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(w.documents.remove).toHaveBeenCalledWith('d-1');
    await expectCode('CH-14908', /Fall tournament schedule\.pdf removed/);
    expect(within(panel('Mason Reilly')).getByRole('button', { name: /^Transcript, junior year\.pdf/ })).toBeTruthy();
  });

  it('CH-14908 CH-14404 a document is uploaded with its title and category, the list is read again, and the dialog closes', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    const file = new File(['%PDF'], 'Spring transcript.pdf', { type: 'application/pdf' });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    const d = within(dlg());
    expect(d.getByText('Add a document')).toBeTruthy();
    expect(dlg().textContent).toContain('Spring transcript.pdf');
    const title = d.getByRole('textbox', { name: 'Title' }) as HTMLInputElement;
    expect(title.value).toBe('Spring transcript');
    await user.clear(title);
    await user.type(title, 'Spring transcript, junior');
    await user.click(d.getByRole('button', { name: 'Transcript' }));
    const slow = deferred<{ success: boolean; data: { id: string } }>();
    w.documents.upload.mockReturnValue(slow.promise as never);
    await user.click(d.getByRole('button', { name: 'Upload' }));
    expect(code('CH-14404')?.textContent).toBe('Uploading');
    w.documents.list.mockImplementation(() => ok([{ ...PREVIEW_DOCUMENTS['p-mason']![0]!, id: 'd-new', title: 'Spring transcript, junior', category: 'transcript' }, ...PREVIEW_DOCUMENTS['p-mason']!.map((x) => ({ ...x }))]));
    await act(async () => slow.resolve({ success: true, data: { id: 'd-new' } }));
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
    expect(w.documents.upload).toHaveBeenCalledWith('p-mason', file, { title: 'Spring transcript, junior', category: 'transcript' }, { uploadId: expect.any(String), onProgress: expect.any(Function) });
    await expectCode('CH-14908', /Spring transcript, junior added/);
    expect(await within(panel('Mason Reilly')).findByRole('button', { name: /^Spring transcript, junior/ })).toBeTruthy();
  });

  it('CH-14005 CH-14903 CH-14910 an upload the server refuses says why in its own words, with Retry, and keeps the dialog and what was chosen', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.documents.upload.mockImplementation(() => fail("Only this team's coaches can add recruit documents"));
    wrap(PREVIEW_RECRUITING, w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'Film notes.txt', { type: 'text/plain' }));
    await user.click(within(dlg()).getByRole('button', { name: 'Film' }));
    await user.click(within(dlg()).getByRole('button', { name: 'Upload' }));
    await expectCode('CH-14005', /Couldn't upload Film notes/);
    // The server's sentence is the reason (a refusal for someone who is not the team's coach).
    expect(code('CH-14005')!.textContent).toContain("Only this team's coaches can add recruit documents.");
    expect(dlg()).not.toBeNull();
    expect(within(dlg()).getByRole('button', { name: 'Film' }).getAttribute('aria-pressed')).toBe('true');
    expect((within(dlg()).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Film notes');
    expect(w.documents.list).toHaveBeenCalledTimes(1);
    w.documents.upload.mockImplementation(() => ok({ id: 'd-x' }));
    await user.click(within(code('CH-14005') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(w.documents.upload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
    expect(w.documents.list).toHaveBeenCalledTimes(2);
  });

  it('CH-14005 an upload that throws is reported and says so too', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.documents.upload.mockImplementation(() => Promise.reject(new Error('body too large')));
    wrap(PREVIEW_RECRUITING, w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await user.click(within(dlg()).getByRole('button', { name: 'Upload' }));
    await expectCode('CH-14005', /Couldn't upload a.*Check your connection and try again\./);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'body too large' }), expect.objectContaining({ action: 'recruiting.upload' }));
  });

  it('CH-14105 CH-14106 a file over 25 MB or of a type the bucket does not take is refused in the dialog before anything is sent', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    const big = new File(['x'], 'Whole season.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, big);
    expect(code('CH-14105')?.textContent).toMatch(/That file is over 25 MB.*Choose a smaller file/);
    expect(within(dlg()).queryByRole('button', { name: 'Upload' })).toBeNull();
    await user.click(within(dlg()).getByRole('button', { name: 'Cancel' }));
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'Swing.avi', { type: 'video/x-msvideo' }));
    expect(code('CH-14106')?.textContent).toMatch(/We can't take that file type.*Use a PDF, an image.*MP4, MOV or M4V/);
    expect(w.documents.upload).not.toHaveBeenCalled();
    await user.click(within(dlg()).getByRole('button', { name: 'Choose another file' }));
  });
});

/** Recruiting sends nothing from GolfHelm: Email and Call are links, so no write is ever called for them. */
function actionsTouched() {
  return Object.values(actions).some((f) => f.mock.calls.length > 0);
}

// ── Phone ────────────────────────────────────────────────────────────────────

describe('Recruiting · phone', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 820px)',
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;
    window.history.replaceState(null, '', '/golf/dashboard/recruiting');
    router.back.mockClear();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, '', '/');
  });
  const top = () => within(screen.getByTestId('phone-top'));
  const detail = () => document.querySelector('section.ch-recm-screen') as HTMLElement | null;
  const names = () => within(screen.getByRole('list')).getAllByRole('button').map((b) => b.querySelector('b')!.textContent);

  it('CH-14914 CH-14904 the phone opens as the board does: "‹ More", the title, Add, search, the compact timeline, the count with its sort, and rows', async () => {
    const user = userEvent.setup();
    wrap();
    expect(code('CH-14904')?.tagName).toBe('MAIN');
    expect(top().getByRole('heading', { level: 1, name: 'Recruiting' })).toBeTruthy();
    await user.click(top().getByRole('button', { name: 'Back to More' }));
    expect(router.back.mock.calls.length + router.push.mock.calls.length).toBeGreaterThan(0);
    expect(top().getByRole('button', { name: 'Add prospect' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search prospects' })).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Filter by stage' });
    expect(within(group).getByRole('button', { name: 'Watched, 3 prospects' })).toBeTruthy();
    // The compact timeline has no blurbs and no shares.
    expect(group.textContent).not.toContain('% of list');
    expect(screen.getByText('8 prospects')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Recently updated/ })).toBeTruthy();
    expect(names()).toEqual(['Mason Reilly', 'Caleb Nguyen', 'Lila Brennan', 'Hannah Duarte', 'Maya Castillo', 'Owen Park', 'Jack Whitfield', 'Ben Adler']);
    expect(screen.getByRole('list').getAttribute('data-ch-code')).toBe('CH-14802');
    expect(within(screen.getByRole('list')).getByRole('button', { name: /Mason Reilly.*2027 · Charlotte, NC.*Offered/ })).toBeTruthy();
    // No table, and no panel, on the phone: a prospect opens as a pushed screen.
    expect(screen.queryByRole('table')).toBeNull();
    expect(detail()).toBeNull();
  });

  it('the sort menu re-orders the list and ticks the choice', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('button', { name: /Recently updated/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Name' }));
    expect(names()[0]).toBe('Ben Adler');
    expect(screen.getByRole('button', { name: /^Name/ })).toBeTruthy();
  });

  it('CH-14602 CH-1906 a prospect is a pushed screen with Stage, Email and Call tiles, notes and documents; "‹ Recruiting" and the back gesture pop it', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(within(screen.getByRole('list')).getByRole('button', { name: /^Mason Reilly/ }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    const d = within(detail()!);
    expect(detail()!.getAttribute('data-ch-code')).toBe('CH-14602');
    expect((window.history.state as { chPhone?: number } | null)?.chPhone).toBe(1);
    expect(d.getAllByText('Mason Reilly').length).toBeGreaterThanOrEqual(1);
    expect(d.getByText('Class of 2027 · Charlotte, NC')).toBeTruthy();
    expect(d.getByRole('button', { name: /Offered/ })).toBeTruthy();
    expect(d.getByRole('link', { name: 'Email' }).getAttribute('href')).toBe('mailto:mason.reilly@example.com');
    expect(d.getByRole('link', { name: 'Call' }).getAttribute('href')).toBe('tel:5550104418');
    expect(d.getByText(/Saw Mason at the Carolinas Junior/)).toBeTruthy();
    expect(await d.findByRole('button', { name: /^Fall tournament schedule\.pdf/ })).toBeTruthy();
    expect(d.getByText('Added Aug 12 · Updated 2 days ago')).toBeTruthy();
    expect(d.getByRole('button', { name: 'Edit' })).toBeTruthy();
    await user.click(d.getByRole('button', { name: 'Back to Recruiting' }));
    await waitFor(() => expect(detail()).toBeNull());
  });

  it('CH-14303 CH-14304 CH-14305 a prospect with nothing yet shows the Stage row and the three empty rows, without the headings that would say it twice', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(within(screen.getByRole('list')).getByRole('button', { name: /^Owen Park/ }));
    const d = within(detail()!);
    expect(d.getByRole('button', { name: /Stage\s*Watched/ })).toBeTruthy();
    expect(d.queryByRole('link', { name: 'Email' })).toBeNull();
    expect(d.getByText('No contact details yet')).toBeTruthy();
    expect(d.getByText('Add an email or phone number to reach Owen or their family from here.')).toBeTruthy();
    expect(d.getByText('No notes yet')).toBeTruthy();
    await expectCode('CH-14305');
    expect(d.getByText('Added Sep 12')).toBeTruthy();
  });

  it('CH-14003 CH-14909 the stage sheet saves as you pick, ticks the new stage, and Done closes it; a pick that fails goes back', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await user.click(within(screen.getByRole('list')).getByRole('button', { name: /^Mason Reilly/ }));
    await user.click(within(detail()!).getByRole('button', { name: /Offered/ }));
    const sheet = within(dlg());
    expect(sheet.getByRole('heading', { name: 'Stage' })).toBeTruthy();
    expect(sheet.getByText('Saves as soon as you pick. Players never see this.')).toBeTruthy();
    expect(sheet.getByRole('radio', { name: /Offered/ }).getAttribute('aria-checked')).toBe('true');
    await user.click(sheet.getByRole('radio', { name: /Committed/ }));
    await waitFor(() => expect(w.update).toHaveBeenCalledWith('p-mason', { status: 'committed' }));
    await waitFor(() => expect(sheet.getByRole('radio', { name: /Committed/ }).getAttribute('aria-checked')).toBe('true'));
    // A pick that fails goes back, with the toast inside the sheet.
    w.update.mockImplementation(() => fail('Failed to update recruit'));
    await user.click(sheet.getByRole('radio', { name: /Watched/ }));
    await expectCode('CH-14003', /Couldn't move Mason Reilly to Watched/);
    await waitFor(() => expect(sheet.getByRole('radio', { name: /Committed/ }).getAttribute('aria-checked')).toBe('true'));
    await user.click(sheet.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
    // Arrow keys move the pick too.
    await user.click(within(detail()!).getByRole('button', { name: /Committed/ }));
    const radio = within(dlg()).getByRole('radio', { name: /Committed/ });
    radio.focus();
    w.update.mockImplementation(() => ok());
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(w.update).toHaveBeenLastCalledWith('p-mason', { status: 'offered' }));
  });

  it('CH-14906 CH-14501 CH-14004 the edit sheet is Cancel, Prospect and Save, and Delete prospect there opens the action sheet; confirming deletes and closes both', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await user.click(within(screen.getByRole('list')).getByRole('button', { name: /^Mason Reilly/ }));
    await user.click(within(detail()!).getByRole('button', { name: 'Edit' }));
    const sheet = within(dlg());
    expect(sheet.getByRole('heading', { name: 'Prospect' })).toBeTruthy();
    expect(sheet.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect((sheet.getByRole('textbox', { name: 'Hometown' }) as HTMLInputElement).value).toBe('Charlotte');
    // The sheet is the form: no form inside a form, and no stage row on an edit (the Stage tile does that).
    expect(dlg().querySelectorAll('form')).toHaveLength(1);
    expect(sheet.queryByRole('radiogroup', { name: 'Stage' })).toBeNull();
    const hometown = sheet.getByRole('textbox', { name: 'Hometown' });
    await user.clear(hometown);
    await user.type(hometown, 'Raleigh');
    await user.click(sheet.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(w.update).toHaveBeenCalledWith('p-mason', expect.objectContaining({ hometown: 'Raleigh', status: 'offered' })));
    await waitFor(() => expect(within(detail()!).getByText('Class of 2027 · Raleigh, NC')).toBeTruthy());
    // Delete: an action sheet, red choice, Cancel apart; nothing is sent until it is chosen.
    await user.click(within(detail()!).getByRole('button', { name: 'Edit' }));
    await user.click(within(dlg()).getByRole('button', { name: 'Delete prospect' }));
    const act1 = document.querySelectorAll('dialog[open]');
    const actionSheet = within(act1[act1.length - 1] as HTMLElement);
    expect(code('CH-14501')?.textContent).toMatch(/Delete Mason Reilly\?.*can't be undone/);
    expect(w.remove).not.toHaveBeenCalled();
    w.remove.mockImplementation(() => fail());
    await user.click(actionSheet.getByRole('button', { name: 'Delete prospect' }));
    await expectCode('CH-14004', /Couldn't delete Mason Reilly/);
    expect(detail()).not.toBeNull();
    w.remove.mockImplementation(() => ok());
    await user.click(within(code('CH-14004') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(w.remove).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(detail()).toBeNull());
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
    expect(names()).not.toContain('Mason Reilly');
  });

  it('Add prospect opens the new-prospect sheet with its stage row (Watched), and a saved prospect opens as a pushed screen', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(PREVIEW_RECRUITING, w);
    await user.click(top().getByRole('button', { name: 'Add prospect' }));
    const sheet = within(dlg());
    expect(sheet.getByRole('heading', { name: 'New prospect' })).toBeTruthy();
    expect(sheet.getByRole('radio', { name: 'Watched' }).getAttribute('aria-checked')).toBe('true');
    await user.click(sheet.getByRole('button', { name: 'Add' }));
    expect(sheet.getByText('Add a first name.').getAttribute('data-ch-code')).toBe('CH-14101');
    await user.type(sheet.getByRole('textbox', { name: 'First name' }), 'Ellie');
    await user.click(sheet.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(w.create).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Ellie', status: 'watched' }), expect.any(String)));
    await waitFor(() => expect(detail()).not.toBeNull());
    expect(within(detail()!).getAllByText('Ellie').length).toBeGreaterThanOrEqual(1);
  });

  it('CH-14302 no match on the phone reads "No match for", with Search all stages first and Clear search after it', async () => {
    const user = userEvent.setup();
    wrap(PREVIEW_RECRUITING, fakeWrites(), { query: 'Tampa', stage: 'offered', openId: 'p-owen' });
    expect(code('CH-14302')?.textContent).toContain('No match for "Tampa" in Offered');
    expect(code('CH-14302')?.textContent).toContain('Try another word, or look across every stage.');
    const buttons = within(code('CH-14302') as HTMLElement).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Search all stages', 'Clear search']);
    expect(detail()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Search all stages' }));
    expect(code('CH-14302')?.textContent).toContain('No match for "Tampa"');
    expect(code('CH-14302')?.textContent).not.toContain('in Offered');
  });

  it('CH-14301 CH-14201 first run and a failed read have no Add in the top bar: the page\'s own action is the way in', async () => {
    const user = userEvent.setup();
    const first = wrap(PREVIEW_RECRUITING_EMPTY);
    expect(code('CH-14301')?.textContent).toContain('Add the golfers you\'re watching and move them through Watched, Recruiting, Offered and Committed.');
    expect(top().queryByRole('button', { name: 'Add prospect' })).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add your first prospect' }));
    expect(within(dlg()).getByRole('heading', { name: 'New prospect' })).toBeTruthy();
    first.unmount();
    wrap(PREVIEW_RECRUITING_FAILED);
    expect(code('CH-14201')?.textContent).toContain('Nothing was lost. Check your connection and try again.');
    expect(top().queryByRole('button', { name: 'Add prospect' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });
});
