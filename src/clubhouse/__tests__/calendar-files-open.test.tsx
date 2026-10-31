import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Files on an event open through a fresh signed link (getPreviewUrl), as Team Hub's and Fairway's do: the documents
 * bucket is private, so the stored `file_url` (a public address) 404s and is never used. A file that won't open says so
 * (CH-6024) and closes the tab it opened. Mocks as in calendar-held-moves.test.tsx.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy, hapticScrub: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
const a = vi.hoisted(() => ({
  ok: vi.fn(),
  getEventDocuments: vi.fn(),
  getCalendarFeeds: vi.fn(),
  getAttendanceReport: vi.fn(),
  getDocuments: vi.fn(),
  getPreviewUrl: vi.fn(),
}));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: a.ok, updateGolfEvent: a.ok, deleteGolfEvent: a.ok, respondToEvent: a.ok }));
vi.mock('@/app/golf/actions/calendar-blocked-time', () => ({ addCoachBlockedTime: a.ok, deleteCoachBlockedTime: a.ok }));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: a.ok, deleteRecurringEvent: a.ok, editRecurringEvent: a.ok }));
vi.mock('@/app/golf/actions/calendar-feeds', () => ({ getCalendarFeeds: a.getCalendarFeeds, createCalendarFeed: a.ok, regenerateCalendarFeed: a.ok, deleteCalendarFeed: a.ok }));
vi.mock('@/app/golf/actions/event-documents', () => ({ getEventDocuments: a.getEventDocuments, attachDocumentToEvent: a.ok, detachDocumentFromEvent: a.ok }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: a.getDocuments, getPreviewUrl: a.getPreviewUrl }));
vi.mock('@/app/golf/actions/attendance', () => ({ getAttendanceReport: a.getAttendanceReport, markAttendance: a.ok }));
vi.mock('@/app/golf/actions/travel', () => ({ getItineraryForEvent: () => Promise.resolve({ success: true, data: null }) }));

import { Calendar } from '../screens/calendar/Calendar';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR } from '../preview/fixtures-calendar';
import './dialog-polyfill';

const PUBLIC_URL = 'https://x.supabase.co/storage/v1/object/public/documents/team/rules.pdf';
const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/documents/team/rules.pdf?token=t';
const localRules = { document: { id: 'd1', title: 'Local rules', file_url: PUBLIC_URL, file_size: 1000 }, note: null };

function wrap() {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar data={PREVIEW_CALENDAR} initialEvent="e9" />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

let win: { location: { href: string }; close: ReturnType<typeof vi.fn> };
let openSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  a.getEventDocuments.mockReset().mockResolvedValue({ success: true, data: [localRules] });
  a.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
  a.getAttendanceReport.mockResolvedValue({ success: true, data: [] });
  a.getDocuments.mockResolvedValue({ success: true, data: [] });
  a.getPreviewUrl.mockReset().mockResolvedValue({ data: { url: SIGNED, mimeType: 'application/pdf' }, error: null });
  win = { location: { href: '' }, close: vi.fn() };
  openSpy = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
  hapticSpy.mockClear();
});
afterEach(() => {
  openSpy.mockRestore();
  cleanup();
});

describe('Calendar · files on an event open through a signed link', () => {
  it('the file is a button, never a link to the stored public address', async () => {
    wrap();
    const open = await screen.findByRole('button', { name: 'Open Local rules' });
    expect(open.closest('a')).toBeNull();
    expect(document.querySelector(`a[href="${PUBLIC_URL}"]`)).toBeNull();
  });

  it('a tap opens a tab at once and fills it with the signed link for that document', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(await screen.findByRole('button', { name: 'Open Local rules' }));
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(a.getPreviewUrl).toHaveBeenCalledWith('d1');
    await waitFor(() => expect(win.location.href).toBe(SIGNED));
    expect(win.close).not.toHaveBeenCalled();
  });

  it('CH-6024 a file that won’t open says so, offers Try again, and closes the tab it opened', async () => {
    a.getPreviewUrl.mockResolvedValue({ data: null, error: 'Document not found' });
    const user = userEvent.setup();
    wrap();
    await user.click(await screen.findByRole('button', { name: 'Open Local rules' }));
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-6024"]')).not.toBeNull());
    expect(screen.getByText('Couldn’t open Local rules')).toBeTruthy();
    expect(win.close).toHaveBeenCalled();
    expect(win.location.href).toBe('');
    expect(hapticSpy).toHaveBeenLastCalledWith('error');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('a file with no stored copy says that, not a generic failure', async () => {
    a.getPreviewUrl.mockResolvedValue({ data: null, error: 'No file', noContent: true });
    const user = userEvent.setup();
    wrap();
    await user.click(await screen.findByRole('button', { name: 'Open Local rules' }));
    await screen.findByText('This file has no stored copy to open.');
    expect(win.close).toHaveBeenCalled();
  });

  it('offline, nothing is opened and nothing is asked of the server (CH-1903)', async () => {
    const line = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      const user = userEvent.setup();
      wrap();
      await user.click(await screen.findByRole('button', { name: 'Open Local rules' }));
      await screen.findByText(/Couldn’t open Local rules: you’re offline/);
      expect(openSpy).not.toHaveBeenCalled();
      expect(a.getPreviewUrl).not.toHaveBeenCalled();
    } finally {
      line.mockRestore();
    }
  });
});
