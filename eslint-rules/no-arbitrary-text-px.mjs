/**
 * no-arbitrary-text-px — flag `text-[Npx]` arbitrary font-size utilities.
 *
 * Rationale (synthesis §5, rule #18): "No arbitrary text-[]/px-[]/mt-[]
 * outside src/components/ui/. The system is the system." Baseline at
 * W0: 1,540 arbitrary `text-[Npx]` callsites (95% bypass of the
 * canonical 9-step type scale). Use `text-display` / `text-h1` /
 * `text-h2` / `text-h3` / `text-body-lg` / `text-body` / `text-body-sm`
 * / `text-caption` / `text-eyebrow` instead.
 */

import { checkClassNameAttribute } from './_classname-walker.mjs';

const ALLOWED_PATH = /(\/(components\/ui|mockups|eslint-rules)\/|tailwind\.config\.ts$|\.stories\.[jt]sx?$)/;
const ARBITRARY_TEXT_PX = /text-\[[0-9.]+px\]/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow arbitrary text-[Npx] outside src/components/ui. Use the canonical 9-step type scale.',
    },
    messages: {
      noArbitraryTextPx:
        'Replace "{{ match }}" with a canonical type scale utility (text-display | text-h1 | text-h2 | text-h3 | text-body-lg | text-body | text-body-sm | text-caption | text-eyebrow). (W0 token foundation — synthesis §5 rule #18)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (ALLOWED_PATH.test(filename)) return {};
    return {
      JSXAttribute(node) {
        checkClassNameAttribute(node, ARBITRARY_TEXT_PX, context, 'noArbitraryTextPx');
      },
    };
  },
};
