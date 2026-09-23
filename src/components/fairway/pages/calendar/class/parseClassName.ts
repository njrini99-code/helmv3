/**
 * Split a `golf_player_classes.class_name` into a code and a name, e.g.
 * "BIOL 201 - Intro to Biology" → { code: "BIOL 201", name: "Intro to Biology" }.
 *
 * Byte-for-byte the same rule as `parseClassName` in
 * `src/app/golf/(dashboard)/dashboard/classes/page.tsx` (SCREEN-BUILD-PLAN.md
 * §2.4 calls for that helper to move to a shared location). It is duplicated
 * here, not imported, because the Classes page is outside this worker's
 * exclusive paths — see the handoff note asking the coordinator to extract
 * one shared helper and drop this copy.
 */
export function parseClassName(className: string): { code: string; name: string } {
  if (className.includes(' - ')) {
    const parts = className.split(' - ');
    return {
      code: parts[0] || '',
      name: parts.slice(1).join(' - ') || className,
    };
  }
  return { code: '', name: className };
}
