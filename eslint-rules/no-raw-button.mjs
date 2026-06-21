/**
 * no-raw-button — flag raw <button> elements in product code.
 *
 * Rationale (synthesis §5, rule #1): "No raw <button>/<input>/<select>.
 * Use <Button>, <Input>, <Select>. Lint-enforced." The codebase currently
 * has 1,234 raw <button> callsites vs 435 <Button> usages — every raw
 * button is a missing focus ring, missing keyboard handler, and missing
 * disabled state.
 *
 * Allowlist: components under `src/components/ui/` and the Fairway controls
 * primitive family `src/components/fairway/controls/` (P404 — the shared
 * SelectablePill / Button / Segmented / etc. ARE the wrapped primitives), mockup
 * pages, the Tailwind config file, and this lint-rule directory itself can use
 * raw elements because they're either (a) the primitive being wrapped or
 * (b) demo / configuration code.
 */

const ALLOWED_PATH = /(\/(components\/ui|components\/fairway\/controls|mockups|eslint-rules)\/|tailwind\.config\.ts$|\.stories\.[jt]sx?$)/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw <button> outside src/components/ui. Use <Button> from @/components/ui/button instead.',
    },
    messages: {
      noRawButton:
        'Use <Button> from @/components/ui/button instead of a raw <button>. (W0 token foundation — synthesis §5 rule #1)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (ALLOWED_PATH.test(filename)) return {};
    return {
      JSXOpeningElement(node) {
        if (node.name?.type === 'JSXIdentifier' && node.name.name === 'button') {
          context.report({ node, messageId: 'noRawButton' });
        }
      },
    };
  },
};
