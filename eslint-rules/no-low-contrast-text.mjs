/**
 * no-low-contrast-text — keep the classes that failed WCAG AA on the cream
 * surfaces out of golf className strings (CON-09, owner decision 2026-09-23:
 * more contrast, green is the contrasting colour).
 *
 * Each banned class measured below 4.5:1 as text on the warm cream canvas:
 *   text-accent-500 / text-accent-600   helm green as TEXT (2.5-3.5:1)
 *   text-primary-500 / text-primary-600 the same green on the legacy scale
 *   text-warm-400 / text-warm-500       fixed stone greys (2.1-3.9:1)
 *   text-amber-600                      raw amber ink (≈3:1)
 *   text-text-{primary,secondary,tertiary}/NN  an alpha-dimmed ink token
 *
 * Replacements: `text-accent-ink` for green text, `text-text-secondary` /
 * `text-text-tertiary` for quiet copy, `text-fw-warning-text` for amber ink.
 * Every replacement is held to its floor by
 * src/test/static/fairway-token-contrast.test.ts.
 */

import { checkClassNameAttribute } from './_classname-walker.mjs';

const BANNED =
  /(?<=^|[\s:!])(text-(?:accent|primary)-(?:500|600)|text-warm-(?:400|500)|text-amber-600|text-text-(?:primary|secondary|tertiary)\/\d+)(?![\w-])/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow text colour classes that fail WCAG AA on the Fairway cream surfaces (use text-accent-ink / text-text-secondary / text-text-tertiary / text-fw-warning-text).',
    },
    messages: {
      lowContrast:
        '"{{ match }}" fails 4.5:1 as text on the cream surfaces. Green text → text-accent-ink; quiet copy → text-text-secondary or text-text-tertiary (no /NN alpha); amber ink → text-fw-warning-text.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        checkClassNameAttribute(node, BANNED, context, 'lowContrast');
      },
    };
  },
};
