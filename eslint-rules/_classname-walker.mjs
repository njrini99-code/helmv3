/**
 * Shared className walker for W0 lint rules.
 *
 * JSX className attributes can be: literal strings, template literals,
 * `cn(...)` / `clsx(...)` call expressions, ternaries, `&&`/`||` chains,
 * arrays of strings, object keys (where keys are class names). This
 * walker yields every string literal nested inside such expressions
 * so a rule can apply a single regex to the whole tree.
 */

export function checkClassNameAttribute(node, regex, context, messageId) {
  if (node.name?.name !== 'className') return;
  const v = node.value;
  if (!v) return;
  if (v.type === 'Literal') {
    report(node, v.value, regex, context, messageId);
  } else if (v.type === 'JSXExpressionContainer') {
    walk(v.expression, node, regex, context, messageId);
  }
}

function walk(expr, attrNode, regex, context, messageId) {
  if (!expr) return;
  switch (expr.type) {
    case 'Literal':
      report(attrNode, expr.value, regex, context, messageId);
      break;
    case 'TemplateLiteral':
      for (const q of expr.quasis) report(attrNode, q.value.raw, regex, context, messageId);
      for (const e of expr.expressions) walk(e, attrNode, regex, context, messageId);
      break;
    case 'CallExpression':
      for (const a of expr.arguments) walk(a, attrNode, regex, context, messageId);
      break;
    case 'ConditionalExpression':
      walk(expr.consequent, attrNode, regex, context, messageId);
      walk(expr.alternate, attrNode, regex, context, messageId);
      break;
    case 'LogicalExpression':
    case 'BinaryExpression':
      walk(expr.left, attrNode, regex, context, messageId);
      walk(expr.right, attrNode, regex, context, messageId);
      break;
    case 'ArrayExpression':
      for (const e of expr.elements) walk(e, attrNode, regex, context, messageId);
      break;
    case 'ObjectExpression':
      for (const p of expr.properties) {
        if (p.type !== 'Property') continue;
        if (p.key?.type === 'Literal') {
          report(attrNode, p.key.value, regex, context, messageId);
        }
      }
      break;
    default:
      break;
  }
}

function report(node, value, regex, context, messageId) {
  if (typeof value !== 'string') return;
  const m = value.match(regex);
  if (!m) return;
  context.report({ node, messageId, data: { match: m[0] } });
}

/**
 * Walk a `style={{ ... }}` JSX attribute and yield string-literal
 * property values. Used by no-banned-color to catch
 * `style={{ color: '#16A34A' }}`.
 */
export function checkInlineStyle(node, regex, context, messageId) {
  if (node.name?.name !== 'style') return;
  const v = node.value;
  if (!v || v.type !== 'JSXExpressionContainer') return;
  const expr = v.expression;
  if (!expr || expr.type !== 'ObjectExpression') return;
  for (const prop of expr.properties) {
    if (prop.type !== 'Property') continue;
    const val = prop.value;
    if (val?.type === 'Literal' && typeof val.value === 'string') {
      const m = val.value.match(regex);
      if (m) context.report({ node: prop, messageId, data: { match: m[0] } });
    }
  }
}
