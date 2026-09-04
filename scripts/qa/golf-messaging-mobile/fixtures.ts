export const fixtureIds = [
  'inbox-unread-group',
  'thread-short-group',
  'thread-group-details',
  'thread-failed-send',
  'new-private-group',
] as const;

export type FixtureId = (typeof fixtureIds)[number];

// Deliberately no photos: the real component render must prove that missing
// avatar_url values produce distinct, intentional initials and that a group
// collapses to its title monogram instead of an all-initial avatar stack.
export const fixturePeople = {
  alex: { userId: 'player-alex', name: 'Alexis Bennett', subtitle: 'Junior', avatar: null },
  jordan: { userId: 'player-jordan', name: 'Jordan Rivera', subtitle: 'Sophomore', avatar: null },
  taylor: { userId: 'player-taylor', name: 'Taylor Morgan', subtitle: 'Senior', avatar: null },
  coach: { userId: 'coach-rini', name: 'Coach Rini', subtitle: 'Head coach', avatar: null },
} as const;
