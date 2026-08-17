/**
 * `normalizeWebsiteUrl` (SAVE) and `safeCourseWebsiteUrl` (RENDER) are the two
 * halves of the course-website defence, and until now neither had a single test.
 *
 * They are live on both sides:
 *   SAVE   — `src/app/golf/actions/course-library.ts:980` (create) and `:1129` (update)
 *   RENDER — `src/components/golf/courses/CourseDetailDrawer.tsx:438`
 *
 * A coach types this field by hand, so it is an untrusted string that ends up
 * in an anchor `href`. That is precisely the shape that wants a hostile-input
 * battery pinned down, rather than trusted to stay correct by inspection.
 *
 * The scheme-prepend branch is the subtle part. Its comment says anything
 * "already carrying a scheme (http://, https://, or a bogus one) is left as-is
 * so validation can catch a non-web scheme like `javascript:`" — but the guard
 * regex requires `://`, and `javascript:alert(1)` has no slashes. It therefore
 * takes the PREPEND branch, not the leave-as-is branch. It still ends up
 * rejected (`https://javascript:alert(1)` fails to parse), so the outcome is
 * right while the stated reason is not. Worth pinning so a future "cleanup" of
 * that regex cannot quietly turn a rejection into an acceptance.
 */
import { describe, it, expect } from 'vitest';
import { normalizeWebsiteUrl, safeCourseWebsiteUrl } from '@/lib/golf/course-library';

describe('normalizeWebsiteUrl — hostile schemes are rejected', () => {
  const HOSTILE = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'jAvAsCrIpT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'javascript:alert(1)//evil.com',
    'javascript://evil.com/%0aalert(1)',
  ];

  it.each(HOSTILE)('rejects %j', (input) => {
    expect(normalizeWebsiteUrl(input)).toEqual({ ok: false });
  });

  it.each(HOSTILE)('never renders %j as an href', (input) => {
    expect(safeCourseWebsiteUrl(input)).toBeNull();
  });
});

describe('normalizeWebsiteUrl — accepts real course sites', () => {
  it('passes an absolute https URL through unchanged', () => {
    expect(normalizeWebsiteUrl('https://pinehurst.com')).toEqual({
      ok: true,
      value: 'https://pinehurst.com',
    });
  });

  it('prepends https:// when the coach omits the scheme', () => {
    expect(normalizeWebsiteUrl('pinehurst.com')).toEqual({
      ok: true,
      value: 'https://pinehurst.com',
    });
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(normalizeWebsiteUrl('   pinehurst.com  ')).toEqual({
      ok: true,
      value: 'https://pinehurst.com',
    });
  });

  it('treats empty and blank as "no website", not as invalid', () => {
    for (const blank of ['', '   ', null, undefined]) {
      expect(normalizeWebsiteUrl(blank), JSON.stringify(blank)).toEqual({ ok: true, value: null });
    }
  });

  it('rejects a bare token with no dotted host', () => {
    // "https://x" and "http://localhost" are the mistakes this guards.
    expect(normalizeWebsiteUrl('https://x')).toEqual({ ok: false });
    expect(normalizeWebsiteUrl('http://localhost')).toEqual({ ok: false });
  });
});

describe('normalizeWebsiteUrl — protocol-relative input', () => {
  /**
   * `//pinehurst.com` is what you get pasting an href straight out of HTML, so
   * it reaches this field in practice. It has no scheme, so it takes the
   * prepend branch and becomes `https:////pinehurst.com` — four slashes.
   *
   * `new URL()` normalises that away when the link is followed, so it is not a
   * broken link. But the malformed string is what gets PERSISTED and what the
   * coach sees when they reopen the edit field, which reads as corruption.
   */
  it('normalises //host to a single scheme separator', () => {
    expect(normalizeWebsiteUrl('//pinehurst.com')).toEqual({
      ok: true,
      value: 'https://pinehurst.com',
    });
  });

  it('collapses any run of leading slashes', () => {
    expect(normalizeWebsiteUrl('////pinehurst.com')).toEqual({
      ok: true,
      value: 'https://pinehurst.com',
    });
  });

  it('keeps the path when one is present', () => {
    expect(normalizeWebsiteUrl('//pinehurst.com/course/no2')).toEqual({
      ok: true,
      value: 'https://pinehurst.com/course/no2',
    });
  });

  it('does not mangle a legitimate absolute URL', () => {
    expect(normalizeWebsiteUrl('https://pinehurst.com/a//b')).toEqual({
      ok: true,
      value: 'https://pinehurst.com/a//b',
    });
  });
});
