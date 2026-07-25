import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_USER_AGENT_TOKENS,
  CONFIDENT_HUMAN_LATENCY_MS,
  FANOUT_MIN_DISTINCT_IPS,
  FANOUT_WINDOW_MS,
  PREFETCH_LATENCY_MS,
  classifyEngagement,
  countsAsHumanEngagement,
  detectUserAgentIpFanOut,
  flagAutomatedByIpFanOut,
  isKnownAutomationUserAgent,
  type FanOutEvent,
} from '../engagement-quality';

/**
 * All timestamps here are explicit and fixed — the module under test never
 * reads the clock, and neither do these tests.
 */
const DELIVERED_AT = '2026-07-24T12:00:00.000Z';
const DELIVERED_AT_MS = Date.parse(DELIVERED_AT);

/** Build an ISO timestamp `offsetMs` after the delivery reference. */
function after(offsetMs: number): string {
  return new Date(DELIVERED_AT_MS + offsetMs).toISOString();
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * The exact shape of the spoofed UA we measured: 79 demo-gate sessions shared
 * this one string across 49 distinct IP addresses. Nothing about it is
 * distinguishable from a real Chrome user.
 */
const SPOOFED_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7 Safari/537.36';

describe('classifyEngagement — latency is the primary signal', () => {
  it('classifies a sub-2-minute click as automated', () => {
    const result = classifyEngagement({
      occurredAt: after(40 * SECOND),
      referenceAt: DELIVERED_AT,
      userAgent: SPOOFED_CHROME_UA,
      ip: '203.0.113.10',
    });

    expect(result.verdict).toBe('automated');
    expect(result.reason).toBe('prefetch_latency');
    expect(result.latencyMs).toBe(40 * SECOND);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('classifies a near-instant (zero latency) event as automated', () => {
    const result = classifyEngagement({
      occurredAt: DELIVERED_AT,
      referenceAt: DELIVERED_AT,
      userAgent: SPOOFED_CHROME_UA,
      ip: '203.0.113.10',
    });

    expect(result.verdict).toBe('automated');
    expect(result.reason).toBe('prefetch_latency');
    expect(result.latencyMs).toBe(0);
  });

  it('classifies a 6-hour gap as likely_human with high confidence', () => {
    const result = classifyEngagement({
      occurredAt: after(6 * HOUR),
      referenceAt: DELIVERED_AT,
      userAgent: SPOOFED_CHROME_UA,
      ip: '203.0.113.10',
    });

    expect(result.verdict).toBe('likely_human');
    expect(result.reason).toBe('human_latency');
    expect(result.latencyMs).toBe(6 * HOUR);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('classifies the 2–30 minute soft band as likely_human with lower confidence', () => {
    const soft = classifyEngagement({
      occurredAt: after(10 * MINUTE),
      referenceAt: DELIVERED_AT,
    });
    const confident = classifyEngagement({
      occurredAt: after(6 * HOUR),
      referenceAt: DELIVERED_AT,
    });

    expect(soft.verdict).toBe('likely_human');
    expect(soft.reason).toBe('ambiguous_latency');
    expect(soft.confidence).toBeLessThan(confident.confidence);
  });

  it('accepts Date objects and epoch-millisecond numbers interchangeably', () => {
    const fromDates = classifyEngagement({
      occurredAt: new Date(DELIVERED_AT_MS + 6 * HOUR),
      referenceAt: new Date(DELIVERED_AT_MS),
    });
    const fromNumbers = classifyEngagement({
      occurredAt: DELIVERED_AT_MS + 6 * HOUR,
      referenceAt: DELIVERED_AT_MS,
    });

    expect(fromDates).toEqual(fromNumbers);
    expect(fromDates.verdict).toBe('likely_human');
  });
});

describe('classifyEngagement — threshold boundaries', () => {
  it('treats one millisecond under PREFETCH_LATENCY_MS as automated', () => {
    const result = classifyEngagement({
      occurredAt: after(PREFETCH_LATENCY_MS - 1),
      referenceAt: DELIVERED_AT,
    });

    expect(result.verdict).toBe('automated');
    expect(result.reason).toBe('prefetch_latency');
  });

  it('treats exactly PREFETCH_LATENCY_MS as the soft human band, not automated', () => {
    // The documented rule is "sub-2-minute", so the boundary itself is out.
    const result = classifyEngagement({
      occurredAt: after(PREFETCH_LATENCY_MS),
      referenceAt: DELIVERED_AT,
    });

    expect(result.verdict).toBe('likely_human');
    expect(result.reason).toBe('ambiguous_latency');
    expect(result.latencyMs).toBe(PREFETCH_LATENCY_MS);
  });

  it('treats exactly CONFIDENT_HUMAN_LATENCY_MS as still ambiguous', () => {
    const result = classifyEngagement({
      occurredAt: after(CONFIDENT_HUMAN_LATENCY_MS),
      referenceAt: DELIVERED_AT,
    });

    expect(result.verdict).toBe('likely_human');
    expect(result.reason).toBe('ambiguous_latency');
  });

  it('treats one millisecond past CONFIDENT_HUMAN_LATENCY_MS as confidently human', () => {
    const result = classifyEngagement({
      occurredAt: after(CONFIDENT_HUMAN_LATENCY_MS + 1),
      referenceAt: DELIVERED_AT,
    });

    expect(result.verdict).toBe('likely_human');
    expect(result.reason).toBe('human_latency');
  });

  it('pins the published threshold values', () => {
    // These are cited in the module docs and in the remediation write-up;
    // changing them is a product decision, not a refactor.
    expect(PREFETCH_LATENCY_MS).toBe(2 * MINUTE);
    expect(CONFIDENT_HUMAN_LATENCY_MS).toBe(30 * MINUTE);
  });
});

describe('classifyEngagement — missing or nonsensical reference', () => {
  it('returns unknown (never likely_human) when referenceAt is null', () => {
    const result = classifyEngagement({
      occurredAt: after(6 * HOUR),
      referenceAt: null,
      userAgent: SPOOFED_CHROME_UA,
      ip: '203.0.113.10',
    });

    expect(result.verdict).toBe('unknown');
    expect(result.reason).toBe('missing_reference_timestamp');
    expect(result.confidence).toBe(0);
    expect(result.latencyMs).toBeNull();
  });

  it('returns unknown for undefined, empty-string, and unparseable references', () => {
    for (const referenceAt of [undefined, '', '   ', 'not-a-date', Number.NaN]) {
      const result = classifyEngagement({ occurredAt: DELIVERED_AT, referenceAt });
      expect(result.verdict).toBe('unknown');
      expect(result.reason).toBe('missing_reference_timestamp');
    }
  });

  it('returns unknown when occurredAt itself is missing', () => {
    const result = classifyEngagement({ occurredAt: null, referenceAt: DELIVERED_AT });

    expect(result.verdict).toBe('unknown');
    expect(result.reason).toBe('invalid_timestamp');
  });

  it('returns unknown when the event predates its own reference', () => {
    const result = classifyEngagement({
      occurredAt: after(-5 * MINUTE),
      referenceAt: DELIVERED_AT,
    });

    expect(result.verdict).toBe('unknown');
    expect(result.reason).toBe('event_precedes_reference');
    expect(result.latencyMs).toBe(-5 * MINUTE);
  });

  it('never emits likely_human without a usable reference', () => {
    const references = [null, undefined, '', 'garbage'];
    for (const referenceAt of references) {
      expect(classifyEngagement({ occurredAt: DELIVERED_AT, referenceAt }).verdict).not.toBe(
        'likely_human',
      );
    }
  });
});

describe('classifyEngagement — user-agent override (secondary signal)', () => {
  it('forces automated for a curl UA even at a 6-hour gap', () => {
    const result = classifyEngagement({
      occurredAt: after(6 * HOUR),
      referenceAt: DELIVERED_AT,
      userAgent: 'curl/8.4.0',
      ip: '203.0.113.10',
    });

    expect(result.verdict).toBe('automated');
    expect(result.reason).toBe('automation_user_agent');
    expect(result.latencyMs).toBe(6 * HOUR);
  });

  it('forces automated for known scanner vendors at human-looking latency', () => {
    const scannerAgents = [
      'Mozilla/5.0 (compatible; proofpoint-urldefense/1.0)',
      'Mimecast Link Protection',
      'BarracudaScanner/2.1',
      'Symantec Email Security',
      'Forcepoint Web Security',
      'Microsoft Office SafeLinks/1.0',
      'python-requests/2.31.0',
      'Wget/1.21.4',
      'Mozilla/5.0 HeadlessChrome/120.0.0.0',
    ];

    for (const userAgent of scannerAgents) {
      const result = classifyEngagement({
        occurredAt: after(6 * HOUR),
        referenceAt: DELIVERED_AT,
        userAgent,
      });
      expect(result.verdict, userAgent).toBe('automated');
      expect(result.reason, userAgent).toBe('automation_user_agent');
    }
  });

  it('still returns automated for a declared bot when the reference is missing', () => {
    // A missing reference must never manufacture a *human*. Downgrading to
    // automated on a self-declared machine is the safe direction.
    const result = classifyEngagement({
      occurredAt: DELIVERED_AT,
      referenceAt: null,
      userAgent: 'curl/8.4.0',
    });

    expect(result.verdict).toBe('automated');
    expect(result.reason).toBe('automation_user_agent');
    expect(result.latencyMs).toBeNull();
  });

  it('reports higher confidence when the UA and the latency agree', () => {
    const corroborated = classifyEngagement({
      occurredAt: after(30 * SECOND),
      referenceAt: DELIVERED_AT,
      userAgent: 'curl/8.4.0',
    });
    const uaOnly = classifyEngagement({
      occurredAt: after(6 * HOUR),
      referenceAt: DELIVERED_AT,
      userAgent: 'curl/8.4.0',
    });

    expect(corroborated.confidence).toBeGreaterThan(uaOnly.confidence);
  });

  it('does NOT rescue the measured spoofed-Chrome case — that is the whole point', () => {
    // The scanners that matter copy a real Chrome UA verbatim. UA matching
    // must not be relied on as the primary mechanism; latency is what catches
    // this one, and fan-out catches it when latency is unavailable.
    expect(isKnownAutomationUserAgent(SPOOFED_CHROME_UA)).toBe(false);

    const result = classifyEngagement({
      occurredAt: after(6 * HOUR),
      referenceAt: DELIVERED_AT,
      userAgent: SPOOFED_CHROME_UA,
    });
    expect(result.verdict).toBe('likely_human');
  });

  it('treats missing/empty user-agents as no signal rather than as a hit', () => {
    expect(isKnownAutomationUserAgent(null)).toBe(false);
    expect(isKnownAutomationUserAgent(undefined)).toBe(false);
    expect(isKnownAutomationUserAgent('')).toBe(false);
    expect(isKnownAutomationUserAgent('   ')).toBe(false);
  });

  it('matches tokens case-insensitively', () => {
    expect(isKnownAutomationUserAgent('CURL/8.4.0')).toBe(true);
    expect(isKnownAutomationUserAgent('  UrlDefense Proxy  ')).toBe(true);
  });

  it('does not flag ordinary consumer browsers', () => {
    const realBrowsers = [
      SPOOFED_CHROME_UA,
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
    ];

    for (const userAgent of realBrowsers) {
      expect(isKnownAutomationUserAgent(userAgent), userAgent).toBe(false);
    }
  });

  it('exposes a non-empty, lowercase token list', () => {
    expect(AUTOMATION_USER_AGENT_TOKENS.length).toBeGreaterThan(0);
    for (const token of AUTOMATION_USER_AGENT_TOKENS) {
      expect(token).toBe(token.toLowerCase());
    }
  });
});

describe('countsAsHumanEngagement', () => {
  it('is true only for likely_human', () => {
    const human = classifyEngagement({ occurredAt: after(6 * HOUR), referenceAt: DELIVERED_AT });
    const automated = classifyEngagement({ occurredAt: after(SECOND), referenceAt: DELIVERED_AT });
    const unknown = classifyEngagement({ occurredAt: after(6 * HOUR), referenceAt: null });

    expect(countsAsHumanEngagement(human)).toBe(true);
    expect(countsAsHumanEngagement(automated)).toBe(false);
    expect(countsAsHumanEngagement(unknown)).toBe(false);
  });
});

describe('detectUserAgentIpFanOut', () => {
  /** N events sharing one UA, each from its own IP, one minute apart. */
  function fanOutEvents(count: number, userAgent = SPOOFED_CHROME_UA): FanOutEvent[] {
    return Array.from({ length: count }, (_unused, index) => ({
      id: `evt-${index}`,
      occurredAt: after(index * MINUTE),
      userAgent,
      ip: `203.0.113.${index + 1}`,
    }));
  }

  it('flags a spoofed-Chrome group spread across many distinct IPs', () => {
    const [group, ...rest] = detectUserAgentIpFanOut(fanOutEvents(12));

    expect(rest).toHaveLength(0);
    expect(group?.distinctIpCount).toBe(12);
    expect(group?.userAgent).toBe(SPOOFED_CHROME_UA.toLowerCase());
    expect(group?.eventIds).toHaveLength(12);
    expect(group?.windowStart).toBe(DELIVERED_AT_MS);
    expect(group?.windowEnd).toBe(DELIVERED_AT_MS + 11 * MINUTE);
  });

  it('flags exactly at FANOUT_MIN_DISTINCT_IPS and not one below', () => {
    expect(detectUserAgentIpFanOut(fanOutEvents(FANOUT_MIN_DISTINCT_IPS))).toHaveLength(1);
    expect(detectUserAgentIpFanOut(fanOutEvents(FANOUT_MIN_DISTINCT_IPS - 1))).toHaveLength(0);
  });

  it('counts distinct IPs, not events — one busy person is not fan-out', () => {
    const repeatVisitor: FanOutEvent[] = Array.from({ length: 20 }, (_unused, index) => ({
      id: `evt-${index}`,
      occurredAt: after(index * MINUTE),
      userAgent: SPOOFED_CHROME_UA,
      ip: index % 2 === 0 ? '198.51.100.7' : '198.51.100.8',
    }));

    expect(detectUserAgentIpFanOut(repeatVisitor)).toHaveLength(0);
  });

  it('does not merge different user-agent strings into one group', () => {
    const mixed: FanOutEvent[] = Array.from({ length: 8 }, (_unused, index) => ({
      id: `evt-${index}`,
      occurredAt: after(index * MINUTE),
      userAgent: index % 2 === 0 ? SPOOFED_CHROME_UA : 'Mozilla/5.0 SomeOtherBuild/1.0',
      ip: `203.0.113.${index + 1}`,
    }));

    // 4 distinct IPs per UA — below the threshold on both sides.
    expect(detectUserAgentIpFanOut(mixed)).toHaveLength(0);
  });

  it('normalizes whitespace and case before grouping', () => {
    const events: FanOutEvent[] = Array.from({ length: 6 }, (_unused, index) => ({
      id: `evt-${index}`,
      occurredAt: after(index * MINUTE),
      userAgent: index % 2 === 0 ? '  Scanner   Fleet/1.0 ' : 'scanner fleet/1.0',
      ip: `203.0.113.${index + 1}`,
    }));

    const [group, ...rest] = detectUserAgentIpFanOut(events);
    expect(rest).toHaveLength(0);
    expect(group?.userAgent).toBe('scanner fleet/1.0');
    expect(group?.distinctIpCount).toBe(6);
  });

  it('keeps an event exactly windowMs after the group start inside the window', () => {
    const events: FanOutEvent[] = [
      { id: 'a', occurredAt: after(0), userAgent: 'ua', ip: '1.1.1.1' },
      { id: 'b', occurredAt: after(1), userAgent: 'ua', ip: '1.1.1.2' },
      { id: 'c', occurredAt: after(2), userAgent: 'ua', ip: '1.1.1.3' },
      { id: 'd', occurredAt: after(3), userAgent: 'ua', ip: '1.1.1.4' },
      { id: 'e', occurredAt: after(FANOUT_WINDOW_MS), userAgent: 'ua', ip: '1.1.1.5' },
    ];

    const [group, ...rest] = detectUserAgentIpFanOut(events);
    expect(rest).toHaveLength(0);
    expect(group?.distinctIpCount).toBe(FANOUT_MIN_DISTINCT_IPS);
    expect(group?.eventIds).toContain('e');
  });

  it('splits an event one millisecond past the window into its own group', () => {
    const events: FanOutEvent[] = [
      { id: 'a', occurredAt: after(0), userAgent: 'ua', ip: '1.1.1.1' },
      { id: 'b', occurredAt: after(1), userAgent: 'ua', ip: '1.1.1.2' },
      { id: 'c', occurredAt: after(2), userAgent: 'ua', ip: '1.1.1.3' },
      { id: 'd', occurredAt: after(3), userAgent: 'ua', ip: '1.1.1.4' },
      { id: 'e', occurredAt: after(FANOUT_WINDOW_MS + 1), userAgent: 'ua', ip: '1.1.1.5' },
    ];

    // Four IPs in the first window, one in the second — neither reaches five.
    expect(detectUserAgentIpFanOut(events)).toHaveLength(0);
  });

  it('honours custom windowMs and minDistinctIps options', () => {
    const events = fanOutEvents(3);

    expect(detectUserAgentIpFanOut(events, { minDistinctIps: 3 })).toHaveLength(1);
    expect(detectUserAgentIpFanOut(events, { minDistinctIps: 3, windowMs: 30 * SECOND })).toHaveLength(
      0,
    );
  });

  it('skips events missing a timestamp, a user-agent, or an IP', () => {
    const incomplete: FanOutEvent[] = [
      { id: 'no-ip', occurredAt: after(0), userAgent: 'ua', ip: null },
      { id: 'no-ua', occurredAt: after(0), userAgent: null, ip: '1.1.1.1' },
      { id: 'no-time', occurredAt: null, userAgent: 'ua', ip: '1.1.1.2' },
      { id: 'bad-time', occurredAt: 'nope', userAgent: 'ua', ip: '1.1.1.3' },
      { id: 'blank-ua', occurredAt: after(0), userAgent: '   ', ip: '1.1.1.4' },
      { id: 'ok-1', occurredAt: after(0), userAgent: 'ua', ip: '1.1.1.5' },
      { id: 'ok-2', occurredAt: after(0), userAgent: 'ua', ip: '1.1.1.6' },
    ];

    // Only two usable events survive, so nothing is flagged.
    expect(detectUserAgentIpFanOut(incomplete)).toHaveLength(0);
  });

  it('returns an empty array for an empty input', () => {
    expect(detectUserAgentIpFanOut([])).toEqual([]);
  });

  it('is order-independent for a given set of events', () => {
    const events = fanOutEvents(9);
    const reversed = [...events].reverse();

    expect(detectUserAgentIpFanOut(reversed)).toEqual(detectUserAgentIpFanOut(events));
  });
});

describe('flagAutomatedByIpFanOut', () => {
  it('maps every event in a flagged group to an automated classification', () => {
    const events: FanOutEvent[] = Array.from({ length: 7 }, (_unused, index) => ({
      id: `evt-${index}`,
      occurredAt: after(index * MINUTE),
      userAgent: SPOOFED_CHROME_UA,
      ip: `203.0.113.${index + 1}`,
    }));

    const flagged = flagAutomatedByIpFanOut(events);

    expect(flagged.size).toBe(7);
    for (const event of events) {
      const classification = flagged.get(event.id);
      expect(classification?.verdict).toBe('automated');
      expect(classification?.reason).toBe('ip_fan_out');
      // Fan-out is an aggregate signal; it says nothing about per-event timing.
      expect(classification?.latencyMs).toBeNull();
    }
  });

  it('returns an empty map when nothing reaches the threshold', () => {
    const events: FanOutEvent[] = [
      { id: 'a', occurredAt: after(0), userAgent: SPOOFED_CHROME_UA, ip: '1.1.1.1' },
      { id: 'b', occurredAt: after(MINUTE), userAgent: SPOOFED_CHROME_UA, ip: '1.1.1.2' },
    ];

    expect(flagAutomatedByIpFanOut(events).size).toBe(0);
  });

  it('overrides a likely_human latency verdict for the spoofed-UA fleet', () => {
    // The scenario latency alone cannot catch: real-looking Chrome UA, no
    // reference timestamp available, so per-event classification says unknown —
    // fan-out is what turns it into a machine.
    const events: FanOutEvent[] = Array.from({ length: 6 }, (_unused, index) => ({
      id: `evt-${index}`,
      occurredAt: after(index * MINUTE),
      userAgent: SPOOFED_CHROME_UA,
      ip: `203.0.113.${index + 1}`,
    }));

    const perEvent = classifyEngagement({
      occurredAt: after(0),
      referenceAt: null,
      userAgent: SPOOFED_CHROME_UA,
      ip: '203.0.113.1',
    });
    expect(perEvent.verdict).toBe('unknown');

    const flagged = flagAutomatedByIpFanOut(events);
    expect(flagged.get('evt-0')?.verdict).toBe('automated');
  });
});
