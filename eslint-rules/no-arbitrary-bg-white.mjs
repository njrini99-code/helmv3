/**
 * no-arbitrary-bg-white — flag raw `bg-white` (and `bg-white/N` opacity
 * variants) outside src/components/ui.
 *
 * Rationale (synthesis §5): the W0 audit found 1,361+ `bg-white`
 * callsites. None of these participate in the canonical surface tier
 * (flat / raised / overlay / modal) or the cream/glass token system.
 * Use `bg-cream-50` (card-elevated), `glass-standard`, `glass-subtle`,
 * `glass-prominent`, or a token-backed `bg-surface-*` utility instead.
 *
 * Baseline at W0: 1,417 `bg-white` callsites.
 */

import { checkClassNameAttribute } from './_classname-walker.mjs';

const ALLOWED_PATH = /(\/(components\/ui|mockups|eslint-rules)\/|tailwind\.config\.ts$|\.stories\.[jt]sx?$)/;
const BG_WHITE = /\bbg-white(\/[0-9]+)?\b/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw bg-white outside src/components/ui. Use cream / glass / surface tokens instead.',
    },
    messages: {
      noBgWhite:
        'Replace "{{ match }}" with a canonical surface (bg-cream-50 for card-elevated, glass-standard for translucent panels, glass-subtle for filter rails, or a token-backed bg-surface-* utility). (W0 token foundation — synthesis §5)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (ALLOWED_PATH.test(filename)) return {};
    return {
      JSXAttribute(node) {
        checkClassNameAttribute(node, BG_WHITE, context, 'noBgWhite');
      },
    };
  },
};
