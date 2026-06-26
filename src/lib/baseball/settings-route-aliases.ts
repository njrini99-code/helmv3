export const BASEBALL_PROGRAM_SETTINGS_PATH = '/baseball/dashboard/settings/program';

export const BASEBALL_SETTINGS_ALIASES = {
  appearance: `${BASEBALL_PROGRAM_SETTINGS_PATH}#appearance`,
  ai: `${BASEBALL_PROGRAM_SETTINGS_PATH}#ai`,
  'guardian-access': `${BASEBALL_PROGRAM_SETTINGS_PATH}#guardian-access`,
  notifications: `${BASEBALL_PROGRAM_SETTINGS_PATH}#notifications`,
  'player-access': `${BASEBALL_PROGRAM_SETTINGS_PATH}#player-access`,
  'data-retention': `${BASEBALL_PROGRAM_SETTINGS_PATH}#data-retention`,
  'demo-mode': `${BASEBALL_PROGRAM_SETTINGS_PATH}#demo-mode`,
  'showcase-profile': `${BASEBALL_PROGRAM_SETTINGS_PATH}#showcase-profile`,
} as const;

export type BaseballSettingsAlias = keyof typeof BASEBALL_SETTINGS_ALIASES;

export function getBaseballSettingsAliasHref(alias: BaseballSettingsAlias): string {
  return BASEBALL_SETTINGS_ALIASES[alias];
}
