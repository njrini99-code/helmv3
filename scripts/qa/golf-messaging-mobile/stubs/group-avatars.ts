import { fixturePeople } from '../fixtures';

export function useGolfGroupAvatars() {
  return new Map([
    ['conv-practice', [
      { name: fixturePeople.alex.name, avatar: fixturePeople.alex.avatar },
      { name: fixturePeople.jordan.name, avatar: fixturePeople.jordan.avatar },
    ]],
  ]);
}
