/**
 * Public player profile — visibility (baseball_player_settings) + empty states.
 *
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * `/baseball/player/[id]` is an unauthenticated route. Whatever it renders is
 * published to the open internet, so every `show_*` flag on
 * `baseball_player_settings` is a promise to the athlete, not a preference.
 *
 * The regressions these tests lock down were real: `show_videos` and
 * `show_stats` were enforced on the Videos and Stats TABS but not on the
 * Overview tab — the tab the page opens on — which rendered the same
 * measurables (including GPA/SAT/ACT) and the same playable video cards
 * regardless. The tab strip and passport header also published a video COUNT
 * for a player who had video set to private.
 *
 * Each hiding assertion runs against the fully-populated fixture with exactly
 * one flag flipped, so a pass can only mean "the flag hid it" and never "the
 * fixture had no data".
 *
 * framer-motion is mocked (the `m` Proxy pattern from Reveal.test.tsx) so the
 * entrance variants don't leave assertions racing an animation; the real
 * LazyMotion behavior is covered separately in
 * PlayerProfileClient.motion-scope.test.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

vi.mock('framer-motion', () => {
  const passthrough = new Proxy(
    {},
    {
      get: (_target, prop) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ children, initial: _i, animate: _a, variants: _v, transition: _t, whileHover: _wh, style, ...rest }: any) =>
          React.createElement(prop as string, { ...rest, style }, children),
    },
  );
  return {
    m: passthrough,
    motion: passthrough,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LazyMotion: ({ children }: any) => children,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useReducedMotion: () => true,
    useScroll: () => ({ scrollY: { get: () => 0, on: () => () => {} } }),
    useTransform: () => 0,
  };
});

vi.mock('@/app/baseball/actions/watchlist', () => ({
  toggleWatchlistPlayer: vi.fn().mockResolvedValue({ success: true, action: 'added' }),
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PlayerProfileClient } from '../PlayerProfileClient';
import { makePlayer, makeProps, NO_MEASURABLES, type FixtureSettings } from './player-fixture';

function settings(overrides: Record<string, boolean>): FixtureSettings {
  return overrides as FixtureSettings;
}

/** Switch tabs the way a visitor does. */
async function openTab(name: RegExp) {
  await userEvent.click(screen.getByRole('tab', { name }));
}

describe('public player profile — show_videos', () => {
  it('publishes video on the Overview tab by default (no settings row)', () => {
    render(<PlayerProfileClient {...makeProps()} />);
    expect(screen.getByRole('button', { name: 'Play Bullpen — June 2026' })).toBeInTheDocument();
  });

  it('does NOT render video cards on the Overview tab when show_videos is false', () => {
    render(
      <PlayerProfileClient
        {...makeProps({ player: makePlayer({ player_settings: settings({ show_videos: false }) }) })}
      />,
    );
    // The regression: Overview's "Featured Videos" preview ignored show_videos,
    // so a private video's title, thumbnail and playable URL were published on
    // the tab the page opens on.
    expect(screen.queryByRole('button', { name: 'Play Bullpen — June 2026' })).not.toBeInTheDocument();
    expect(screen.queryByText('Featured Videos')).not.toBeInTheDocument();
  });

  it('does NOT publish a video COUNT anywhere when show_videos is false', () => {
    render(
      <PlayerProfileClient
        {...makeProps({ player: makePlayer({ player_settings: settings({ show_videos: false }) }) })}
      />,
    );
    // Passport header quick-stat: RuledStatLine labels its StatReadout with the
    // measurable name, so an aria-label of "Videos" means a figure was printed.
    expect(screen.queryByLabelText('Videos')).not.toBeInTheDocument();
    // Tab strip badge: "Videos 1" next to a tab that then says "private" would
    // disclose exactly what the player withheld.
    const videosTab = screen.getByRole('tab', { name: /Videos/ });
    expect(within(videosTab).queryByText('1')).not.toBeInTheDocument();
  });

  it('publishes the video count when show_videos is on', () => {
    render(<PlayerProfileClient {...makeProps()} />);
    expect(screen.getByLabelText('Videos')).toBeInTheDocument();
    const videosTab = screen.getByRole('tab', { name: /Videos/ });
    expect(within(videosTab).getByText('1')).toBeInTheDocument();
  });

  it('says video is private — and does not leak titles — on the Videos tab', async () => {
    render(
      <PlayerProfileClient
        {...makeProps({ player: makePlayer({ player_settings: settings({ show_videos: false }) }) })}
      />,
    );
    await openTab(/Videos/);
    expect(screen.getByText('Video is set to private')).toBeInTheDocument();
    expect(screen.queryByText('Bullpen — June 2026')).not.toBeInTheDocument();
  });
});

