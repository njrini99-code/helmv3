/**
 * Deterministic spam-compliance linting for CRM email templates.
 *
 * Pure + synchronous so the template editor can re-lint on every keystroke.
 * Two kinds of checks:
 *  - CAN-SPAM structural requirements (unsubscribe path, postal address,
 *    non-deceptive subject) — these FAIL when missing.
 *  - Deliverability heuristics (trigger vocabulary, caps/exclamation density,
 *    link balance, thin content) — these WARN; they hurt inbox placement but
 *    aren't legal requirements.
 *
 * Merge tags ({first_name} etc.) are validated against the known tag set —
 * an unknown tag FAILS because it would render as literal braces in a send.
 */

export type ComplianceLevel = 'pass' | 'warn' | 'fail';

export interface ComplianceCheck {
  id: string;
  level: ComplianceLevel;
  label: string;
  detail: string;
}

export interface ComplianceReport {
  verdict: ComplianceLevel;
  /** 0-100; fails weigh 25, warns weigh 10. */
  score: number;
  checks: ComplianceCheck[];
}

import { MERGE_TOKENS, SERVER_TOKENS } from '@/lib/crm/merge-tags';

/** Every tag the send pipeline resolves — canonical client tokens plus the
    server-resolved ones ({unsubscribe_url} becomes the real link on send). */
export const KNOWN_MERGE_TAGS: ReadonlySet<string> = new Set<string>([
  ...MERGE_TOKENS,
  ...SERVER_TOKENS,
]);

const SPAM_TRIGGER_PATTERNS: Array<{ re: RegExp; phrase: string }> = [
  { re: /\bact now\b/i, phrase: 'act now' },
  { re: /\blimited[- ]time\b/i, phrase: 'limited time' },
  { re: /\b100% (free|guaranteed)\b/i, phrase: '100% free/guaranteed' },
  { re: /\brisk[- ]free\b/i, phrase: 'risk-free' },
  { re: /\bno obligation\b/i, phrase: 'no obligation' },
  { re: /\bwinner\b/i, phrase: 'winner' },
  { re: /\bcash bonus\b/i, phrase: 'cash bonus' },
  { re: /\$\$\$/, phrase: '$$$' },
  { re: /\bclick here\b/i, phrase: 'click here' },
  { re: /\burgent\b/i, phrase: 'urgent' },
  { re: /\bbuy now\b/i, phrase: 'buy now' },
  { re: /\bfree trial\b/i, phrase: 'free trial' },
  { re: /\bdouble your\b/i, phrase: 'double your' },
  { re: /\bmake money\b/i, phrase: 'make money' },
  { re: /\bexclusive deal\b/i, phrase: 'exclusive deal' },
];

/** Strip HTML to comparable text (crude but deterministic — no DOM needed). */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function check(
  id: string,
  level: ComplianceLevel,
  label: string,
  detail: string,
): ComplianceCheck {
  return { id, level, label, detail };
}

