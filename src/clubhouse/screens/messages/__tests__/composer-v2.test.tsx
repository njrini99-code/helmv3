import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import '../../../__tests__/dialog-polyfill';
import { ToastProvider } from '../../../ui/Toast';
import type { ChConv, ChMsg } from '../model';
import { Composer, useAutosize, type ChMessagesApi } from '../MessagesView';

const conv = (over: Partial<ChConv> = {}): ChConv => ({ id: 'c1', group: false, title: 'Ava Lindqvist', subtitle: '', memberIds: ['ava'], memberCount: 2, unread: 0, lastAt: null, lastSenderId: null, lastText: '', creatorId: null, ...over });
const msg = (over: Partial<ChMsg> = {}): ChMsg => ({ id: 'm1', senderId: 'ava', text: 'Bus leaves at 6:15', at: '2026-10-24T18:14:00.000Z', mine: false, seen: false, failed: null, edited: false, deleted: false, hasAttachments: false, ...over });

function fakeApi(over: Partial<ChMessagesApi> = {}): ChMessagesApi {
  return {
    redesign: true,
    viewer: { userId: 'coach', role: 'coach', name: 'Maya Reyes' },
    now: '2026-10-24T20:00:00.000Z',
    timeZone: 'America/New_York',
    clock: '12',
    directory: [{ userId: 'ava', name: 'Ava Lindqvist', role: 'player' }],
    msgs: [msg()],
    reactions: new Map(),
    drafts: new Map(),
    onTyping: vi.fn(),
    send: vi.fn(async () => true),
    sendFiles: vi.fn(async () => true),
    edit: vi.fn(async () => true),
    polls: { create: vi.fn() },
    ...over,
  } as unknown as ChMessagesApi;
}

const show = (api: ChMessagesApi, props: Partial<Parameters<typeof Composer>[0]> = {}) =>
  render(
    <ToastProvider>
      <div data-ch-ms-v2="">
        <Composer api={api} conv={conv()} {...props} />
      </div>
    </ToastProvider>,
  );
const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const sendKey = () => document.querySelector<HTMLElement>('.ch-msv-sendkey');

beforeEach(() => {
  // No WAAPI in jsdom: the hook takes its at-rest path, which is what these assert.
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

/** Messages MSG-COMP-02 and MSG-ALL-09. */
describe('the send key', () => {
  it('is hidden with an empty field, shown with text, hidden again when cleared', () => {
    show(fakeApi());
    expect(sendKey()!.hidden).toBe(true);
    fireEvent.change(field(), { target: { value: 'hello' } });
    expect(sendKey()!.hidden).toBe(false);
    fireEvent.change(field(), { target: { value: '' } });
    expect(sendKey()!.hidden).toBe(true);
  });

  it('spaces alone do not bring it', () => {
    show(fakeApi());
    fireEvent.change(field(), { target: { value: '   ' } });
    expect(sendKey()!.hidden).toBe(true);
  });

  it('there is no microphone in its place', () => {
    show(fakeApi());
    expect(screen.queryByRole('button', { name: /dictate|voice|microphone/i })).toBeNull();
  });

  it('hidden computes display none, by a rule of its own (the stylesheet, since jsdom has none loaded)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/clubhouse/styles/messages.css'), 'utf8');
    const at = css.indexOf('[data-ch-ms-v2] .ch-msv-sendkey[hidden]');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf('}', at))).toMatch(/display:\s*none/);
  });
});

/** MSG-COMP-03, MSG-COMP-01. */
describe('six lines, then it scrolls', () => {
  function Sized({ scrollHeight, cap = '132px' }: { scrollHeight: number; cap?: string }) {
    const ta = useRef<HTMLTextAreaElement | null>(null);
    if (ta.current) Object.defineProperty(ta.current, 'scrollHeight', { configurable: true, value: scrollHeight });
    useAutosize(ta, String(scrollHeight));
    return (
      <textarea
        ref={(el) => {
          ta.current = el;
          if (el) Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
        }}
        style={{ maxHeight: cap }}
        data-testid="f"
      />
    );
  }

  it('grows with its lines under the cap', () => {
    render(<Sized scrollHeight={60} />);
    expect((screen.getByTestId('f') as HTMLTextAreaElement).style.height).toBe('60px');
  });

  it('stops at 132', () => {
    render(<Sized scrollHeight={400} />);
    expect((screen.getByTestId('f') as HTMLTextAreaElement).style.height).toBe('132px');
  });

  it('the field has one definition: the 132 cap, no height transition, and no ring of its own inside the pill', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/clubhouse/styles/messages.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const all = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.split(',').some((s) => s.trim() === sel));
    for (const sel of ['.ch-ms-comp', '.ch-ms-comp__field', '.ch-ms-comp__field textarea', '.ch-ms-send']) expect(all(sel).length, sel).toBeLessThanOrEqual(sel === '.ch-ms-comp' ? 2 : 1);
    const field = all('.ch-ms-comp__field textarea')[0]![2]!;
    expect(field).toMatch(/max-height:\s*132px/);
    expect(field).not.toMatch(/transition/);
    expect(all('.ch-ms-comp__field textarea:focus-visible')[0]![2]).toMatch(/outline:\s*none/);
    // MSG-301: the pill is radius 24 at 10 px from the phone's edge (the page edge less 6).
    expect(all('.ch-ms-comp__field')[0]![2]).toMatch(/border-radius:\s*24px/);
    expect(css).toMatch(/\.ch-ms-comp \{\s*padding: 8px calc\(var\(--ch-page-x-phone\) - 6px\)/);
  });
});

