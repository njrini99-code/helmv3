import { describe, it, expect } from 'vitest';
import { lintTemplate, KNOWN_MERGE_TAGS } from '@/lib/crm/spam-compliance';

const COMPLIANT_PLAIN = {
  subject: 'Quick intro — {school} Golf',
  format: 'plain' as const,
  body: [
    'Hi {first_name},',
    '',
    'I run Helm Sports Labs — we build GolfHelm, a team-management and stats platform for college golf programs.',
    'Programs in the {conference} use it to run qualifiers, track strokes-gained, and cut the spreadsheet work.',
    'Would a 15-minute walkthrough be useful this month? Happy to work around your schedule.',
    '',
    'Nick Rini',
    'Helm Sports Labs · 123 Main Street, Raleigh, NC 27601',
    'If you would rather not hear from me, reply STOP or use {unsubscribe_url} to unsubscribe.',
  ].join('\n'),
};

describe('lintTemplate — compliant template', () => {
  it('passes a well-formed plain template', () => {
    const report = lintTemplate(COMPLIANT_PLAIN);
    expect(report.verdict).toBe('pass');
    expect(report.score).toBe(100);
    expect(report.checks.every((c) => c.level === 'pass')).toBe(true);
  });

  it('knows the canonical merge tags including server-resolved ones', () => {
    expect(KNOWN_MERGE_TAGS.has('first_name')).toBe(true);
    expect(KNOWN_MERGE_TAGS.has('unsubscribe_url')).toBe(true);
  });
});

describe('lintTemplate — CAN-SPAM structural failures', () => {
  it('fails without an opt-out path', () => {
    const report = lintTemplate({
      ...COMPLIANT_PLAIN,
      body: COMPLIANT_PLAIN.body.replace(/If you would rather not.*$/m, ''),
    });
    expect(report.verdict).toBe('fail');
    expect(report.checks.find((c) => c.id === 'opt-out')?.level).toBe('fail');
  });

  it('fails without a postal address', () => {
    const report = lintTemplate({
      ...COMPLIANT_PLAIN,
      body: COMPLIANT_PLAIN.body.replace(/Helm Sports Labs · .*$/m, ''),
    });
    expect(report.checks.find((c) => c.id === 'address')?.level).toBe('fail');
  });

  it('fails a fake-thread subject', () => {
    const report = lintTemplate({ ...COMPLIANT_PLAIN, subject: 'Re: our call' });
    expect(report.checks.find((c) => c.id === 'subject-honesty')?.level).toBe('fail');
  });

  it('fails an unknown merge tag that would render literally', () => {
    const report = lintTemplate({
      ...COMPLIANT_PLAIN,
      body: `${COMPLIANT_PLAIN.body}\nBest, {coach_nickname}`,
    });
    const tagCheck = report.checks.find((c) => c.id === 'merge-tags');
    expect(tagCheck?.level).toBe('fail');
    expect(tagCheck?.detail).toContain('{coach_nickname}');
  });

  it('fails an empty subject and empty body', () => {
    const report = lintTemplate({ subject: '', body: '', format: 'plain' });
    expect(report.verdict).toBe('fail');
    expect(report.checks.find((c) => c.id === 'subject-length')?.level).toBe('fail');
    expect(report.checks.find((c) => c.id === 'substance')?.level).toBe('fail');
  });
});

describe('lintTemplate — deliverability heuristics', () => {
  it('warns on trigger phrases and fails at 3+', () => {
    const oneHit = lintTemplate({
      ...COMPLIANT_PLAIN,
      body: `${COMPLIANT_PLAIN.body}\nThis is a limited time offer.`,
    });
    expect(oneHit.checks.find((c) => c.id === 'trigger-words')?.level).toBe('warn');

    const threeHits = lintTemplate({
      ...COMPLIANT_PLAIN,
      body: `${COMPLIANT_PLAIN.body}\nAct now! Limited time! Click here!`,
    });
    expect(threeHits.checks.find((c) => c.id === 'trigger-words')?.level).toBe('fail');
  });

  it('warns on shouting (caps + exclamations)', () => {
    const report = lintTemplate({
      ...COMPLIANT_PLAIN,
      subject: 'HUGE SAVINGS FOR YOUR PROGRAM!!!!',
    });
    expect(report.checks.find((c) => c.id === 'shouting')?.level).toBe('warn');
  });

  it('warns on thin content', () => {
    const report = lintTemplate({
      subject: 'Hello',
      body: 'Hi — check us out. 123 Main Street, Raleigh, NC 27601. Reply STOP to unsubscribe.',
      format: 'plain',
    });
    expect(report.checks.find((c) => c.id === 'substance')?.level).toBe('warn');
  });
});

describe('lintTemplate — HTML-specific checks', () => {
  const htmlBody = (links: string) =>
    `<html><body><p>Hi {first_name}, we build software for college golf programs — qualifiers, strokes gained, travel, and the day-to-day operations your staff currently runs in spreadsheets. Would a short walkthrough help this season? We would love to show you what programs in the {conference} are doing.</p>${links}<p>Helm Sports Labs · 123 Main Street, Raleigh, NC 27601 · <a href="{unsubscribe_url}">Unsubscribe</a></p></body></html>`;

  it('passes healthy https-linked HTML', () => {
    const report = lintTemplate({
      subject: 'GolfHelm for {school}',
      body: htmlBody('<p><a href="https://helmsportslabs.com">See the product</a></p>'),
      format: 'html',
    });
    expect(report.verdict).toBe('pass');
  });

  it('warns on plain-http links', () => {
    const report = lintTemplate({
      subject: 'GolfHelm for {school}',
      body: htmlBody('<p><a href="http://helmsportslabs.com">See it</a></p>'),
      format: 'html',
    });
    expect(report.checks.find((c) => c.id === 'link-security')?.level).toBe('warn');
  });

  it('warns on image-heavy low-text bodies', () => {
    const report = lintTemplate({
      subject: 'GolfHelm',
      body: '<img src="https://x.example/hero.png" /><p>Look! 123 Main Street, Raleigh, NC 27601. <a href="{unsubscribe_url}">Unsubscribe</a></p>',
      format: 'html',
    });
    expect(report.checks.find((c) => c.id === 'image-only')?.level).toBe('warn');
  });

  it('strips style/script blocks before counting words', () => {
    const report = lintTemplate({
      subject: 'GolfHelm for {school}',
      body: `<style>.a{color:red}</style>${htmlBody('')}`,
      format: 'html',
    });
    expect(report.checks.find((c) => c.id === 'substance')?.level).toBe('pass');
  });
});
