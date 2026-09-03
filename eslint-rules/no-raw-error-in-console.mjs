/**
 * no-raw-error-in-console — a caught value logged raw loses its content on the
 * way into telemetry, and the incident that arrives is untriageable.
 *
 * WHY THIS RULE EXISTS (found in production, 2026-09-03)
 *
 * Sentry's console integration stringifies every argument it captures. A
 * `Error` survives that, because `String(err)` keeps its message. A Supabase
 * `PostgrestError` does NOT — it is a plain object, so it collapses to the
 * literal text `[object Object]` and its `code`, `message`, `details` and
 * `hint` are gone before the incident is even created:
 *
 *     console.error('Error fetching tasks:', err);
 *     //                                     ^ PostgrestError
 *     // Sentry issue title: "Error fetching tasks: [object Object]"
 *
 * That exact title reached the Bridge Overview posture line and was flagged
 * MESSAGE LOST by Helm's own incident presenter — correctly, since there is
 * nothing left in it to act on. The user-facing path at that call site was
 * already correct; only telemetry lost the content, which is why no test and
 * no type caught it.
 *
 * THE FIX IS ALWAYS THE SAME. `describeError` (src/lib/utils/describe-error.ts)
 * exists for this shape — its own header names "the plain objects that were
 * producing `[object Object]` in telemetry" — and collapses them to
 * `code=… msg=… details=…` so grep-by-code still works in the admin
 * dashboards.
 *
 * SCOPE, AND WHY IT IS NARROW. This fires only on a bare IDENTIFIER whose name
 * reads as an error (`err`, `error`, `e`, `ex`, `caught`, `*Error`) passed as a
 * non-first argument to `console.error`/`console.warn`. It deliberately does
 * not fire on:
 *
 *   - a call already wrapped in `describeError(...)` or any other call
 *     expression — the author has chosen a representation
 *   - member expressions like `err.message`, which are already strings
 *   - identifiers that do not name an error (`message`, `reason`,
 *     `errorText`), where the value is usually already a string and wrapping
 *     it would be noise
 *
 * The wide version of this rule — "never pass a non-string to console" — was
 * not written, for the same reason `no-healthy-value-on-error` was scoped to
 * error branches: a rule whose baseline is four figures is noise, and noise
 * gets disabled.
 */

const ERROR_NAME = /^(e|ex|err|error|caught|[A-Za-z0-9_]*[eE]rror)$/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A caught value passed raw to console.error/warn reaches telemetry as [object Object]; wrap it in describeError.',
    },
    schema: [],
    messages: {
      rawError:
        "'{{name}}' is logged raw — a non-Error object stringifies to '[object Object]' in Sentry and the incident loses its code, message and details. Wrap it: describeError({{name}}).",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'console' ||
          callee.property.type !== 'Identifier' ||
          (callee.property.name !== 'error' && callee.property.name !== 'warn')
        ) {
          return;
        }

        // Argument 0 is the human label; the payload arguments follow it.
        for (const arg of node.arguments.slice(1)) {
          if (arg.type !== 'Identifier') continue;
          if (!ERROR_NAME.test(arg.name)) continue;
          context.report({ node: arg, messageId: 'rawError', data: { name: arg.name } });
        }
      },
    };
  },
};
