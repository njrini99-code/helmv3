/**
 * The bubble's long-press opens the reactions row, and on touch the bubble
 * turns text selection off so iOS does not start a highlight under it
 * (`MessageThreadPane.incomingActions.test.ts` covers the class). This suite
 * covers the OTHER half, which only the native app hits: `globals.css`'s
 * Capacitor layer re-enables `user-select: text` on every `p` and `span` at
 * `body.capacitor p` specificity (0,1,1), which beats the bubble's single
 * Tailwind class (0,1,0). The message text is a `<p>` inside the bubble, so
 * on the app a hold opened the row AND highlighted the text. The fix is a
 * bubble-scoped rule that outranks the re-enable; these assertions pin its
 * shape and its position in the cascade.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
const pane = readFileSync(
  resolve(process.cwd(), 'src/components/fairway/pages/messages/MessageThreadPane.tsx'),
  'utf8',
);

const reenableStart = css.indexOf('body.capacitor p,');
const overrideStart = css.indexOf('body.capacitor [data-message-bubble],');
const overrideBlock = css.slice(overrideStart, css.indexOf('}', overrideStart));

describe('Capacitor: message bubbles stay unselectable despite the global p/span re-enable', () => {
  it('the re-enable rule this guards against still exists (otherwise the override is dead code)', () => {
    expect(reenableStart).toBeGreaterThan(-1);
    const reenable = css.slice(reenableStart, css.indexOf('}', reenableStart));
    expect(reenable).toContain('body.capacitor span');
    expect(reenable).toContain('user-select: text');
  });

  it('a bubble-scoped rule covers the wrapper, its <p> and its <span>', () => {
    expect(overrideStart).toBeGreaterThan(-1);
    expect(overrideBlock).toContain('body.capacitor [data-message-bubble] p');
    expect(overrideBlock).toContain('body.capacitor [data-message-bubble] span');
    expect(overrideBlock).toContain('-webkit-user-select: none');
    expect(overrideBlock).toContain('user-select: none');
    expect(overrideBlock).toContain('-webkit-touch-callout: none');
  });

  it('comes AFTER the re-enable in the sheet, so it wins even at equal specificity', () => {
    expect(overrideStart).toBeGreaterThan(reenableStart);
  });

  it('targets the attribute the bubble actually carries, and the text is a <p> inside it', () => {
    expect(pane).toContain('data-message-bubble');
    // The message body is a <p> under the bubble — the element the global
    // rule re-enabled. If this ever becomes a <div>, the override still holds
    // through the wrapper rule, but the reason for the p/span pair goes away.
    expect(pane).toMatch(/<p\s+className=\{cn\(\s*'whitespace-pre-wrap break-words/);
  });
});
