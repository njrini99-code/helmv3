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

const ALLOWED_PATH = /(\/(components\/ui|mockups|eslint-rules)\/|tailwind\.config\.ts$|\.stories\.[jt]sx?$|\.test\.[jt]sx?$)/;
const BANNED = new Set(['input', 'select', 'textarea']);

/**
 * Input types the canonical <Input> wrapper cannot be: the wrapper's whole
 * rationale (16px iOS zoom prevention, text focus ring, error-state shape)
 * only applies to text-like inputs. Checkboxes/radios/ranges/files/colors
 * have no ui wrapper — flagging them tells developers to do something
 * impossible. If a Checkbox/RadioGroup/Slider/FilePicker wrapper lands in
 * components/ui later, remove its type from this set to start enforcing it.
 */
const UNWRAPPABLE_INPUT_TYPES = new Set(['checkbox', 'radio', 'range', 'file', 'color', 'hidden']);

function literalTypeAttr(node) {
  for (const attr of node.attributes ?? []) {
    if (attr.type !== 'JSXAttribute' || attr.name?.name !== 'type') continue;
    if (attr.value?.type === 'Literal' && typeof attr.value.value === 'string') {
      return attr.value.value;
    }
    return null; // dynamic type — can't prove it's unwrappable, keep flagging
  }
  return null;
}

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
        if (tag === 'input') {
          const type = literalTypeAttr(node);
          if (type && UNWRAPPABLE_INPUT_TYPES.has(type)) return;
        }
        const wrapper = tag === 'input' ? 'Input' : tag === 'select' ? 'Select (or NativeSelect)' : 'Textarea';
        context.report({ node, messageId: 'noRawInput', data: { tag, wrapper } });
      },
    };
  },
};
