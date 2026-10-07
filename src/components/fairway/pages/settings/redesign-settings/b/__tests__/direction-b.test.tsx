/**
 * TEMP redesign direction B (removed before ship).
 *
 * Pins the two contracts the workbench leans on:
 *  1. SectionDirtyScope forwards every dirty report to the screen's leave
 *     guard unchanged while recording which section the dirty panel is in,
 *     and a dirty -> clean flip is reported as "settled" (the status refresh
 *     trigger). The provider value must stay stable, or `useReportDirty`
 *     would clear and re-register on every flip.
 *  2. The rail's words: null never prints as zero, a missing settings row
 *     reads "Default settings", and the section order / fallback per role.
 */
import { createContext, useContext, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

// Only the registry context is needed from the 2,700-line settings module.
vi.mock('@/components/fairway/pages/settings/FairwaySettingsGeneral', () => ({
  DirtyRegistryContext: createContext(null),
}));

import { DirtyRegistryContext } from '@/components/fairway/pages/settings/FairwaySettingsGeneral';
import type { DirtyRegistry } from '@/components/fairway/pages/settings/FairwaySettingsGeneral';
import { SectionDirtyScope, useSectionDirtyTracker } from '../section-dirty-scope';
import { resolveSection, sectionsFor, type SectionId } from '../sections';
import { statusLineFor, type StatusInputs } from '../status-lines';
import type { SettingsProfile } from '@/components/fairway/pages/settings/use-settings-profile';

/** Mirrors useReportDirty in FairwaySettingsGeneral. */
function FakePanel({ id, dirty }: { id: string; dirty: boolean }) {
  const reg = useContext(DirtyRegistryContext as React.Context<DirtyRegistry | null>);
  useEffect(() => {
    reg?.setDirty(id, dirty);
  }, [reg, id, dirty]);
  useEffect(() => () => reg?.clear(id), [reg, id]);
  return null;
}

function Harness({
  guard,
  onSettled,
  onDirty,
  teamDirty,
  accountDirty,
}: {
  guard: DirtyRegistry;
  onSettled: (section: SectionId, id: string) => void;
  onDirty: (sections: ReadonlySet<SectionId>) => void;
  teamDirty: boolean;
  accountDirty: boolean;
}) {
  const { tracker, dirtySections } = useSectionDirtyTracker(onSettled);
  onDirty(dirtySections);
  const Provider = (DirtyRegistryContext as React.Context<DirtyRegistry | null>).Provider;
  return (
    <Provider value={guard}>
      <SectionDirtyScope section="team" tracker={tracker}>
        <FakePanel id="golf-scoring" dirty={teamDirty} />
        <FakePanel id="event-reminders" dirty={false} />
      </SectionDirtyScope>
      <SectionDirtyScope section="account" tracker={tracker}>
        <FakePanel id="password" dirty={accountDirty} />
      </SectionDirtyScope>
    </Provider>
  );
}

describe('SectionDirtyScope', () => {
  it('forwards to the guard, tracks sections, reports settles, and stays stable', () => {
    const guard: DirtyRegistry = { setDirty: vi.fn(), clear: vi.fn() };
    const onSettled = vi.fn();
    let latest: ReadonlySet<SectionId> = new Set();
    const onDirty = (s: ReadonlySet<SectionId>) => {
      latest = s;
    };

    const view = render(
      <Harness guard={guard} onSettled={onSettled} onDirty={onDirty} teamDirty={false} accountDirty={false} />,
    );
    expect([...latest]).toEqual([]);

    act(() => {
      view.rerender(
        <Harness guard={guard} onSettled={onSettled} onDirty={onDirty} teamDirty accountDirty={false} />,
      );
    });
    expect(guard.setDirty).toHaveBeenCalledWith('golf-scoring', true);
    expect([...latest]).toEqual(['team']);

    act(() => {
      view.rerender(<Harness guard={guard} onSettled={onSettled} onDirty={onDirty} teamDirty accountDirty />);
    });
    expect(new Set(latest)).toEqual(new Set(['team', 'account']));

    act(() => {
      view.rerender(
        <Harness guard={guard} onSettled={onSettled} onDirty={onDirty} teamDirty={false} accountDirty />,
      );
    });
    expect(guard.setDirty).toHaveBeenCalledWith('golf-scoring', false);
    expect(onSettled).toHaveBeenCalledWith('team', 'golf-scoring');
    expect([...latest]).toEqual(['account']);

    // No panel was torn down and re-registered while flags flipped.
    expect(guard.clear).not.toHaveBeenCalled();

    view.unmount();
    expect(guard.clear).toHaveBeenCalledWith('golf-scoring');
    expect(guard.clear).toHaveBeenCalledWith('password');
  });
});

const coach: SettingsProfile = {
  userId: 'u1',
  coachId: 'c1',
  name: 'Sam Coach',
  email: 'sam@example.edu',
  role: 'coach',
  teamId: 't1',
  teamName: 'Example Golf',
};

const player: SettingsProfile = {
  userId: 'u2',
  name: 'Pat Player',
  email: 'pat@example.edu',
  role: 'player',
  playerId: 'p1',
  playerData: {
    first_name: 'Pat',
    last_name: 'Player',
    handicap: null,
    handicap_index: null,
    graduation_year: null,
    hometown: null,
    state: null,
    phone: null,
  },
  currentTeam: null,
};

function inputs(overrides: Partial<StatusInputs> = {}): StatusInputs {
  return {
    profile: coach,
    team: { kind: 'loading' },
    notifications: { kind: 'loading' },
    coachHelm: { kind: 'loading' },
    theme: 'system',
    units: 'yards',
    deviceStoresReady: true,
    ...overrides,
  };
}

describe('sections', () => {
  it('orders by job rank per role and drops sections without data', () => {
    expect(sectionsFor(coach).map((s) => s.id)).toEqual([
      'team',
      'coachhelm',
      'notifications',
      'preferences',
      'account',
      'help',
    ]);
    expect(sectionsFor({ ...coach, teamId: undefined }).map((s) => s.id)[0]).toBe('coachhelm');
    expect(sectionsFor(player).map((s) => s.id)).toEqual([
      'notifications',
      'golf',
      'preferences',
      'account',
      'help',
    ]);
  });

  it('falls back to the first section for unknown or role-unavailable ids', () => {
    const coachSections = sectionsFor(coach);
    expect(resolveSection('account', coachSections)).toBe('account');
    expect(resolveSection('golf', coachSections)).toBe('team');
    expect(resolveSection(null, coachSections)).toBe('team');
  });
});

describe('statusLineFor', () => {
  it('reads a missing team settings row as defaults, never as a chosen value', () => {
    const noRow = statusLineFor(
      'team',
      inputs({ team: { kind: 'ready', value: { hasRow: false, scoringFormat: null, remindersOn: true } } }),
    );
    expect(noRow).toEqual({ kind: 'text', text: 'Default settings · reminders on' });

    const row = statusLineFor(
      'team',
      inputs({ team: { kind: 'ready', value: { hasRow: true, scoringFormat: 'match_play', remindersOn: false } } }),
    );
    expect(row).toEqual({ kind: 'text', text: 'Match play · reminders off' });
  });

  it('shows loading and failure as their own states', () => {
    expect(statusLineFor('team', inputs())).toEqual({ kind: 'loading' });
    expect(statusLineFor('notifications', inputs({ notifications: { kind: 'error' } }))).toMatchObject({
      kind: 'text',
      muted: true,
    });
  });

  it('counts channels, and quiet mode replaces the counts', () => {
    const counts = { emailOn: 4, emailTotal: 5, pushOn: 0, pushTotal: 5 };
    expect(
      statusLineFor('notifications', inputs({ notifications: { kind: 'ready', value: { quietMode: false, ...counts } } })),
    ).toEqual({ kind: 'text', text: 'Email 4/5 · Push 0/5' });
    expect(
      statusLineFor('notifications', inputs({ notifications: { kind: 'ready', value: { quietMode: true, ...counts } } })),
    ).toEqual({ kind: 'text', text: 'Quiet mode on' });
  });

  it('keeps CoachHelm alert counts honest when the philosophy row is missing or unreadable', () => {
    const line = (alerts: StatusInputs['coachHelm']) => statusLineFor('coachhelm', inputs({ coachHelm: alerts }));
    expect(line({ kind: 'ready', value: { enabled: true, alerts: { kind: 'row', on: 7, total: 10, sensitivity: 'balanced' } } })).toEqual({
      kind: 'text',
      text: 'On · 7/10 alerts',
    });
    expect(line({ kind: 'ready', value: { enabled: false, alerts: { kind: 'default' } } })).toEqual({
      kind: 'text',
      text: 'Off · default alerts',
    });
    expect(line({ kind: 'ready', value: { enabled: true, alerts: { kind: 'unknown' } } })).toEqual({ kind: 'text', text: 'On' });
  });

  it('prints a null handicap index as not set, a zero as 0.0, and a failed read as unavailable', () => {
    const golf = (profile: SettingsProfile) => statusLineFor('golf', inputs({ profile }));
    expect(golf(player)).toEqual({ kind: 'text', text: 'Index not set · No team' });
    expect(
      golf({
        ...player,
        playerData: { ...player.playerData!, handicap_index: 0 },
        currentTeam: { id: 't9', name: 'Example Golf' },
      }),
    ).toEqual({ kind: 'text', text: 'Index 0.0 · Example Golf' });
    expect(golf({ ...player, playerData: { ...player.playerData!, handicap_index: -1.25 } })).toMatchObject({
      text: 'Index −1.3 · No team',
    });
    expect(golf({ ...player, playerData: undefined })).toMatchObject({ text: 'Details unavailable', muted: true });
  });

  it('reads preferences from the live stores and gives Help & legal no line', () => {
    expect(statusLineFor('preferences', inputs({ theme: 'dark', units: 'meters' }))).toEqual({
      kind: 'text',
      text: 'Dark theme · Meters',
    });
    // Before the stores have read localStorage, the default is not printed.
    expect(statusLineFor('preferences', inputs({ deviceStoresReady: false }))).toEqual({ kind: 'loading' });
    expect(statusLineFor('help', inputs())).toEqual({ kind: 'none' });
  });
});