export function lintTemplate(input: {
  subject: string;
  body: string;
  format: 'plain' | 'html' | 'text';
}): ComplianceReport {
  const { subject, format } = input;
  const isHtml = format === 'html';
  const bodyText = isHtml ? htmlToText(input.body) : input.body;
  const combined = `${subject}\n${bodyText}`;
  const checks: ComplianceCheck[] = [];

  // ── CAN-SPAM: opt-out path ────────────────────────────────────────────────
  const hasOptOut =
    /unsubscribe|opt[- ]?out|stop receiving|no longer (wish|want) to (receive|hear)|reply\s+(with\s+)?["“']?(stop|no)\b/i.test(
      combined,
    );
  checks.push(
    hasOptOut
      ? check('opt-out', 'pass', 'Opt-out path', 'An unsubscribe / opt-out line is present.')
      : check(
          'opt-out',
          'fail',
          'Opt-out path',
          'CAN-SPAM requires a clear way to stop receiving email — add an unsubscribe or "reply STOP" line.',
        ),
  );

  // ── CAN-SPAM: physical postal address ─────────────────────────────────────
  const hasAddress =
    /\b\d{1,6}\s+[A-Za-z0-9.'\- ]{3,40}\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|suite|ste|floor)\b/i.test(
      combined,
    ) || /\b[A-Z][a-z]+,?\s+(?:[A-Z]{2})\s+\d{5}(?:-\d{4})?\b/.test(combined);
  checks.push(
    hasAddress
      ? check('address', 'pass', 'Postal address', 'A physical mailing address is present.')
      : check(
          'address',
          'fail',
          'Postal address',
          'CAN-SPAM requires a valid physical postal address in every commercial email.',
        ),
  );

  // ── CAN-SPAM: non-deceptive subject ───────────────────────────────────────
  const fakeThread = /^\s*(re|fwd?):/i.test(subject);
  checks.push(
    fakeThread
      ? check(
          'subject-honesty',
          'fail',
          'Honest subject',
          '"Re:"/"Fwd:" on a first-touch email fakes a prior conversation — deceptive subjects violate CAN-SPAM.',
        )
      : check('subject-honesty', 'pass', 'Honest subject', 'Subject does not fake a prior thread.'),
  );

  // ── Merge-tag hygiene ─────────────────────────────────────────────────────
  const tags = [...combined.matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1]!.toLowerCase());
  const unknownTags = [...new Set(tags.filter((t) => !KNOWN_MERGE_TAGS.has(t)))];
  checks.push(
    unknownTags.length === 0
      ? check('merge-tags', 'pass', 'Merge tags', tags.length ? 'All merge tags are resolvable.' : 'No merge tags used.')
      : check(
          'merge-tags',
          'fail',
          'Merge tags',
          `Unknown tag(s) would render literally: ${unknownTags.map((t) => `{${t}}`).join(', ')}.`,
        ),
  );

  // ── Subject length ────────────────────────────────────────────────────────
  if (!subject.trim()) {
    checks.push(check('subject-length', 'fail', 'Subject length', 'Subject is empty.'));
  } else if (subject.length > 70) {
    checks.push(
      check(
        'subject-length',
        'warn',
        'Subject length',
        `${subject.length} chars — subjects over ~70 get truncated and correlate with spam filtering.`,
      ),
    );
  } else {
    checks.push(check('subject-length', 'pass', 'Subject length', `${subject.length} chars.`));
  }

  // ── Trigger vocabulary ────────────────────────────────────────────────────
  const hits = SPAM_TRIGGER_PATTERNS.filter(({ re }) => re.test(combined)).map((h) => h.phrase);
  checks.push(
    hits.length === 0
      ? check('trigger-words', 'pass', 'Trigger words', 'No common spam-trigger phrases found.')
      : check(
          'trigger-words',
          hits.length >= 3 ? 'fail' : 'warn',
          'Trigger words',
          `Found: ${hits.join(', ')}.`,
        ),
  );

  // ── Caps / exclamation density ────────────────────────────────────────────
  const letters = combined.replace(/[^A-Za-z]/g, '');
  const capsRatio = letters.length >= 20 ? combined.replace(/[^A-Z]/g, '').length / letters.length : 0;
  const exclamations = (combined.match(/!/g) ?? []).length;
  if (capsRatio > 0.3 || exclamations >= 4) {
    checks.push(
      check(
        'shouting',
        'warn',
        'Caps & punctuation',
        `${Math.round(capsRatio * 100)}% caps, ${exclamations} exclamation marks — reads as shouting to filters.`,
      ),
    );
  } else {
    checks.push(check('shouting', 'pass', 'Caps & punctuation', 'Caps and punctuation look natural.'));
  }

  // ── Body substance ────────────────────────────────────────────────────────
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) {
    checks.push(check('substance', 'fail', 'Body content', 'Body is empty.'));
  } else if (wordCount < 35) {
    checks.push(
      check(
        'substance',
        'warn',
        'Body content',
        `${wordCount} words — very thin content is a spam signal (and rarely converts).`,
      ),
    );
  } else {
    checks.push(check('substance', 'pass', 'Body content', `${wordCount} words.`));
  }

  // ── HTML-specific: link balance + insecure links + image-only ─────────────
  if (isHtml) {
    const links = [...input.body.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]!);
    const insecure = links.filter((href) => /^http:\/\//i.test(href));
    checks.push(
      insecure.length === 0
        ? check('link-security', 'pass', 'Link security', links.length ? 'All links are https.' : 'No links.')
        : check(
            'link-security',
            'warn',
            'Link security',
            `${insecure.length} plain-http link(s) — filters distrust them.`,
          ),
    );

    if (links.length > 0 && wordCount / links.length < 15) {
      checks.push(
        check(
          'link-balance',
          'warn',
          'Link balance',
          `${links.length} links for ${wordCount} words — link-heavy emails score worse.`,
        ),
      );
    } else {
      checks.push(check('link-balance', 'pass', 'Link balance', `${links.length} link(s).`));
    }

    const hasImages = /<img\s/i.test(input.body);
    if (hasImages && wordCount < 25) {
      checks.push(
        check(
          'image-only',
          'warn',
          'Image/text ratio',
          'Mostly-image emails with little text are a classic spam signature.',
        ),
      );
    } else {
      checks.push(check('image-only', 'pass', 'Image/text ratio', 'Healthy text-to-image balance.'));
    }
  }

  // ── Verdict + score ───────────────────────────────────────────────────────
  const fails = checks.filter((c) => c.level === 'fail').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  const verdict: ComplianceLevel = fails > 0 ? 'fail' : warns > 0 ? 'warn' : 'pass';
  const score = Math.max(0, 100 - fails * 25 - warns * 10);

  return { verdict, score, checks };
}
