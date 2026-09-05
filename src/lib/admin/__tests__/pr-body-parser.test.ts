import { describe, expect, it } from 'vitest';
import { inferWorkAreaFromTitle, parsePullRequestBody, stripHtmlComments } from '@/lib/admin/pr-body-parser';

const SAMPLE_BODY = `## Summary

Fix calendar timezone drift on GolfHelm events.

## Partner-readable summary

Coaches saw practice blocks on the wrong day after DST. What changed: events now store team timezone and render in local wall time. Why it matters: demo reliability for spring onboarding.

## Type of change

- [x] Bug fix
- [ ] Feature / new behavior

## Area

golf

## Git Activity Timeline note

Calendar events stay on the correct day after timezone changes.

## Checklist

- [x] Tests pass
`;

describe('parsePullRequestBody', () => {
  it('extracts template sections into problem / fix / area', () => {
    const parsed = parsePullRequestBody(SAMPLE_BODY, 'fix(golf): calendar timezone');
    expect(parsed.area).toBe('golf');
    expect(parsed.summary).toContain('timezone drift');
    expect(parsed.problem).toContain('wrong day');
    expect(parsed.fix).toContain('local wall time');
    expect(parsed.timelineNote).toContain('correct day');
    expect(parsed.changeTypes).toEqual(['Bug fix']);
  });

  it('falls back to title inference when Area is missing', () => {
    const parsed = parsePullRequestBody('## Summary\n\nPipeline card drag fix.', 'fix(baseball): pipeline stage drag');
    expect(parsed.area).toBe('baseball');
  });

  it('uses summary when partner block is absent', () => {
    const parsed = parsePullRequestBody('## Summary\n\nHarden admin Sentry read API.', 'fix(admin): sentry errors tab');
    expect(parsed.area).toBe('bridge');
    expect(parsed.problem).toContain('Sentry');
  });
});

describe('inferWorkAreaFromTitle', () => {
  it('detects coachhelm from title keywords', () => {
    expect(inferWorkAreaFromTitle('feat(coachhelm): insight lifecycle')).toBe('coachhelm');
  });
});

describe('stripHtmlComments', () => {
  it('strips an ordinary comment', () => {
    expect(stripHtmlComments('before <!-- hidden --> after')).toBe('before  after');
  });

  it('leaves no comment marker behind for interleaved openers/closers', () => {
    // The lazy paired regex consumes the OUTER-looking pair greedily-lazy
    // from the first `<!--` to the nearest following `-->`, so 'x' (inside
    // that span) is removed along with the markers; what matters for safety
    // is that no `<!--`/`-->` fragment survives to reopen or close a real
    // comment downstream.
    const result = stripHtmlComments('<!-- x <!-- --> y -->');
    expect(result).not.toContain('<!--');
    expect(result).not.toContain('-->');
  });

  it('js/incomplete-multi-character-sanitization (#514/#515): a single non-overlapping pass can concatenate a NEW <!-- out of what survives on either side of a removed one', () => {
    // 8 chars: < ! < ! - - - -. No `-->` follows far enough right for the
    // paired regex to match at all, so a single `.replace(/<!--/g, '')` pass
    // removes only the "<!--" at index 2..5, leaving '<!' + '--' = '<!--'
    // behind — a fresh, unremoved match created by one pass. The loop must
    // run a second time to catch it.
    expect(stripHtmlComments('<!<!----')).toBe('');
  });

  it('strips an unterminated opener with no matching closer, keeping the text it introduced', () => {
    // No `-->` exists anywhere, so there is no way to know how much of the
    // trailing text was meant to be "inside" the comment — only the
    // dangerous marker itself is removed, not the text after it.
    expect(stripHtmlComments('before <!-- never closed')).toBe('before  never closed');
  });

  it('strips a stray closer with no opener', () => {
    expect(stripHtmlComments('before --> after')).toBe('before  after');
  });

  it('leaves ordinary text alone', () => {
    expect(stripHtmlComments('Fixes the calendar drift bug.')).toBe('Fixes the calendar drift bug.');
  });
});
