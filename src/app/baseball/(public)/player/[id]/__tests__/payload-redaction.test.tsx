// =============================================================================
// Withheld fields must not reach the RSC payload.
//
// THE BUG THIS PINS. /baseball/player/[id] is a PUBLIC, unauthenticated page.
// Its server component queries `select('*')` on baseball_players plus a join
// that returns every video's `url`, then hands the whole object to
// PlayerProfileClient — a 'use client' component. Everything passed across
// that boundary is serialized into the RSC flight payload and shipped inside
// the page's HTML.
//
// The client gated each field in JSX, which keeps it out of the DOM. It does
// not keep it out of `curl`. A player who set show_stats: false still had
// their GPA, SAT and ACT published in view-source; show_videos: false still
// published every video URL. The settings were honoured by the renderer and
// ignored by the transport, which is the harder half to notice and the one
// that actually matters.
//
// These tests assert the SERVER's output — the props object — not the DOM.
// A DOM assertion cannot tell the difference between "absent" and "present
// but not rendered", which is precisely the confusion that let this ship.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  resolvePublicProfileAccess: vi.fn(),
  getUser: vi.fn(),
  capturedProps: null as Record<string, unknown> | null,
  playerRow: {} as Record<string, unknown>,
  playerSettings: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/baseball/public-profile-access', () => ({
  resolvePublicProfileAccess: mocks.resolvePublicProfileAccess,
}));

// The page imports this as a NAMED export, so the mock must provide both —
// capturing the props is the whole point of the file and a wrong shape here
// fails every test with an unrelated message.
vi.mock('../PlayerProfileClient', () => {
  const capture = (props: Record<string, unknown>) => {
    mocks.capturedProps = props;
    return null;
  };
  return { default: capture, PlayerProfileClient: capture };
});

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

/**
 * A Supabase stand-in answering each table the page reads. Chainable and
 * thenable, because the page mixes `.single()`, `.maybeSingle()` and bare
 * awaited list reads.
 */
function makeClient() {
  const build = (resolve: () => unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'insert']) {
      b[m] = vi.fn(() => b);
    }
    b.single = vi.fn(async () => resolve());
    b.maybeSingle = vi.fn(async () => resolve());
    b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(ok, err);
    return b;
  };

  return {
    auth: { getUser: mocks.getUser },
    from: vi.fn((table: string) => {
      if (table === 'baseball_players') {
        return build(() => ({ data: mocks.playerRow, error: null }));
      }
      if (table === 'baseball_player_settings') {
        return build(() => ({ data: mocks.playerSettings, error: null }));
      }
      return build(() => ({ data: [], error: null, count: 0 }));
    }),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeClient()),
}));

import PlayerProfilePage from '../page';

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';

/** Every field a private profile must withhold, with a recognisable value. */
const SENSITIVE = {
  gpa: 3.91,
  sat_score: 1480,
  act_score: 33,
  height_inches: 74,
  weight_lbs: 205,
  exit_velo: 98,
  pitch_velo: 91,
  sixty_time: 6.6,
  email: 'private.player@example.edu',
  phone: '555-0142',
  twitter_handle: '@privatehandle',
  instagram_handle: 'privategram',
};

function seedPlayer(settings: Record<string, unknown> | null) {
  mocks.playerRow = {
    id: PLAYER_ID,
    first_name: 'Marcus',
    last_name: 'Ellery',
    primary_position: 'SS',
    grad_year: 2027,
    ...SENSITIVE,
    baseball_videos: [
      { id: 'v1', title: 'Spring showcase', url: 'https://cdn.example.com/secret-reel.mp4' },
    ],
    baseball_team_members: [],
    player_achievements: [],
  };
  mocks.playerSettings = settings;
}

/** The exact bytes that would be serialized into the page's HTML. */
function serializedPayload(): string {
  return JSON.stringify(mocks.capturedProps ?? {});
}

async function renderPage() {
  mocks.capturedProps = null;
  // The page is an async server component: awaiting it yields a React
  // ELEMENT, it does not invoke the child. The props only exist once the tree
  // is rendered, which is also the moment they would really be serialized.
  const element = await PlayerProfilePage({
    params: Promise.resolve({ id: PLAYER_ID }),
  } as never);
  render(element as React.ReactElement);
  if (!mocks.capturedProps) {
    throw new Error('PlayerProfileClient never rendered — the page bailed out early');
  }
  return mocks.capturedProps as Record<string, unknown>;
}

describe('public player profile — the payload, not the DOM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.resolvePublicProfileAccess.mockResolvedValue({
      allowed: true,
      reason: 'public',
      displayName: 'Marcus Ellery',
    });
  });

  it('withholds academics and measurables from the payload when show_stats is false', async () => {
    seedPlayer({ show_stats: false });
    await renderPage();
    const payload = serializedPayload();

    for (const value of ['3.91', '1480', '33', '98', '91', '6.6', '205']) {
      expect(payload, `sensitive value ${value} reached the payload`).not.toContain(value);
    }
  });

  it('withholds every video URL from the payload when show_videos is false', async () => {
    seedPlayer({ show_videos: false });
    await renderPage();

    // The URL is the disclosure — a private clip is one fetch away from anyone
    // who reads view-source, no matter what the page renders.
    expect(serializedPayload()).not.toContain('secret-reel.mp4');
  });

  it('sends an EMPTY video list, not a stripped one — the count is itself a disclosure', async () => {
    seedPlayer({ show_videos: false });
    const props = await renderPage();

    const player = props.player as { videos: unknown[] };
    expect(player.videos).toEqual([]);
  });

  it('withholds contact details unless the player opted IN', async () => {
    // Contact is opt-in (=== true), not opt-out — an absent setting means
    // withheld, which is the direction that fails safe.
    seedPlayer({});
    await renderPage();
    const payload = serializedPayload();

    expect(payload).not.toContain('private.player@example.edu');
    expect(payload).not.toContain('555-0142');
  });

  it('publishes contact details when the player DID opt in', async () => {
    // The mirror case. A redaction that withholds everything is not a fix,
    // it is a broken feature — this proves the gate reads the setting rather
    // than always denying.
    seedPlayer({ show_contact_email: true, show_phone: true });
    await renderPage();
    const payload = serializedPayload();

    expect(payload).toContain('private.player@example.edu');
    expect(payload).toContain('555-0142');
  });

  it('withholds social handles when show_social_links is false', async () => {
    seedPlayer({ show_social_links: false });
    await renderPage();
    const payload = serializedPayload();

    expect(payload).not.toContain('@privatehandle');
    expect(payload).not.toContain('privategram');
  });

  it('publishes everything to the player viewing their own profile', async () => {
    // resolvePublicProfileAccess already grants this bypass; the redaction
    // must honour the same one, or a player cannot see their own data.
    mocks.resolvePublicProfileAccess.mockResolvedValue({
      allowed: true,
      reason: 'self',
      displayName: 'Marcus Ellery',
    });
    seedPlayer({ show_stats: false, show_videos: false, show_social_links: false });
    await renderPage();
    const payload = serializedPayload();

    expect(payload).toContain('3.91');
    expect(payload).toContain('secret-reel.mp4');
  });

  it('defaults to VISIBLE when a profile has no settings row at all', async () => {
    // Matches the client's own reading (`!== false`) and the repo's
    // player-visibility semantics. Asserted so the redaction cannot silently
    // become fail-closed and blank every profile that never opened settings.
    seedPlayer(null);
    await renderPage();

    expect(serializedPayload()).toContain('3.91');
  });
});
