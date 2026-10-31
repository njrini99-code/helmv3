import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChClassBlock, ChClassDay, ChClassDayPlayer } from '../data/class-day-shape';
import { classStatusFor, classStatusText } from '../data/class-status';

/** P-10 Notify anyway, the group line and the Details block: CH-7270, CH-7272, CH-7273, CH-7370, CH-7770 and CH-7870. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const layout = vi.hoisted(() => ({ phone: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => layout.phone, CH_PHONE_QUERY: '(max-width: 820px)' }));
vi.mock('../lib/use-clock', () => ({ useChClock: () => '12' }));

import { isNotifyChord, notifyChordLabel, sendNotify } from '../screens/messages/notify-anyway';
import { groupClass, groupClassLine } from '../screens/messages/group-class';
import { directClassPlayer, threadClassSection, type ChThreadClassDay } from '../screens/messages/class-thread';
import { SendCluster } from '../screens/messages/NotifyAnyway';
import { GroupClassLine } from '../screens/messages/GroupClassLine';
import { ThreadClassSection } from '../screens/messages/ThreadClassSection';
import { Composer, type ChMessagesApi } from '../screens/messages/MessagesView';
import { ToastProvider } from '../ui/Toast';
import type { ChConv, ChPerson } from '../screens/messages/model';

const z = (hhmm: string) => `2026-10-26T${hhmm}:00.000Z`;
const at = (hhmm: string) => Date.parse(z(hhmm));
const block = (from: string, to: string, label = 'STAT 201 - Probability'): ChClassBlock => ({ classId: 'c', label, kind: 'class', source: 'pattern', startsAt: z(from), endsAt: z(to) });
const player = (id: string, over: Partial<ChClassDayPlayer> = {}): ChClassDayPlayer => ({ playerId: id, firstName: id, lastName: 'Park', avatarUrl: null, tracked: true, holds: true, onCourse: false, offToday: false, away: null, blocks: [block('13:30', '15:50')], ...over });
const day = (players: ChClassDayPlayer[]): ChClassDay => ({ on: '2026-10-26', teamTimeZone: 'America/New_York', classTimeZone: 'America/New_York', term: null, nextTerm: null, players, fetchedAt: 0 });
const conv = (over: Partial<ChConv> = {}): ChConv => ({ id: 'c1', group: false, title: 'Theo Park', subtitle: 'Senior', memberIds: ['u-theo'], memberCount: 2, unread: 0, lastAt: null, lastSenderId: null, lastText: '', creatorId: null, ...over });
const person = (id: string, name: string, over: Partial<ChPerson> = {}): ChPerson => ({ userId: `u-${id}`, name, role: 'player', subtitle: 'Senior', playerId: `p-${id}`, ...over });
const THEO = person('theo', 'Theo Park');
const cls = (players: ChClassDayPlayer[], over: Partial<ChThreadClassDay> = {}): ChThreadClassDay => ({ day: day(players), now: at('14:30'), teamId: 't1', convTeamId: 't1', ...over });
const text = (c: ChThreadClassDay, p: ChClassDayPlayer) => classStatusText(classStatusFor(p, c.now!), { clock: '12', teamTz: 'America/New_York', classTz: 'America/New_York' });
const lookup = (people: ChPerson[]) => (id: string) => people.find((p) => p.userId === id);
const words = (c: ChThreadClassDay) => (s: ReturnType<typeof classStatusFor>) => classStatusText(s, { clock: '12', teamTz: c.day!.teamTimeZone, classTz: c.day!.classTimeZone });

beforeEach(() => {
  layout.phone = false;
  hapticSpy.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('sendNotify: when Notify anyway exists', () => {
  const direct = (c: ChThreadClassDay | undefined, v = conv(), people = [THEO]) => sendNotify(c, v, lookup(people), c ? words(c) : () => null);

  it('a 1:1 with a player in class whose pushes are held: the placeholder, the target and the caption', () => {
    const c = cls([player('p-theo')]);
    const n = direct(c)!;
    expect(n.placeholder).toBe('Won’t interrupt Theo in class'.replace('’', "'"));
    expect(n.targets.map((t) => t.playerId)).toEqual(['p-theo']);
    expect(n.caption).toBe(`${text(c, c.day!.players[0]!)} · skips the class hold`);
    expect(n.caption).toBe('In class until 11:50 AM · skips the class hold');
  });

  it('an exam words the placeholder as an exam', () => {
    const c = cls([player('p-theo', { blocks: [{ ...block('13:30', '15:50'), kind: 'exam' }] })]);
    expect(direct(c)!.placeholder).toBe("Won't interrupt Theo in an exam");
  });

  it.each([
    ['no class day (a player, the flag off)', undefined],
    ['pushes not held (the player turned holds off)', cls([player('p-theo', { holds: false })])],
    ['not tracked', cls([player('p-theo', { tracked: false })])],
    ['class only about to start (never changes anything)', cls([player('p-theo')], { now: at('13:20') })],
    ['class already over', cls([player('p-theo')], { now: at('16:30') })],
    ['on the course', cls([player('p-theo', { onCourse: true })])],
    ['a conversation with no team', cls([player('p-theo')], { convTeamId: null })],
    ['a conversation whose team is unknown yet', cls([player('p-theo')], { convTeamId: undefined })],
    ["another team's conversation", cls([player('p-theo')], { convTeamId: 't2' })],
    ['a player not on the coach’s class day', cls([])],
  ])('offers nothing for %s', (_n, c) => {
    expect(direct(c)).toBeNull();
  });

  it('offers nothing when the other side is a coach', () => {
    expect(direct(cls([player('p-theo')]), conv(), [person('theo', 'Theo Park', { role: 'coach', playerId: null })])).toBeNull();
  });

  it('a group counts the recipients who are in class with holds, and has no placeholder', () => {
    const people = [THEO, person('ava', 'Ava Lin'), person('max', 'Max Roe'), person('kim', 'Kim Lee', { role: 'coach', playerId: null })];
    const c = cls([player('p-theo'), player('p-ava'), player('p-max', { holds: false })]);
    const g = sendNotify(c, conv({ group: true, memberIds: people.map((p) => p.userId) }), lookup(people), words(c))!;
    expect(g.placeholder).toBeNull();
    expect(g.targets.map((t) => t.playerId).sort()).toEqual(['p-ava', 'p-theo']);
    expect(g.caption).toBe('2 people here are in class · skips the class hold');
    const one = cls([player('p-theo')]);
    expect(sendNotify(one, conv({ group: true, memberIds: people.map((p) => p.userId) }), lookup(people), words(one))!.caption).toBe('1 person here is in class · skips the class hold');
    const none = cls([player('p-theo', { holds: false })]);
    expect(sendNotify(none, conv({ group: true, memberIds: people.map((p) => p.userId) }), lookup(people), words(none))).toBeNull();
  });
});

describe('the chord', () => {
  it('is Cmd or Ctrl plus Shift plus Enter, and nothing else', () => {
    expect(isNotifyChord({ key: 'Enter', shiftKey: true, metaKey: true, ctrlKey: false })).toBe(true);
    expect(isNotifyChord({ key: 'Enter', shiftKey: true, metaKey: false, ctrlKey: true })).toBe(true);
    expect(isNotifyChord({ key: 'Enter', shiftKey: true, metaKey: false, ctrlKey: false })).toBe(false);
    expect(isNotifyChord({ key: 'Enter', shiftKey: false, metaKey: true, ctrlKey: false })).toBe(false);
    expect(isNotifyChord({ key: 'a', shiftKey: true, metaKey: true, ctrlKey: false })).toBe(false);
    expect(notifyChordLabel(true).menu).toBe('Cmd Shift Enter');
    expect(notifyChordLabel(false).hint).toBe('Ctrl Shift Enter to notify anyway');
  });
});

describe('SendCluster', () => {
  const notify = { placeholder: null, targets: [player('p-theo')], caption: 'In class until 11:50 AM · skips the class hold' };
  const view = (over: Partial<Parameters<typeof SendCluster>[0]> = {}) => {
    const onSend = vi.fn();
    const utils = render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <SendCluster phone={false} ready unconfirmed={false} notify={notify} mac onSend={onSend} {...over} />
        </div>
      </LazyMotion>,
    );
    return { onSend, ...utils };
  };

  it('with nothing to offer it is just the Send button, as it always was', () => {
    const { container } = view({ notify: null });
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    expect(container.querySelector('[data-ch-code]')).toBeNull();
    expect(container.querySelector('.ch-ms-send-split')).toBeNull();
  });

  it('CH-7370 desktop: a chevron beside Send opens one item with the caption and the shortcut; choosing it sends with the flag', async () => {
    const user = userEvent.setup();
    const { onSend } = view();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'More send options' }));
    const item = await screen.findByRole('menuitem', { name: /Send and notify anyway/ });
    expect(item.textContent).toContain('In class until 11:50 AM · skips the class hold');
    expect(item.textContent).toContain('Cmd Shift Enter');
    await user.click(item);
    expect(onSend).toHaveBeenLastCalledWith(true);
  });

  it('desktop on Windows or Linux names Ctrl Shift Enter', async () => {
    const user = userEvent.setup();
    view({ mac: false });
    await user.click(screen.getByRole('button', { name: 'More send options' }));
    expect((await screen.findByRole('menuitem')).textContent).toContain('Ctrl Shift Enter');
  });

  it('the chevron and Send are off while there is nothing to send', () => {
    view({ ready: false });
    expect((screen.getByRole('button', { name: 'More send options' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('no extra control while a retry is pending (unconfirmed)', () => {
    const { container } = view({ unconfirmed: true });
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Retry send' })).toBeTruthy();
  });

  describe('CH-7770 phone: a long press on Send', () => {
    const press = (button: HTMLElement) => fireEvent.pointerDown(button, { pointerType: 'touch', clientX: 10, clientY: 10, button: 0 });

    it('a tap sends normally', () => {
      layout.phone = true;
      const { onSend } = view({ phone: true });
      const send = screen.getByRole('button', { name: 'Send' });
      press(send);
      fireEvent.pointerUp(send);
      fireEvent.click(send);
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith(false);
      expect(hapticSpy).not.toHaveBeenCalledWith('press');
    });

    it('a 450 ms hold opens the menu with the press tick, and the click it ends in never sends', async () => {
      vi.useFakeTimers();
      layout.phone = true;
      const { onSend } = view({ phone: true });
      const send = screen.getByRole('button', { name: 'Send' });
      press(send);
      await act(async () => { vi.advanceTimersByTime(449); });
      expect(screen.queryByRole('menu')).toBeNull();
      await act(async () => { vi.advanceTimersByTime(2); });
      expect(hapticSpy).toHaveBeenCalledWith('press');
      expect(screen.getByRole('menu')).toBeTruthy();
      fireEvent.pointerUp(send);
      fireEvent.click(send);
      expect(onSend).not.toHaveBeenCalled();
      // The next ordinary tap is an ordinary send again.
      fireEvent.click(send);
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('a finger that moves is scrolling, not holding', async () => {
      vi.useFakeTimers();
      layout.phone = true;
      view({ phone: true });
      const send = screen.getByRole('button', { name: 'Send' });
      press(send);
      fireEvent.pointerMove(send, { pointerType: 'touch', clientX: 10, clientY: 40 });
      await act(async () => { vi.advanceTimersByTime(600); });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('the menu item says Notify anyway and sends with the flag', async () => {
      vi.useFakeTimers();
      layout.phone = true;
      const { onSend } = view({ phone: true });
      press(screen.getByRole('button', { name: 'Send' }));
      await act(async () => { vi.advanceTimersByTime(460); });
      const item = screen.getByRole('menuitem', { name: /Notify anyway/ });
      expect(item.textContent).toContain('skips the class hold');
      expect(item.textContent).not.toContain('Cmd Shift');
      fireEvent.click(item);
      expect(onSend).toHaveBeenCalledWith(true);
    });

    it('CH-7870: VoiceOver has a button for the same menu and a spoken hint for the gesture', async () => {
      const user = userEvent.setup();
      layout.phone = true;
      const { onSend } = view({ phone: true });
      const send = screen.getByRole('button', { name: 'Send' });
      expect(send.getAttribute('aria-describedby')).toBeTruthy();
      expect(document.getElementById(send.getAttribute('aria-describedby')!)?.textContent).toBe('Long press for more send options');
      await user.click(screen.getByRole('button', { name: 'More send options' }));
      await user.click(await screen.findByRole('menuitem', { name: /Notify anyway/ }));
      expect(onSend).toHaveBeenCalledWith(true);
    });
  });
});

describe('groupClass and the group line', () => {
  const people = [THEO, person('ava', 'Ava Lin'), person('max', 'Max Roe'), person('kim', 'Kim Lee', { role: 'coach', playerId: null })];
  const group = conv({ group: true, title: 'Varsity', memberIds: people.map((p) => p.userId), memberCount: 5 });

  it('counts players in a class or an exam now; a coach, an untracked player and a finished class do not count', () => {
    const c = cls([player('p-theo'), player('p-ava', { blocks: [block('10:00', '11:00')] }), player('p-max', { tracked: false })]);
    const g = groupClass(c, group, lookup(people))!;
    expect(g.inClass).toBe(1);
    expect(g.total).toBe(3);
    expect(g.noStatus).toBe(1);
    expect(g.day.players.map((p) => p.playerId).sort()).toEqual(['p-ava', 'p-max', 'p-theo']);
    expect(groupClassLine(g)).toBe('1 in class now');
    expect(groupClassLine({ total: 3, inClass: 3 })).toBe('All 3 in class now');
    expect(groupClassLine({ total: 3, inClass: 0 })).toBeNull();
  });

  it.each([
    ['a direct thread', cls([player('p-theo')]), conv()],
    ['no class day', undefined, group],
    ['another team’s group', cls([player('p-theo')], { convTeamId: 't2' }), group],
    ['a group with no team', cls([player('p-theo')], { convTeamId: null }), group],
  ])('is null for %s', (_n, c, v) => {
    expect(groupClass(c, v, lookup(people))).toBeNull();
  });

  const line = (c: ChThreadClassDay) =>
    render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <GroupClassLine cls={c} conv={group} personOf={lookup(people)} />
        </div>
      </LazyMotion>,
    );

  it('CH-7272: a quiet row; no names; the sheet is scoped to the group with a count for the rest', async () => {
    const user = userEvent.setup();
    const c = cls([player('p-theo'), player('p-ava'), player('p-max', { tracked: false })]);
    const { container } = line(c);
    const button = screen.getByRole('button', { name: /2 in class now/ });
    expect(container.textContent).toBe('2 in class now');
    expect(container.textContent).not.toMatch(/Theo|Ava|STAT/);
    await user.click(button);
    const sheet = await screen.findByRole('dialog', { name: 'In class now' });
    expect(sheet.textContent).toContain('2 of 3 in this group · Class names show to coaches only.');
    expect(sheet.textContent).toContain('1 here has no class status');
    // No "No class status" section and none of the team's term rows.
    expect(within(sheet).queryByRole('region', { name: 'No class status' })).toBeNull();
    expect(sheet.textContent).not.toMatch(/Mark a day with no classes|Set dates/);
  });

  it('is hidden at 0', () => {
    const c = cls([player('p-theo', { blocks: [block('10:00', '11:00')] })]);
    expect(line(c).container.textContent).toBe('');
  });
});

describe('the Details block', () => {
  const view = (c: ChThreadClassDay | undefined, o: ChPerson = THEO, v = conv()) =>
    render(
      <ThreadClassSection cls={c} conv={v} other={o} wrap={(content) => <section aria-label="Class status">{content}</section>} />,
    );

  it('CH-7273: the status with the class, today in order, and where it comes from', () => {
    const c = cls([player('p-theo', { blocks: [block('13:30', '14:45', 'STAT 201 - Probability'), block('15:00', '15:50', 'CHEM 101 - General Chemistry'), block('17:00', '17:50', 'BIO 110 - Biology')] })]);
    const { container } = view(c);
    const lines = [...container.querySelectorAll('p')].map((p) => p.textContent);
    // 10:30 AM: STAT 201 is the block being sat; the island (with CHEM 101 after it) runs until 11:50.
    expect(lines[0]).toBe('In class until 11:50 AM · STAT 201');
    expect(lines[1]).toMatch(/^Today: STAT 201 9:30 to 10:45 AM · CHEM 101 11:00 to 11:50 AM · BIO 110 1:00 to 1:50 PM$/);
    expect(lines[2]).toBe('From Theo’s class schedule · pushes held during class');
  });

  it('pushes not held, and an untracked player', () => {
    expect([...view(cls([player('p-theo', { holds: false })])).container.querySelectorAll('p')].pop()?.textContent).toBe('From Theo’s class schedule · pushes not held');
    cleanup();
    const { container } = view(cls([player('p-theo', { tracked: false, holds: false })]));
    expect(container.textContent).toBe('No class status');
  });

  it('draws nothing for a player viewer, a group, or a player outside the coach’s team', () => {
    expect(view(undefined).container.textContent).toBe('');
    expect(view(cls([player('p-theo')], { convTeamId: 't2' })).container.textContent).toBe('');
    expect(view(cls([player('p-theo')]), THEO, conv({ group: true })).container.textContent).toBe('');
  });

  it('threadClassSection is a pure function of the player and the instant', () => {
    const p = player('p-theo');
    const out = threadClassSection(p, at('13:20'), { clock: '12', teamTz: 'America/New_York', classTz: 'America/New_York' }, 'Theo');
    expect(out.primary).toBe('Class at 9:30 AM · STAT 201');
    expect(directClassPlayer(cls([p]), conv(), THEO)?.playerId).toBe('p-theo');
  });
});

describe('the Composer', () => {
  const api = (c: ChThreadClassDay | null, send = vi.fn(async () => true as boolean | 'unknown' | 'partial'), people = [THEO]) =>
    ({
      drafts: new Map<string, string>(),
      onTyping: vi.fn(),
      send,
      sendFiles: vi.fn(),
      classDay: c,
      directory: people,
      viewer: { userId: 'me', role: 'coach', name: 'Coach' },
    }) as unknown as ChMessagesApi;
  const show = (a: ChMessagesApi, phone = false, v = conv()) =>
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <Composer api={a} conv={v} phone={phone} />
          </div>
        </ToastProvider>
      </LazyMotion>,
    );

  it('CH-7270: the placeholder promises only that the message will not interrupt; the field keeps its name', () => {
    show(api(cls([player('p-theo')])));
    const field = screen.getByRole('textbox', { name: 'Message Theo' }) as HTMLTextAreaElement;
    expect(field.placeholder).toBe("Won't interrupt Theo in class");
    expect(field.getAttribute('data-ch-code')).toBe('CH-7270');
  });

  it('with nothing to offer it is exactly the old composer: same placeholder, same hint, no chevron', () => {
    const { container } = show(api(cls([player('p-theo', { holds: false })])));
    expect((screen.getByRole('textbox', { name: 'Message Theo' }) as HTMLTextAreaElement).placeholder).toBe('Message Theo');
    expect(container.textContent).toContain('Enter to send · Shift + Enter for a new line');
    expect(container.textContent).not.toContain('notify anyway');
    expect(screen.queryByRole('button', { name: 'More send options' })).toBeNull();
    show(api(null));
  });

  it('a plain Send is the old three-argument call; the chevron item sends once with the flag', async () => {
    const user = userEvent.setup();
    const send = vi.fn(async () => true as boolean | 'unknown' | 'partial');
    show(api(cls([player('p-theo')]), send));
    await user.type(screen.getByRole('textbox', { name: 'Message Theo' }), 'Plain one');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]).toEqual(['Plain one']);
    await user.type(screen.getByRole('textbox', { name: 'Message Theo' }), 'Step out please');
    await user.click(screen.getByRole('button', { name: 'More send options' }));
    await user.click(await screen.findByRole('menuitem', { name: /Send and notify anyway/ }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]).toEqual(['Step out please', null, { notifyAnyway: true }]);
  });

  it('Cmd+Shift+Enter sends with the flag when offered; when not offered it sends nothing', async () => {
    const send = vi.fn(async () => true as boolean | 'unknown' | 'partial');
    show(api(cls([player('p-theo')]), send));
    const field = screen.getByRole('textbox', { name: 'Message Theo' });
    fireEvent.change(field, { target: { value: 'Now please' } });
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true, metaKey: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]).toEqual(['Now please', null, { notifyAnyway: true }]);
    cleanup();
    const quiet = vi.fn(async () => true as boolean | 'unknown' | 'partial');
    show(api(cls([player('p-theo', { holds: false })]), quiet));
    const f2 = screen.getByRole('textbox', { name: 'Message Theo' });
    fireEvent.change(f2, { target: { value: 'Now please' } });
    fireEvent.keyDown(f2, { key: 'Enter', shiftKey: true, metaKey: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(quiet).not.toHaveBeenCalled();
  });

  it('the hint under the field gains the chord while Notify anyway is offered', () => {
    const { container } = show(api(cls([player('p-theo')])));
    expect(container.textContent).toMatch(/Enter to send · Shift \+ Enter for a new line · (Cmd Shift Enter|Ctrl Shift Enter) to notify anyway/);
  });

  it('a group has no placeholder change but the line and the menu', async () => {
    const people = [THEO, person('ava', 'Ava Lin')];
    const v = conv({ group: true, title: 'Varsity', memberIds: people.map((p) => p.userId) });
    show(api(cls([player('p-theo'), player('p-ava')]), undefined, people), false, v);
    expect((screen.getByRole('textbox', { name: 'Message Varsity' }) as HTMLTextAreaElement).placeholder).toBe('Message Varsity');
    expect(screen.getByRole('button', { name: /All 2 in class now/ })).toBeTruthy();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message Varsity' }), 'Bus at 6');
    await user.click(screen.getByRole('button', { name: 'More send options' }));
    expect((await screen.findByRole('menuitem')).textContent).toContain('2 people here are in class');
  });
});
