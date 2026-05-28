/**
 * no-banned-color — flag deleted color palettes + non-canonical hexes
 * in className and inline style attributes.
 *
 * Rationale (synthesis §5, rules #2, #3, #17):
 *   - One brand green: `primary-*`. `helm-green-*`, `emerald-*`,
 *     `sf-green`, `field`, `fairway`, raw `green-*` all banned.
 *   - One red: `destructive` (#FF3B30). Delete `#DC2626`.
 *   - No raw `style={{ color: '#...' }}`. All color from tokens.
 *
 * Baseline at W0: 143 callsites referencing #16A34A directly (should
 * be `primary-600` or `--color-primary-600`), 6 callsites with
 * #DC2626 (should be `destructive`).
 */

import { checkClassNameAttribute, checkInlineStyle } from './_classname-walker.mjs';

const ALLOWED_PATH = /(\/(components\/ui|mockups|eslint-rules)\/|tailwind\.config\.ts$|\.stories\.[jt]sx?$)/;
// Banned Tailwind utility prefixes (matched anywhere inside a className string)
const BANNED_CLASS = /(helm-green-|sf-green\b|\bemerald-[0-9]|\bgreen-[0-9])/;
// Banned hex values (in inline `style={{ ... }}` or className arbitrary `[#...]`)
const BANNED_HEX = /(#16A34A\b|#16a34a\b|#DC2626\b|#dc2626\b)/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow deleted color palettes (helm-green, sf-green, emerald, raw green-*) and non-canonical hex literals (#16A34A direct, #DC2626).',
    },
    messages: {
      bannedClass:
        '"{{ match }}" is a deleted color palette. Use primary-* (brand green), destructive (#FF3B30), or warm-* (neutrals). (W0 token foundation — synthesis §5 rules #2/#3)',
      bannedHex:
        'Replace hex "{{ match }}" with a token: #16A34A → primary-600 / var(--color-primary-600); #DC2626 → destructive / var(--color-destructive). (W0 token foundation — synthesis §5 rule #17)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (ALLOWED_PATH.test(filename)) return {};
    return {
      JSXAttribute(node) {
        // className matches banned class prefixes
        checkClassNameAttribute(node, BANNED_CLASS, context, 'bannedClass');
        // className arbitrary values like text-[#16A34A] / bg-[#DC2626]
        checkClassNameAttribute(node, BANNED_HEX, context, 'bannedHex');
        // style={{ color: '#16A34A' }} / style={{ backgroundColor: '#DC2626' }}
        checkInlineStyle(node, BANNED_HEX, context, 'bannedHex');
      },
    };
  },
};
