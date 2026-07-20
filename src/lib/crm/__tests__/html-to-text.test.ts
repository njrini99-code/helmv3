import { describe, it, expect } from 'vitest';
import { htmlToText } from '../html-to-text';

/**
 * Regression coverage for the raw-HTML-in-inbox incident: an html-format
 * template sent through the Gmail-direct path went out as literal markup in a
 * text/plain body. The fix sends multipart/alternative, with htmlToText()
 * producing the text part — so it must yield READABLE text (no tags, no CSS)
 * from a full email document.
 */
describe('htmlToText', () => {
  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>A live look at GolfHelm for college golf coaches</title>
  <style>.wrap{width:100%!important;padding:0 12px!important}.body-pad{padding:30px 24px!important}</style>
</head>
<body style="margin:0;padding:0;background-color:#F1EFE9;">
  <!-- Preheader (hidden) -->
  <p>Hi {first_name},</p>
  <p>Step inside a <strong>real college golf program</strong> &amp; see the daily flow.</p>
  <a href="https://helmsportslabs.com/demo">Book your demo</a>
  <p>Nick Rini<br/>Helm Sports Labs</p>
</body>
</html>`;

  it('drops head/style/doctype entirely — no CSS or markup leaks into the text part', () => {
    const text = htmlToText(doc);
    expect(text).not.toMatch(/<[a-z!/]/i);
    expect(text).not.toContain('!important');
    expect(text).not.toContain('DOCTYPE');
    expect(text).not.toContain('padding');
  });

  it('keeps the readable content, merge tags, entities, and link destinations', () => {
    const text = htmlToText(doc);
    expect(text).toContain('Hi {first_name},');
    expect(text).toContain('Step inside a real college golf program & see the daily flow.');
    expect(text).toContain('Book your demo (https://helmsportslabs.com/demo)');
    expect(text).toContain('Nick Rini\nHelm Sports Labs');
  });

  it('leaves plain text unchanged apart from whitespace normalization', () => {
    expect(htmlToText('Hi coach,\n\nQuick intro.\n\nNick')).toBe('Hi coach,\n\nQuick intro.\n\nNick');
  });
});
