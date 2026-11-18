import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryPanel } from '../History';
import { RouteScope } from '../../../../lib/session-state';

const list = Array.from({ length: 45 }, (_, i) => ({ id: `chat-${i + 1}`, title: `Saved question ${i + 1}`, updatedAt: '2026-11-08T12:00:00Z' }));
const props = { conversations: { list, error: false }, openId: null, nowIso: '2026-11-08T12:00:00Z', timezone: 'UTC', onNew: vi.fn(), open: true, onHide: vi.fn(), heading: 'CoachHelm' };
const page = (overrides = {}) => <RouteScope.Provider value="history-paging"><HistoryPanel {...props} {...overrides} /></RouteScope.Provider>;

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

describe('finite history snapshot paging', () => {
  it('reveals each loaded chat once and removes More at the actual end of the snapshot', () => {
    render(page());
    expect(screen.getAllByRole('link')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'More chats' }));
    expect(screen.getAllByRole('link')).toHaveLength(40);
    fireEvent.click(screen.getByRole('button', { name: 'More chats' }));
    expect(new Set(screen.getAllByRole('link').map((el) => el.getAttribute('href'))).size).toBe(45);
    expect(screen.queryByRole('button', { name: 'More chats' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Showing 45 of 45 loaded chats.');
  });

  it('searches beyond the current page, then restores search, page depth and scroll on return', () => {
    const first = render(page());
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'question 45' } });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Saved question 45' })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'More chats' }));
    const scroller = first.container.querySelector('.ch-ask-hist__scroll')!;
    fireEvent.scroll(scroller, { target: { scrollTop: 350 } });
    first.unmount();
    const second = render(page());
    expect(screen.getAllByRole('link')).toHaveLength(40);
    expect(second.container.querySelector('.ch-ask-hist__scroll')?.scrollTop).toBe(350);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'question 45' } });
    second.unmount();
    render(page());
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('question 45');
    expect(screen.getByRole('link', { name: 'Saved question 45' })).toBeTruthy();
  });

  it('reveals a deep-linked selection and preserves modified-link navigation', () => {
    const onNavigate = vi.fn();
    const onOpen = vi.fn();
    render(page({ openId: 'chat-35', onNavigate, onOpen }));
    const selected = screen.getByRole('link', { name: 'Saved question 35' });
    expect(selected.getAttribute('aria-current')).toBe('page');
    fireEvent.click(selected, { ctrlKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(selected);
    expect(onOpen).toHaveBeenCalledWith('chat-35');
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
