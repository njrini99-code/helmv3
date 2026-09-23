/**
 * G-20b — an unknown commit outcome must not be reported as a definitive
 * failure.
 *
 * §9.5's prose, quoted in `audit/M03C-composer.md:36`: "An unknown commit
 * outcome uses Checking status or Confirmation unavailable, not a red
 * definitive failure that invites duplication." M03C's F3 measures the gap:
 * `sendMessage` treats every non-success path identically, and
 * `FairwayMessages` shows one generic toast regardless of cause, so nothing on
 * screen can distinguish "it was refused" from "we don't know".
 *
 * Only those TWO outcomes are built. §9.5 names eight, but F3 documents this
 * one collapse as the gap and the other six have no evidence asking for them.
 *
 * Two layers, tested two ways. The classifier's own logic is exercised
 * directly below, because that is the part that could be subtly wrong. Its
 * placement — which branch marks which outcome — is asserted on the source,
 * matching the idiom the sibling send-integrity suites establish and for the
 * reason they give: reaching `sendMessage` behaviourally needs a full supabase
 * + auth + realtime harness.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isTransientNetworkErrorMessage } from '@/lib/transient-network-error';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const strip = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const hook = strip(read('src/hooks/golf/use-golf-messages.ts'));
const page = strip(read('src/components/fairway/pages/messages/FairwayMessages.tsx'));
const pane = strip(read('src/components/fairway/pages/messages/MessageThreadPane.tsx'));

describe('the classifier itself — the part that could be subtly wrong', () => {
  /** The same expression the hook uses, exercised against real engine wording. */
  const classify = (message: string): 'refused' | 'unknown' =>
    isTransientNetworkErrorMessage(message) ? 'unknown' : 'refused';

  it('a WKWebView transport death is UNKNOWN — the POST may have landed', () => {
    // The exact failure two Shenandoah players hit mid-send on 2026-09-01/02,
    // per withOneTransportRetry's own docstring.
    expect(classify('Load failed')).toBe('unknown');
  });

  it('every other engine wording is unknown too', () => {
    for (const m of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'The network connection was lost.',
      'net::ERR_INTERNET_DISCONNECTED',
    ]) {
      expect(classify(m), m).toBe('unknown');
    }
  });

  it('an answer from our own server is REFUSED, however it is worded', () => {
    // `fetch` resolved, so the request demonstrably arrived. A 500 does not
    // reach the transport class — that is the property the helper's docstring
    // relies on to make the class safe to retry.
    for (const m of [
      'You are not a participant in this conversation',
      'Failed to send message',
      'Internal Server Error',
    ]) {
      expect(classify(m), m).toBe('refused');
    }
  });

  it('an abort is REFUSED, not unknown — it is our own timeout, not their connection', () => {
    // Deliberately excluded from the transport class; see the helper.
    expect(classify('AbortError: signal is aborted without reason')).toBe('refused');
  });
});

describe('G-20b — the hook records which outcome it was', () => {
  it('carries the two outcomes on the message, and only those two', () => {
    expect(hook).toContain("sendOutcome?: 'refused' | 'unknown';");
  });

  it('marks a server answer as refused, at both branches that read the result', () => {
    const refusals = hook.match(/markSendFailed\([a-zA-Z]+, 'refused'\)/g) ?? [];
    // Two in sendMessage (error result, non-success result) and one in
    // retryMessage's equivalent check.
    expect(refusals.length).toBe(3);
  });

  it('classifies the thrown case instead of assuming it', () => {
    const classified = hook.match(/markSendFailed\([a-zA-Z]+, classifySendFailure\(error\)\)/g) ?? [];
    // The sendMessage catch and the retryMessage catch.
    expect(classified.length).toBe(2);
  });

  it('never hardcodes an outcome in a catch — that is what collapsed the taxonomy', () => {
    expect(hook).not.toMatch(/catch \(error\) \{\s*markSendFailed\([a-zA-Z]+, '/);
  });

  it('clears the outcome with the flag, so a retried row cannot keep a stale label', () => {
    expect(hook).toContain('sendFailed: false, sendOutcome: undefined');
  });
});

describe('G-20b — the two places the user reads it cannot disagree', () => {
  it('the toast branches on the same classifier the hook uses', () => {
    expect(page).toContain('isTransientNetworkErrorMessage(');
    expect(page).toMatch(/Couldn’t confirm this send/);
  });

  it('the failed row says "Not confirmed" when the commit is unknown', () => {
    expect(pane).toContain("sendOutcome === 'unknown'");
    expect(pane).toContain("'Not confirmed'");
  });

  it('and keeps the definite wording when the server actually refused', () => {
    expect(pane).toContain("'Not sent'");
  });
});