/** S-MSG.attach: exactly Photos, File, Poll. */
describe('the + menu', () => {
  const rows = () => screen.getAllByRole('menuitem').map((r) => r.textContent?.trim());
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add a photo, file or poll' }));

  it('a group lists exactly Photos, File, Poll', () => {
    show(fakeApi(), { conv: conv({ group: true, title: 'Team' }) });
    open();
    expect(rows()).toEqual(['Photos', 'File', 'Poll']);
  });

  it('a direct thread lists Photos and File', () => {
    show(fakeApi());
    open();
    expect(rows()).toEqual(['Photos', 'File']);
  });

  it('no Camera and no Announcement, for anyone', () => {
    show(fakeApi(), { conv: conv({ group: true }) });
    open();
    expect(rows().join()).not.toMatch(/Camera|Announcement/);
  });

  it('the key names its state, and its menu stays single on a reopen', () => {
    show(fakeApi());
    const key = screen.getByRole('button', { name: 'Add a photo, file or poll' });
    expect(key.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(key);
    expect(key.getAttribute('aria-expanded')).toBe('true');
    expect(key.getAttribute('aria-label')).toBe('Close');
    fireEvent.click(key);
    fireEvent.click(key);
    expect(document.querySelectorAll('.ch-msv-attach')).toHaveLength(1);
  });

  it('Escape closes it', () => {
    show(fakeApi());
    const key = screen.getByRole('button', { name: 'Add a photo, file or poll' });
    fireEvent.click(key);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(key.getAttribute('aria-expanded')).toBe('false');
  });
});

/** MSG-COMP-04. */
describe('Enter', () => {
  it('sends on the desktop', async () => {
    const api = fakeApi();
    show(api);
    fireEvent.change(field(), { target: { value: 'hello' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(api.send).toHaveBeenCalledWith('hello'));
  });

  it('Shift+Enter does not send', () => {
    const api = fakeApi();
    show(api);
    fireEvent.change(field(), { target: { value: 'hello' } });
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(api.send).not.toHaveBeenCalled();
  });

  it('does not send on the phone, and leaves the key’s default so Return adds a line', () => {
    const api = fakeApi();
    show(api, { phone: true });
    fireEvent.change(field(), { target: { value: 'hello' } });
    const notPrevented = fireEvent.keyDown(field(), { key: 'Enter' });
    expect(notPrevented).toBe(true);
    expect(api.send).not.toHaveBeenCalled();
    expect(field().getAttribute('enterkeyhint')).toBe('enter');
  });

  it('the phone’s send key sends', async () => {
    const api = fakeApi();
    show(api, { phone: true });
    fireEvent.change(field(), { target: { value: 'hello' } });
    fireEvent.click(sendKey()!.querySelector('button')!);
    await waitFor(() => expect(api.send).toHaveBeenCalledWith('hello'));
  });

  it('the desktop hint stays; the phone has none', () => {
    show(fakeApi());
    expect(screen.getByText(/Enter to send · Shift \+ Enter for a new line/)).toBeTruthy();
    cleanup();
    show(fakeApi(), { phone: true });
    expect(screen.queryByText(/Enter to send/)).toBeNull();
  });

  it('an empty field never sends', () => {
    const api = fakeApi();
    show(api);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(api.send).not.toHaveBeenCalled();
  });
});

/** S-MSG.reply and S-MSG.edit (ruling 21, MSG-EDIT-01). */
describe('chips', () => {
  it('reply: the chip shows, the send carries the parent, Cancel clears', async () => {
    const api = fakeApi();
    const onClearReply = vi.fn();
    show(api, { replyToId: 'm1', onClearReply });
    expect(document.querySelector('.ch-ms-comp__reply')).not.toBeNull();
    expect(document.querySelector('.ch-ms-comp__reply')!.textContent).toContain('Replying to Ava');
    fireEvent.change(field(), { target: { value: 'ok' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(api.send).toHaveBeenCalledWith('ok', 'm1'));
    await waitFor(() => expect(onClearReply).toHaveBeenCalled());
  });

  it('reply: Cancel reply clears it without sending', () => {
    const api = fakeApi();
    const onClearReply = vi.fn();
    show(api, { replyToId: 'm1', onClearReply });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onClearReply).toHaveBeenCalledTimes(1);
    expect(api.send).not.toHaveBeenCalled();
  });

  it('edit: the field holds the text, the chip says Editing message, Send saves', async () => {
    const api = fakeApi();
    const onEditDone = vi.fn();
    show(api, { editing: msg({ mine: true, text: 'First go' }), onEditDone });
    await waitFor(() => expect(field().value).toBe('First go'));
    expect(document.querySelector('.ch-ms-comp__reply.is-edit')!.textContent).toContain('Editing message');
    fireEvent.change(field(), { target: { value: 'Second go' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith('m1', 'Second go'));
    expect(api.send).not.toHaveBeenCalled();
    await waitFor(() => expect(onEditDone).toHaveBeenCalled());
  });

  it('edit: sending the same words closes with no write', async () => {
    const api = fakeApi();
    const onEditDone = vi.fn();
    show(api, { editing: msg({ mine: true, text: 'First go' }), onEditDone });
    await waitFor(() => expect(field().value).toBe('First go'));
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(onEditDone).toHaveBeenCalled());
    expect(api.edit).not.toHaveBeenCalled();
  });

  it('edit: Cancel empties the field', async () => {
    const onEditDone = vi.fn();
    show(fakeApi(), { editing: msg({ mine: true, text: 'First go' }), onEditDone });
    await waitFor(() => expect(field().value).toBe('First go'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
    expect(field().value).toBe('');
    expect(onEditDone).toHaveBeenCalledTimes(1);
  });
});
