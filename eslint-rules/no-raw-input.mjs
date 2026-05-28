/**
 * no-raw-input — flag raw <input>, <select>, <textarea> in product code.
 *
 * Rationale (synthesis §5, rule #1): same as no-raw-button. Raw inputs
 * skip the canonical focus ring, the 16px iOS zoom-prevention font-size
 * rule, the cream/glass surface tinting, and the error-state shape that
 * `<Input>` / `<Select>` / `<Textarea>` provide.
 *
 * Allowlist: components under `src/components/ui/`, mockup pages, the
 * Tailwind config file, and this lint-rule directory itself.
 */

const ALLOWED_PATH = /(\/(components\/ui|mockups|eslint-rules)\/|tailwind\.config\.ts$|\.stories\.[jt]sx?$)/;
const BANNED = new Set(['input', 'select', 'textarea']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw <input>/<select>/<textarea> outside src/components/ui. Use the canonical wrappers instead.',
    },
    messages: {
      noRawInput:
        'Use <{{ wrapper }}> from @/components/ui instead of a raw <{{ tag }}>. (W0 token foundation — synthesis §5 rule #1)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (ALLOWED_PATH.test(filename)) return {};
    return {
      JSXOpeningElement(node) {
        if (node.name?.type !== 'JSXIdentifier') return;
        const tag = node.name.name;
        if (!BANNED.has(tag)) return;
        const wrapper = tag === 'input' ? 'Input' : tag === 'select' ? 'Select' : 'Textarea';
        context.report({ node, messageId: 'noRawInput', data: { tag, wrapper } });
      },
    };
  },
};
