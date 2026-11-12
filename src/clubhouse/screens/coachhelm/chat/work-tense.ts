/**
 * The tense of a step's words. A plain module: the island's model (server-safe) and the client parts both turn the
 * server's one label into the state's own tense, and a server module may not import a value from a client one.
 */

/** A finished read is said in the past tense ("Read Jonah's strokes gained"): the kit's rows. The server sends one label for both states today. */
export function pastOf(label: string): string {
  const past: Record<string, string> = { reading: 'Read', checking: 'Checked', finding: 'Found', comparing: 'Compared', drawing: 'Drew', drafting: 'Drafted', building: 'Built', 'looking up': 'Looked up' };
  const m = /^(Reading|Checking|Finding|Comparing|Drawing|Drafting|Building|Looking up)\s+(.*)$/i.exec(label);
  return m ? `${past[m[1]!.toLowerCase()]} ${m[2]}` : label;
}

/** "Reading practice reviews" that failed reads "Couldn't read practice reviews": the server's own words, turned. */
export function couldNot(label: string): string {
  const m = /^(Reading|Checking|Finding|Comparing|Drawing|Drafting|Building|Looking up)\s+(.*)$/i.exec(label);
  if (!m) return `${label}: didn’t come back`;
  const verb: Record<string, string> = { reading: 'read', checking: 'check', finding: 'find', comparing: 'compare', drawing: 'draw', drafting: 'draft', building: 'build', 'looking up': 'look up' };
  return `Couldn’t ${verb[m[1]!.toLowerCase()]} ${m[2]}`;
}
