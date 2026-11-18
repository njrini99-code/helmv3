// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { Receipt } from '../Receipt';

const completed = (over: Partial<ActionReceipt> = {}): ActionReceipt => ({ status: 'completed', action: 'Add', summary: 'Event added', created: [], notifications: [], partial_failures: [], idempotency_key: 'k', ...over });
const held = () => completed({ status: 'held', held_until: new Date(Date.now() + 8000).toISOString() });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('durable action receipts', () => {
  it('shows a late terminal stream result instead of leaving the original hold on screen', () => {
    const { rerender } = render(<Receipt receipt={held()} idempotencyKey="k" />);
    expect(screen.getByRole('button', { name: /Undo,/ })).toBeTruthy();
    rerender(<Receipt receipt={completed({ summary: 'Saved after reconnecting' })} idempotencyKey="k" />);
    expect(screen.getByText('Saved after reconnecting')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('reports exhausted status reads and offers a read retry, never another creation', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const onResolved = vi.fn();
    render(<Receipt receipt={held()} idempotencyKey="k" onResolved={onResolved} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(13_000); });
    expect(screen.getByText(/result hasn’t come through yet/)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(6);
    fetcher.mockImplementation(async () => new Response(JSON.stringify({ receipt: completed() })));
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(fetcher.mock.calls.every((call) => !(call[1] as RequestInit | undefined)?.method)).toBe(true);
    expect(screen.queryByRole('button', { name: 'Check status' })).toBeNull();
  });

  it('starts a restored undo ring where the eight seconds already are', () => {
    const until = new Date(Date.now() + 3000).toISOString();
    const { container } = render(<Receipt receipt={completed({ status: 'held', held_until: until })} idempotencyKey="k" />);
    const ring = container.querySelector('.drn') as SVGElement;
    expect(Number.parseFloat(ring.style.animationDuration)).toBe(8000);
    const delay = Number.parseFloat(ring.style.animationDelay);
    expect(delay).toBeLessThan(-4500);
    expect(delay).toBeGreaterThan(-5200);
  });

  it('does not claim a queued notification was delivered', () => {
    render(<Receipt receipt={completed({ notifications: [{ channel: 'push', recipients: 7, status: 'queued', summary: 'Queued' }] })} idempotencyKey="k" />);
    expect(screen.getByText(/Notifications queued/)).toBeTruthy();
    expect(screen.queryByText(/Told/)).toBeNull();
  });

  it('accepts a cancelled ledger result without showing a saved destination', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'cancelled' }))));
    const onUndone = vi.fn();
    render(<Receipt receipt={held()} idempotencyKey="k" onUndone={onUndone} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(8300); });
    expect(onUndone).toHaveBeenCalledOnce();
    expect(screen.getByText('Undone. Nothing was saved, and nobody was told.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });
});
