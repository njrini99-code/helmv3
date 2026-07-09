export const BASEBALL_PROGRAM_SETTINGS_PATH = '/baseball/dashboard/settings/program';

// The Settings hub root (the list of Program/Staff/Team Settings links) —
// used as the fallback redirect target for a spec route whose section was
// fully removed (no page, no anchor to land on), so the coach lands somewhere
// real and navigable instead of a removed/dead sub-page.
export const BASEBALL_SETTINGS_HUB_PATH = '/baseball/dashboard/settings';

export const BASEBALL_SETTINGS_ALIASES = {
  appearance: `${BASEBALL_PROGRAM_SETTINGS_PATH}#appearance`,
  ai: `${BASEBALL_PROGRAM_SETTINGS_PATH}#ai`,
  'guardian-access': `${BASEBALL_PROGRAM_SETTINGS_PATH}#guardian-access`,
  notifications: `${BASEBALL_PROGRAM_SETTINGS_PATH}#notifications`,
  'player-access': `${BASEBALL_PROGRAM_SETTINGS_PATH}#player-access`,
  'data-retention': `${BASEBALL_PROGRAM_SETTINGS_PATH}#data-retention`,
  // NOTE: no 'demo-mode' alias — the Demo Mode section was removed from Program
  // Settings (PKT-12), so there is no #demo-mode anchor to deep-link to.
  'showcase-profile': `${BASEBALL_PROGRAM_SETTINGS_PATH}#showcase-profile`,
} as const;

export type BaseballSettingsAlias = keyof typeof BASEBALL_SETTINGS_ALIASES;

export function getBaseballSettingsAliasHref(alias: BaseballSettingsAlias): string {
  return BASEBALL_SETTINGS_ALIASES[alias];
}
