/**
 * no-duplicate-radius-in-fairway — inside src/components/fairway/**, forbid the
 * canonical-scale radius utilities that are PIXEL-IDENTICAL to a Fairway ramp
 * step.
 *
 * Two borderRadius scales live in the same tailwind.config.ts block:
 *
 *   canonical   sm 6 · md 10 · lg 12 · xl 16 · 2xl 20 · 3xl 24
 *   Fairway     fw-sm 10 · fw-md 14 · card 20 · fw-lg 28
 *
 * Two pairs render the same pixels today while naming different tokens:
 * `rounded-md` === `rounded-fw-sm` (10px) and `rounded-2xl` === `rounded-card`
 * (20px). Those are the dangerous ones — they look correct, review clean, and
 * silently diverge the moment either scale is retuned. Nothing enforced the
 * ban, so 13 of them accumulated inside the Fairway path, including in the
 * reference Segmented control itself.
 *
 * Scope is deliberately narrow. `rounded-sm` (6), `rounded-lg` (12) and
 * `rounded-xl` (16) have NO exact Fairway equivalent — the ramp's smallest step
 * is 10px — and several of their call sites are 10-18px swatches, legend dots
 * and checkboxes where a 10px radius would turn a square into a circle. Those
 * are a visual decision, not a token cleanup, and are left to a design pass.
 */

import { checkClassNameAttribute } from './_classname-walker.mjs';

const FAIRWAY_PATH = /\/src\/components\/fairway\//;
const DUPLICATE_RADIUS = /\brounded-(?:md|2xl)\b/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Inside src/components/fairway/**, use the Fairway radius ramp instead of a canonical-scale radius that renders identical pixels.',
    },
    messages: {
      noDuplicateRadius:
        'Replace "{{ match }}" with its Fairway ramp equivalent — rounded-md → rounded-fw-sm (both 10px), rounded-2xl → rounded-card (both 20px). Same pixels today, different token, diverges on any retune.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (!FAIRWAY_PATH.test(filename)) return {};
    return {
      JSXAttribute(node) {
        checkClassNameAttribute(node, DUPLICATE_RADIUS, context, 'noDuplicateRadius');
      },
    };
  },
};
