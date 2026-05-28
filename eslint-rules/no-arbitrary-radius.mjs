/**
 * no-arbitrary-radius — flag `rounded-[Npx]` arbitrary border-radius
 * utilities outside src/components/ui.
 *
 * Rationale (synthesis §5, A2 finding): Button hardcodes
 * `rounded-[10px]` while `--radius-md: 10px` already exists. Every
 * arbitrary `rounded-[Npx]` is a missed opportunity to share the
 * canonical scale (sm 6 / md 10 / lg 12 / xl 16 / 2xl 20 / 3xl 24).
 *
 * Baseline at W0: 73 arbitrary `rounded-[Npx]` callsites.
 */

import { checkClassNameAttribute } from './_classname-walker.mjs';

const ALLOWED_PATH = /(\/(components\/ui|mockups|eslint-rules)\/|tailwind\.config\.ts$|\.stories\.[jt]sx?$)/;
const ARBITRARY_RADIUS = /rounded-\[[0-9.]+px\]/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow arbitrary rounded-[Npx] outside src/components/ui. Use the canonical radius scale.',
    },
    messages: {
      noArbitraryRadius:
        'Replace "{{ match }}" with a canonical radius utility (rounded-sm 6 | rounded-md 10 | rounded-lg 12 | rounded-xl 16 | rounded-2xl 20 | rounded-3xl 24 | rounded-full). (W0 token foundation — synthesis §5)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (ALLOWED_PATH.test(filename)) return {};
    return {
      JSXAttribute(node) {
        checkClassNameAttribute(node, ARBITRARY_RADIUS, context, 'noArbitraryRadius');
      },
    };
  },
};
