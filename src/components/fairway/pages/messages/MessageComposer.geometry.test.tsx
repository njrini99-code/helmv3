// @vitest-environment jsdom
// Composer control geometry and recipient behavior. Visual layout is browser-verified.

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MessageComposer } from './MessageComposer';
import { conversationRecipientName } from './conversation-kind';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const artboard = read('audit/reference/Composer.dc.html');
const parentSource = read('src/components/fairway/pages/messages/FairwayMessages.tsx');

/** Comment-stripped, so the fix's own prose cannot satisfy a check. */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
const parentCode = strip(parentSource);

const sendButton = () => screen.getByLabelText('Send message');
const field = () => screen.getByPlaceholderText(/Message |Type a message/) as HTMLTextAreaElement;

function paintTextarea(lineHeightPx: number) {
  const style = document.createElement('style');
  style.setAttribute('data-test-paint', 'true');
  style.textContent = `textarea { box-sizing: border-box; font-size: 15px;
    line-height: ${lineHeightPx}px; padding-top: 8px; padding-bottom: 8px;
    border-top-width: 0px; border-bottom-width: 0px; }`;
  document.head.appendChild(style);
}

beforeEach(() => document.querySelectorAll('[data-test-paint]').forEach((el) => el.remove()));
afterEach(() => document.querySelectorAll('[data-test-paint]').forEach((el) => el.remove()));

describe('G-47 · the send control', () => {
  it('is a full circle, which is what --fw-radius-full is reserved for', () => {
    expect(artboard).toContain('.send { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 9999px;');
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    expect(sendButton().className).toContain('rounded-full');
    expect(sendButton().className).not.toContain('rounded-fw-md');
  });

  it('draws 40px at every width, not 44 on a phone', () => {
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    const cls = sendButton().className;
    expect(cls).toContain('h-10 w-10');
    // The defect: the visible circle was grown to the hit-area size.
    expect(cls).not.toContain('h-11 w-11');
    expect(cls).not.toContain('md:h-10 md:w-10');
  });

  it('keeps the 44px tap target as an overlay, so nothing drawn moves', () => {
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    // -inset-0.5 is 2px a side: 40 + 4 = 44, exactly §9.1's split.
    expect(sendButton().className).toContain('after:-inset-0.5');
    expect(sendButton().className).toContain('relative');
  });
});

describe('G-47 · the track aligns the way the artboard does', () => {
  it('centres its controls at rest', () => {
    paintTextarea(24);
    const { container } = render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    const track = container.querySelector('.rounded-fw-lg.flex') as HTMLElement | null;
    expect(track, 'expected the writing track').not.toBeNull();
    expect(track!.className).toContain('items-center');
    expect(track!.className).not.toContain('items-end');
  });

  it('bottom-aligns once the field has grown, and only then', () => {
    paintTextarea(24);
    const { container } = render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    const track = () => container.querySelector('.rounded-fw-lg.flex') as HTMLElement;

    // jsdom reports scrollHeight 0, so drive the grown state the way the
    // browser would: a taller content box than one line's worth.
    Object.defineProperty(field(), 'scrollHeight', { value: 24 * 3 + 16, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(track().className).toContain('items-end');
    expect(track().className).not.toContain('items-center');
  });

  it('opens 12px on the left, so the clip is off the track edge', () => {
    const { container } = render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    expect(artboard).toContain('padding: 5px 5px 5px 12px');
    expect((container.querySelector('.rounded-fw-lg.flex') as HTMLElement).className).toContain('pl-3');
  });
});

describe('G-47 · the field names who is about to hear you', () => {
  it('writes "Message <name>" when it is told one', () => {
    expect(artboard).toContain('Message Cole');
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true), recipientName: 'Cole' }));
    expect(screen.getByPlaceholderText('Message Cole')).toBeTruthy();
  });

  it('falls back rather than rendering "Message undefined"', () => {
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true) }));
    expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy();
  });

  it('reads the same source the thread header does', () => {
    // Two places naming the same person must not be able to disagree.
    expect(parentCode).toContain('recipientName={');
    expect(parentCode).toContain('conversationRecipientName(selectedConversation)');
  });

  it('keeps a group title whole — a group name is not a person’s', () => {
    const recipient = conversationRecipientName({ is_group: true, participant_count: 8, title: 'Varsity Team Chat' });
    render(createElement(MessageComposer, { onSend: vi.fn(async () => true), recipientName: recipient }));
    expect(screen.getByPlaceholderText('Message Varsity Team Chat')).toBeTruthy();
  });
});
