import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preferences = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../../lib/reduced-motion', () => ({ useChReducedMotion: () => preferences.reduced, useChMotionMode: () => preferences.reduced ? 'off' : 'full' }));
vi.mock('@/clubhouse/screens/coachhelm/plan/PlanCard', async () => ({ PlanPreview: (await import('react')).createContext(null) }));
vi.mock('../parts/SaveCard', () => ({ SaveCard: () => null }));

import { AskPresence } from '../AskPresence';
import { Steps } from '../parts/Steps';
import { FollowUps } from '../parts/FollowUps';
import { Sources } from '../parts/Sources';
import type { AskTurnRead } from '../../../../data/coachhelm-chat-thread';

let settle: () => void;
const original = Element.prototype.getAnimations;
beforeEach(() => {
  preferences.reduced = false;
  const finished = new Promise<void>((resolve) => { settle = resolve; });
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [{ finished }] });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.useRealTimers();
  if (original) Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: original });
  else Reflect.deleteProperty(Element.prototype, 'getAnimations');
});

describe('retained Ask exits', () => {
  it('keeps the last open content inert until its own exit settles, even with an intervening render', async () => {
    const view = render(<AskPresence open className="picker"><button>Original choice</button></AskPresence>);
    view.rerender(<AskPresence open={false} className="picker"><button>Empty result</button></AskPresence>);
    expect(view.container.querySelector('[inert][aria-hidden="true"]')?.textContent).toBe('Original choice');
    view.rerender(<AskPresence open={false} className="picker">Changed while leaving</AskPresence>);
    await act(async () => settle());
    expect(view.container.children).toHaveLength(0);
  });

  it('a reopened picker survives completion of its interrupted exit', async () => {
    const view = render(<AskPresence open>Old</AskPresence>);
    view.rerender(<AskPresence open={false}>Old</AskPresence>);
    view.rerender(<AskPresence open>New</AskPresence>);
    await act(async () => settle());
    expect(view.container.textContent).toBe('New');
    expect(view.container.querySelector('[inert]')).toBeNull();
  });

  it('reduced motion removes an exit immediately', () => {
    preferences.reduced = true;
    const view = render(<AskPresence open>Choice</AskPresence>);
    view.rerender(<AskPresence open={false}>Choice</AskPresence>);
    expect(view.container.children).toHaveLength(0);
  });

  it('sources close on Escape, retain the read during exit and return focus to the disclosure', async () => {
    const read = { ref: 'r1', name: 'Team scoring', chip: 'Season', envelope: { measurements: [], series: [] } } as unknown as AskTurnRead;
    const view = render(<Sources reads={[read]} />);
    const trigger = screen.getByRole('button', { name: /1 read/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(view.container.querySelector('[inert]')?.textContent).toContain('Team scoring');
    await act(async () => settle());
    expect(screen.queryByText('Team scoring')).toBeNull();
  });
});

describe('stable steps and follow-ups', () => {
  const steps = [{ id: 'read', label: 'Read scoring', done: 'Read scoring', detail: 'Eight rounds' }];
  it('keeps the live list mounted through completion and a manual reopen cancels the automatic fold', async () => {
    vi.useFakeTimers();
    const view = render(<Steps steps={steps} active seconds={null} />);
    const list = screen.getByRole('list');
    view.rerender(<Steps steps={steps} active={false} seconds={3} />);
    expect(screen.getByRole('list')).toBe(list);
    const disclosure = screen.getByRole('button', { name: /1 step/ });
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(disclosure);
    fireEvent.click(disclosure);
    await act(async () => { vi.advanceTimersByTime(1000); settle(); });
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('list')).toBe(list);
  });

  it('a restored run starts folded and preference changes cannot strand a live hold', () => {
    vi.useFakeTimers();
    const view = render(<Steps steps={steps} active={false} seconds={3} />);
    expect(screen.queryByRole('list')).toBeNull();
    view.rerender(<Steps steps={steps} active seconds={null} />);
    view.rerender(<Steps steps={steps} active={false} seconds={3} />);
    preferences.reduced = true;
    view.rerender(<Steps steps={steps} active={false} seconds={3} />);
    expect(screen.getByRole('button', { name: /1 step/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('only follow-ups first mounted in a fresh answer earn entrance motion', () => {
    const view = render(<div className="ch-ak-turn"><FollowUps items={['Compare rounds']} onSend={vi.fn()} /></div>);
    expect(screen.getByRole('list').hasAttribute('data-fresh')).toBe(false);
    view.rerender(<div className="ch-ak-turn is-new"><FollowUps items={['Compare rounds']} onSend={vi.fn()} /></div>);
    expect(screen.getByRole('list').hasAttribute('data-fresh')).toBe(false);
    view.unmount();
    render(<div className="ch-ak-turn is-new"><FollowUps items={['Compare rounds']} onSend={vi.fn()} /></div>);
    expect(screen.getByRole('list').hasAttribute('data-fresh')).toBe(true);
  });
});
