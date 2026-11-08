import { GAME_SECTION_IDS, type GameSectionId } from './legs';

/**
 * The phone's pushed Stats details (stats-home 02-PLAN "Routing"). Pure: which hash names which detail, what an arriving address
 * opens, and the summary's own address. The five game areas keep `#gm-<id>`, so every saved link keeps working; the rest are `#sd-*`.
 */
export type StatsPlayerDetailId = GameSectionId | 'sg' | 'rounds' | 'goals';
export type StatsTeamDetailId = 'tscore' | 'tgame' | 'tplayers';
export type StatsDetailId = StatsPlayerDetailId | StatsTeamDetailId;
export type StatsScreen = 'player' | 'team';

const SD_HASH: Readonly<Record<Exclude<StatsDetailId, GameSectionId>, string>> = {
  sg: 'sd-sg',
  rounds: 'sd-rounds',
  goals: 'sd-goals',
  tscore: 'sd-team-score',
  tgame: 'sd-team-game',
  tplayers: 'sd-team-players',
};

const isGameSection = (id: StatsDetailId): id is GameSectionId => (GAME_SECTION_IDS as readonly string[]).includes(id);

/**
 * `?area=` is production's stats board address (`StatsSpineStage`: putting, driving, approach, short-game, scoring, standing, rounds),
 * so a saved production link opens the same area here. On the phone an area is a pushed detail; on desktop it opens the tab it lives under.
 * Player: `standing` is Strokes gained, and `goals` is this build's own (production's Development has no area). Team: the three details.
 */
const PLAYER_AREA: Readonly<Record<string, StatsPlayerDetailId>> = {
  scoring: 'scoring',
  driving: 'tee',
  approach: 'approach',
  'short-game': 'short',
  putting: 'putting',
  standing: 'sg',
  rounds: 'rounds',
  goals: 'goals',
};
const TEAM_AREA: Readonly<Record<string, StatsTeamDetailId>> = { scoring: 'tscore', game: 'tgame', players: 'tplayers' };

/** The detail a `?area=` value names on this screen, or null: `home`, an unknown value and a value of the other screen name nothing. */
export function areaDetail(area: string | null | undefined, screen: StatsScreen): StatsDetailId | null {
  if (!area) return null;
  const table: Readonly<Record<string, StatsDetailId>> = screen === 'player' ? PLAYER_AREA : TEAM_AREA;
  return Object.hasOwn(table, area) ? table[area]! : null;
}

export const PLAYER_DETAIL_IDS: readonly StatsPlayerDetailId[] = [...GAME_SECTION_IDS, 'sg', 'rounds', 'goals'];
export const TEAM_DETAIL_IDS: readonly StatsTeamDetailId[] = ['tscore', 'tgame', 'tplayers'];

/** The hash that names a detail, without its `#`. */
export function hashOf(id: StatsDetailId): string {
  return isGameSection(id) ? `gm-${id}` : SD_HASH[id];
}

/** The detail a hash names on this screen, or null: an unknown hash, and a hash that belongs to the other screen, name nothing. */
export function detailFromHash(hash: string, screen: StatsScreen): StatsDetailId | null {
  const ids: readonly StatsDetailId[] = screen === 'player' ? PLAYER_DETAIL_IDS : TEAM_DETAIL_IDS;
  const bare = hash.replace(/^#/, '');
  return ids.find((id) => hashOf(id) === bare) ?? null;
}

/** Is this hash one of this lane's detail hashes on either screen? A foreign one is dropped on arrival (criterion CP-134). */
export function isDetailHash(hash: string): boolean {
  return /^#(gm|sd)-/.test(hash);
}

/** What an arriving address opens: a detail hash wins, then `?area=`, then `?tab=`; `tab=overview` or nothing opens no detail. The team screen has no tabs. */
export function arrivalDetail(input: { tab?: string | null; hash?: string | null; area?: string | null }, screen: StatsScreen): StatsDetailId | null {
  const fromHash = input.hash ? detailFromHash(input.hash, screen) : null;
  if (fromHash) return fromHash;
  const fromArea = areaDetail(input.area, screen);
  if (fromArea) return fromArea;
  if (screen !== 'player') return null;
  if (input.tab === 'rounds') return 'rounds';
  if (input.tab === 'dev') return 'goals';
  if (input.tab === 'game') return 'sg';
  return null;
}

/** The desktop tab a detail belongs to: the summary section it lives under on the phone. */
export function tabOfDetail(id: StatsDetailId): 'overview' | 'game' | 'rounds' | 'dev' {
  if (id === 'rounds') return 'rounds';
  if (id === 'goals') return 'dev';
  if (id === 'scoring' || id === 'tscore') return 'overview';
  return 'game';
}

/** A phone's `#sd-*` link opened on desktop: Rounds and Development have tabs; any other `#sd-*` opens Overview; other hashes name no tab. */
export function desktopTabOfHash(hash: string): 'overview' | 'rounds' | 'dev' | null {
  if (hash === '#sd-rounds') return 'rounds';
  if (hash === '#sd-goals') return 'dev';
  return hash.startsWith('#sd-') ? 'overview' : null;
}

/** The summary's address: this address without `tab`, `area` and the hash; `player`, the window and the filter stay. */
export function summaryUrl(location: { pathname: string; search: string }): string {
  const params = new URLSearchParams(location.search);
  params.delete('tab');
  params.delete('area');
  const search = params.toString();
  return location.pathname + (search ? `?${search}` : '');
}
