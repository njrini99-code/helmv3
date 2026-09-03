/**
 * Escape a string for literal use inside `new RegExp(...)`.
 *
 * Feature ids, registry keys and identifiers come from committed YAML and
 * generated artifacts, not from users, but CodeQL's js/regex-injection rule is
 * right that a bare interpolation is one refactor away from being reachable
 * from a CLI argument. Escaping costs nothing and keeps the intent literal.
 */
export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
