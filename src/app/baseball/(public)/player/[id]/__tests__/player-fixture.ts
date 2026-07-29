/**
 * Shared fixture for the public player-profile tests.
 *
 * Not a `*.test.ts` file, so vitest's `unit` project include glob
 * (`src/**\/*.test.{ts,tsx}`) will not try to collect it as a suite.
 *
 * The player shape is taken from `PlayerProfileClient`'s own prop type rather
 * than re-declared, so a field added or renamed on `PlayerData` breaks these
 * tests at compile time instead of silently leaving them asserting against a
 * stale shape.
 */
import type { PlayerProfileClient } from '../PlayerProfileClient';

type PlayerProfileProps = Parameters<typeof PlayerProfileClient>[0];
export type FixturePlayer = PlayerProfileProps['player'];
export type FixtureSettings = FixturePlayer['player_settings'];

/**
 * A fully-populated public profile: every measurable recorded, one video, one
 * roster stint, one award, one school of interest. Individual tests strip
 * exactly the field under test, so an assertion that something is HIDDEN can
 * only pass because of the visibility flag — never because the data was
 * missing to begin with.
 */
export function makePlayer(overrides: Partial<FixturePlayer> = {}): FixturePlayer {
  return {
    id: 'player-1',
    first_name: 'Marcus',
    last_name: 'Delgado',
    avatar_url: null,
    banner_url: null,
    about_me: 'Left-handed starter out of the Central Valley.',
    city: 'Fresno',
    state: 'CA',
    high_school_name: 'Clovis North HS',
    email: 'marcus@example.com',
    phone: '559-555-0142',
    twitter: 'marcusdelgado',
    instagram: 'marcusdelgado',
    height_feet: 6,
    height_inches: 2,
    weight_lbs: 195,
    primary_position: 'LHP',
    secondary_position: '1B',
    grad_year: 2027,
    bats: 'L',
    throws: 'L',
    gpa: 3.72,
    sat_score: 1280,
    act_score: 28,
    pitch_velo: 88,
    exit_velo: 94,
    sixty_time: 7.1,
    recruiting_activated: true,
    committed_to: null,
    updated_at: '2026-07-01T00:00:00.000Z',
    player_settings: null,
    videos: [
      {
        id: 'video-1',
        title: 'Bullpen — June 2026',
        thumbnail_url: null,
        url: 'https://cdn.example.com/bullpen.mp4',
        duration: 143,
        is_primary: true,
        video_type: 'bullpen',
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ],
    recruiting_interests: [
      {
        id: 'interest-1',
        interest_level: 'high',
        organization: { id: 'org-9', name: 'Fresno State', division: 'D1', logo_url: null },
      },
    ],
    player_achievements: [
      {
        id: 'award-1',
        achievement_text: 'All-League First Team',
        achievement_type: 'honor',
        achievement_date: '2026-05-20',
      },
    ],
    team_members: [
      {
        id: 'membership-1',
        joined_at: '2025-08-01T00:00:00.000Z',
        left_at: null,
        position: 'LHP',
        jersey_number: 21,
        status: 'active',
        team: {
          id: 'team-1',
          name: 'Clovis North Broncos',
          team_type: 'high_school',
          organization: {
            id: 'org-1',
            name: 'Clovis North HS',
            type: 'high_school',
            logo_url: null,
            location_city: 'Fresno',
            location_state: 'CA',
          },
        },
      },
    ],
    high_school_org: null,
    committed_to_org: null,
    ...overrides,
  };
}

/** Every measurable blanked — the "brand new profile" case. */
export const NO_MEASURABLES: Partial<FixturePlayer> = {
  height_feet: null,
  height_inches: null,
  weight_lbs: null,
  bats: null,
  throws: null,
  pitch_velo: null,
  exit_velo: null,
  sixty_time: null,
  gpa: null,
  sat_score: null,
  act_score: null,
};

/** Default props for the client, with the player swapped per test. */
export function makeProps(overrides: Partial<PlayerProfileProps> = {}): PlayerProfileProps {
  return {
    player: makePlayer(),
    isCoachViewing: false,
    isSelfViewing: false,
    initialIsInWatchlist: false,
    profileViewCount: 12,
    watchlistCount: 3,
    ...overrides,
  };
}
