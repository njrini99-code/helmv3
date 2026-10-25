import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** A29 and A24: render defects a user notices at 390px, held by the rules that fix them. */
const css = (name: string) => readFileSync(join(__dirname, '..', 'styles', name), 'utf8');

describe('Render must-fixes (A24, A29)', () => {
  it('a text field has no resize grip on a touch screen, and grows with its words where WebKit can', () => {
    const block = css('controls.css').match(/@media \(pointer: coarse\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(block).toMatch(/\.ch-textarea\s*\{\s*resize: none;/);
    expect(block).toMatch(/@supports \(field-sizing: content\)/);
  });

  it('on the phone, the Track hero’s distance words take their own line, clear of the hole drawing', () => {
    expect(css('rounds-track.css')).toMatch(/\.ch-rt-hero__dist > em \{\s*width: 100%;/);
  });

  it('the Hub strip fades over 28px and snaps to a figure; the phone tabs scroll at 16px apart, not packed edge to edge', () => {
    const hub = css('hub.css');
    // The 28px is the phone's edge-fade token since B4.
    expect(hub).toMatch(/\.ch-hb-h > \.ch-hb-strip \{[^}]*--ch-hs-fade: var\(--ch-edge-fade\);[^}]*scroll-snap-type: x proximity;/);
    expect(css('tokens.css')).toMatch(/--ch-edge-fade: 28px;/);
    expect(hub).toMatch(/\.ch-hb-tabs \{\s*justify-content: flex-start;\s*gap: calc\(16 \* var\(--ch-type-k\)\);/);
    expect(hub).not.toMatch(/\.ch-hb-tabs \{\s*justify-content: space-between;/);
  });

  it('the phone round card’s strokes gained sit on one baseline, and the season’s Putts column is the wide one', () => {
    const rounds = css('rounds.css');
    expect(rounds).toMatch(/\.ch-rcard-sg \{\s*align-items: end;/);
    expect(rounds).toMatch(/\.ch-rd\.is-phone \.ch-rd-season__f \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.4fr\) minmax\(0, 1fr\);/);
  });
});
