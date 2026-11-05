/** Ask's slash commands (ask 05): each is the same as typing its request. A pick fills the box; it never sends. */
export interface ChAskSlash {
  command: string;
  label: string;
  seed: string;
}

const PLAN: ChAskSlash = { command: '/plan', label: 'Build a practice', seed: 'Build a practice plan for ' };
const LINEUP: ChAskSlash = { command: '/lineup', label: 'Set a lineup', seed: 'Set the lineup for ' };
const RECAP: ChAskSlash = { command: '/recap', label: 'Recap a round', seed: 'Recap the latest round' };
const COMPARE: ChAskSlash = { command: '/compare', label: 'Compare players', seed: 'Compare ' };

/** A player gets /recap alone (CP-55). /plan and /lineup follow their own flags (CP-36, CP-38). */
export function askSlashCommands({ player, plans, lineup }: { player: boolean; plans: boolean; lineup: boolean }): ChAskSlash[] {
  if (player) return [RECAP];
  return [...(plans ? [PLAN] : []), ...(lineup ? [LINEUP] : []), RECAP, COMPARE];
}

/** What's typed after a `/` that is the whole text, or null when the text isn't a command being typed. */
export function slashQuery(text: string): string | null {
  const m = /^\/([a-z]*)$/i.exec(text);
  return m ? m[1]!.toLowerCase() : null;
}

export function matchSlash(commands: readonly ChAskSlash[], query: string): ChAskSlash[] {
  return commands.filter((c) => c.command.slice(1).startsWith(query));
}