describe('public player profile — show_stats', () => {
  it('publishes measurables on the Overview tab by default', () => {
    render(<PlayerProfileClient {...makeProps()} />);
    expect(screen.getByText('Physical & Metrics')).toBeInTheDocument();
    // aria-labels come from RuledStatLine -> StatReadout(ariaLabel=label).
    expect(screen.getByLabelText('GPA')).toBeInTheDocument();
    expect(screen.getByLabelText('SAT')).toBeInTheDocument();
    expect(screen.getByLabelText('Exit Velo')).toBeInTheDocument();
  });

  it('does NOT render measurables on the Overview tab when show_stats is false', () => {
    render(
      <PlayerProfileClient
        {...makeProps({ player: makePlayer({ player_settings: settings({ show_stats: false }) }) })}
      />,
    );
    // The regression: academics were the most sensitive field on the page and
    // were published on Overview even with stats set to private.
    expect(screen.queryByText('Physical & Metrics')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('GPA')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('SAT')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ACT')).not.toBeInTheDocument();
  });

  it('says measurables are private — and prints no figures — on the Stats tab', async () => {
    render(
      <PlayerProfileClient
        {...makeProps({ player: makePlayer({ player_settings: settings({ show_stats: false }) }) })}
      />,
    );
    await openTab(/Stats & Metrics|Stats/);
    expect(screen.getByText('Measurables are set to private')).toBeInTheDocument();
    expect(screen.queryByLabelText('GPA')).not.toBeInTheDocument();
  });
});

describe('public player profile — contact visibility (regression guard)', () => {
  it('withholds email and phone unless explicitly opted in', () => {
    // show_contact_email / show_phone are opt-IN (`=== true`), unlike the other
    // flags. The default fixture has no settings row, so both stay hidden.
    render(<PlayerProfileClient {...makeProps()} />);
    expect(screen.queryByText('marcus@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('559-555-0142')).not.toBeInTheDocument();
  });

  it('publishes email only when show_contact_email is explicitly true', () => {
    render(
      <PlayerProfileClient
        {...makeProps({
          player: makePlayer({ player_settings: settings({ show_contact_email: true }) }),
        })}
      />,
    );
    expect(screen.getByText('marcus@example.com')).toBeInTheDocument();
    expect(screen.queryByText('559-555-0142')).not.toBeInTheDocument();
  });

  it('hides schools of interest when show_dream_schools is false', () => {
    render(
      <PlayerProfileClient
        {...makeProps({
          player: makePlayer({ player_settings: settings({ show_dream_schools: false }) }),
        })}
      />,
    );
    expect(screen.queryByText('Schools of Interest')).not.toBeInTheDocument();
    expect(screen.queryByText('Fresno State')).not.toBeInTheDocument();
  });
});

describe('public player profile — empty states name the athlete', () => {
  it('Videos: says what is missing and who it belongs to', async () => {
    render(<PlayerProfileClient {...makeProps({ player: makePlayer({ videos: [] }) })} />);
    await openTab(/Videos/);
    expect(screen.getByText('No video on file yet')).toBeInTheDocument();
    expect(screen.getByText(/^Marcus hasn't posted any game film/)).toBeInTheDocument();
  });

  it('Team History: distinguishes "not on a roster yet" from "no data"', async () => {
    render(<PlayerProfileClient {...makeProps({ player: makePlayer({ team_members: [] }) })} />);
    await openTab(/Team History/);
    expect(screen.getByText('No team history on file')).toBeInTheDocument();
    expect(screen.getByText(/Marcus hasn't been added to a roster in Helm yet/)).toBeInTheDocument();
  });

  it('Awards: says an empty list is not a claim about the athlete', async () => {
    render(<PlayerProfileClient {...makeProps({ player: makePlayer({ player_achievements: [] }) })} />);
    await openTab(/Awards/);
    expect(screen.getByText('No awards listed yet')).toBeInTheDocument();
    expect(screen.getByText(/it means none have been entered/)).toBeInTheDocument();
  });

  it('Stats: an all-blank profile explains itself instead of showing a wall of em-dashes', async () => {
    render(
      <PlayerProfileClient {...makeProps({ player: makePlayer(NO_MEASURABLES) })} />,
    );
    await openTab(/Stats & Metrics|Stats/);
    expect(screen.getByText('No measurables recorded yet')).toBeInTheDocument();
    // The ghosted rows still render — they are the kit's "waiting to fill in"
    // treatment, and the letter above them is the explanation, not a replacement.
    expect(screen.getByText('Physical Profile')).toBeInTheDocument();
  });

  it('Stats: says nothing about emptiness once a single measurable exists', async () => {
    render(
      <PlayerProfileClient
        {...makeProps({ player: makePlayer({ ...NO_MEASURABLES, exit_velo: 94 }) })}
      />,
    );
    await openTab(/Stats & Metrics|Stats/);
    expect(screen.queryByText('No measurables recorded yet')).not.toBeInTheDocument();
  });

  it('Overview: a brand-new profile says so rather than showing empty headers', () => {
    render(
      <PlayerProfileClient
        {...makeProps({
          player: makePlayer({ ...NO_MEASURABLES, about_me: null, videos: [] }),
        })}
      />,
    );
    expect(screen.getByText('This profile is still being filled in')).toBeInTheDocument();
    // Nothing is being withheld here, and the copy must not imply otherwise.
    expect(screen.getByText(/nothing is hidden/)).toBeInTheDocument();
  });

  it('Overview: an all-private profile says "private", not "still being filled in"', () => {
    // The fixture HAS a video (video-1). The earlier version of this test
    // asserted the copy "hasn't published any video" against it and passed —
    // it was locking in a false sentence, which is the failure mode the whole
    // suite exists to prevent.
    render(
      <PlayerProfileClient
        {...makeProps({
          player: makePlayer({
            about_me: null,
            player_settings: settings({ show_stats: false, show_videos: false }),
          }),
        })}
      />,
    );
    expect(screen.getByText('Parts of this profile are private')).toBeInTheDocument();
    expect(
      screen.getByText(/set both their measurables and their video to private/),
    ).toBeInTheDocument();
    // And must NOT claim the absence is merely incomplete data.
    expect(screen.queryByText(/nothing is hidden/)).toBeNull();
    expect(screen.queryByText('This profile is still being filled in')).toBeNull();
  });

  it('Overview: private VIDEO alone must not claim "nothing is hidden"', () => {
    // The specific regression: the copy used to branch on show_stats only, so
    // a player who made their video private got a public page asserting their
    // privacy choices did not exist.
    render(
      <PlayerProfileClient
        {...makeProps({
          player: makePlayer({
            about_me: null,
            // Every measurable cleared, so the Overview column is genuinely
            // empty and the explanation below is the only thing on it.
            height_feet: null,
            height_inches: null,
            weight_lbs: null,
            bats: null,
            throws: null,
            exit_velo: null,
            pitch_velo: null,
            sixty_time: null,
            gpa: null,
            sat_score: null,
            act_score: null,
            player_settings: settings({ show_stats: true, show_videos: false }),
          }),
        })}
      />,
    );
    expect(screen.getByText('Parts of this profile are private')).toBeInTheDocument();
    expect(screen.getByText(/set their video to private/)).toBeInTheDocument();
    expect(screen.queryByText(/nothing is hidden/)).toBeNull();
  });

  it('falls back to a neutral subject when the record has no name', async () => {
    render(
      <PlayerProfileClient
        {...makeProps({
          player: makePlayer({ first_name: null, last_name: null, videos: [] }),
        })}
      />,
    );
    await openTab(/Videos/);
    expect(screen.getByText(/^This player hasn't posted any game film/)).toBeInTheDocument();
  });
});
