import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { code, hits, ROOT, walk } from './_scan';

/**
 * CONS-23: one grab handle and one sheet radius. Every sheet's handle is controls.css .ch-grab (a sheet only places
 * it), and no sheet top is a raw radius in the twenties.
 */
describe('one sheet grab and radius (CONS-23)', () => {
  const css = walk(join(ROOT, 'styles'), /\.css$/);

  it('no stylesheet draws its own grab handle', () => {
    expect(hits(/(grab|handle)[^{;]*\{/, css).filter((h) => !/\.ch-grab\b/.test(h.text))).toEqual([]);
  });

  it('no sheet top is a raw radius in the twenties', () => {
    expect(hits(/border-radius:\s*2[0-9]px 2[0-9]px 0 0/, css)).toEqual([]);
  });

  it('every handle in the markup is the one grab', () => {
    const tsx = walk(ROOT, /\.tsx$/).filter((f) => !f.includes('__tests__'));
    expect(hits(/className="[^"]*(?:__grab|-grab)\b[^"]*"/, tsx).filter((h) => !/className="ch-grab(?: ch-grab--hit)?"/.test(h.text))).toEqual([]);
    const sheets = ['ui/Modal.tsx', 'shell/AccountSheet.tsx', 'shell/AskSheetBody.tsx', 'shell/Bell.tsx', 'ui/FormSheet.tsx', 'screens/rounds/track/CourseView.tsx'];
    for (const f of sheets) expect(code(join(ROOT, f)), f).toMatch(/className="ch-grab/);
  });

  it('Settings and Recruiting build their sheets on the one FormSheet', () => {
    for (const f of ['screens/settings/phone/sheets.tsx', 'screens/recruiting/RecSheet.tsx']) {
      const src = code(join(ROOT, f));
      expect(src, f).toMatch(/from '(?:\.\.\/)+ui\/FormSheet'/);
      expect(src, f).not.toMatch(/<dialog\b/);
    }
  });
});
