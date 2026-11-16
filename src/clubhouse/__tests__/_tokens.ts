import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

/**
 * Reads a Clubhouse token's colour as the page resolves it: the light root (`[data-ui='clubhouse']`) or the dark block
 * (`html[data-fw-theme='dark'] [data-ui='clubhouse']`, falling back to the light value it does not override), following
 * `var()` aliases. A surface token now names the one card or page it is (`--ch-sheet-bg: var(--ch-card-bg)`), so a
 * contrast test reads the colour that paints, not the first hex in the file.
 */
export type Theme = 'light' | 'dark';

const LIGHT = "[data-ui='clubhouse']";
const DARK = "html[data-fw-theme='dark'] [data-ui='clubhouse']";

const blocks = (() => {
  const root = postcss.parse(readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8'));
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  root.each((node) => {
    if (node.type !== 'rule') return;
    const into = node.selector === LIGHT ? light : node.selector === DARK ? dark : null;
    if (!into) return;
    node.each((d) => {
      if (d.type === 'decl' && d.prop.startsWith('--')) into.set(d.prop, d.value.trim());
    });
  });
  return { light, dark };
})();

/** A token's declared value (no resolution), or undefined. */
export const tokenValue = (name: string, theme: Theme): string | undefined => {
  const prop = name.startsWith('--') ? name : `--${name}`;
  return (theme === 'dark' ? blocks.dark.get(prop) : undefined) ?? blocks.light.get(prop);
};

/** A token's hex (#rrggbb, lower case) after following var() aliases; throws when it does not end in one. */
export const tokenHex = (name: string, theme: Theme): string => {
  let value = tokenValue(name, theme);
  for (let i = 0; i < 12 && value; i++) {
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) return `#${hex[1]!.toLowerCase()}`;
    const ref = value.match(/^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/);
    if (!ref) break;
    value = tokenValue(ref[1]!, theme) ?? ref[2]?.trim();
  }
  throw new Error(`${name} (${theme}) does not resolve to a hex: ${tokenValue(name, theme)}`);
};
