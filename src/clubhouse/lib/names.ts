/**
 * One way to shorten a person's name (CONS-17). A first name is the first word ("Mary Ann Lee" is "Mary"; compound
 * first names wait on the owner); a short name is the first word and the last word's initial ("Theo M."), and a single
 * name stays as it is. Initials are lib/format's.
 */
export { initials } from './format';

export function firstName(full: string): string {
  const t = full.trim();
  return t.split(/\s+/)[0] || t;
}

export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length < 2 ? full.trim() : `${parts[0]} ${parts[parts.length - 1]!.charAt(0)}.`;
}
