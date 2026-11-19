/**
 * The phone's top and bottom edges (F-49): the page colour on <html> and <body>, the frame's green in theme-color, and
 * light status-bar glyphs. Written by the shell (shell/ClubhouseFrame.tsx, usePhoneEdges).
 */
/** The phone edges as written: their colours, and how to put back what was there before the frame wrote them. */
export interface PhoneEdges {
  page: string;
  green: string;
  restore: () => void;
}

/**
 * Writes the phone edges, or rewrites them where they changed. Nothing is written when the colours are the ones already
 * there: a write to <html>'s inline style or its data-status-bar restyles the whole document, and the edges used to be
 * put back and written again on every page change, three times inside the section switch's commit (F-23, audit
 * 2026-11-19; WebKit, verify-after-merge). What was there before the frame stays the first write's, for the unmount.
 */
export function writePhoneEdges(current: PhoneEdges | null, page: string, green: string): PhoneEdges {
  const html = document.documentElement;
  const body = document.body;
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (current) {
    if (current.page !== page) {
      html.style.backgroundColor = page;
      body.style.backgroundColor = page;
    }
    // useGolfTheme can rewrite the tag on a theme change, so it is compared with the tag, not with the last write.
    if (meta && meta.content !== green) meta.content = green;
    if (html.dataset.statusBar !== 'light') html.dataset.statusBar = 'light';
    return { ...current, page, green };
  }
  const created = !meta;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  const before = meta.content;
  const was = { html: html.style.backgroundColor, body: body.style.backgroundColor };
  html.style.backgroundColor = page;
  body.style.backgroundColor = page;
  // The status area is always the frame's green; the bar's own ::before carries it up through a pull (owner call, sweep).
  meta.content = green;
  // So the app's status bar draws light glyphs on it in both themes (CHROME-P-01; CapacitorProvider watches this).
  const glyphsWere = html.dataset.statusBar;
  html.dataset.statusBar = 'light';
  const tag = meta;
  return {
    page,
    green,
    restore: () => {
      html.style.backgroundColor = was.html;
      body.style.backgroundColor = was.body;
      if (glyphsWere === undefined) delete html.dataset.statusBar;
      else html.dataset.statusBar = glyphsWere;
      if (created) tag.remove();
      else tag.content = before;
    },
  };
}
