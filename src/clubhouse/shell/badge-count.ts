import type { ChShellData } from '../data/shell';
import type { ChNavItem } from './nav';

// A leaf module: section-switch.tsx needs this and must not import Sidebar.tsx
// (Sidebar > Dock > phone-chrome > section-switch would close a runtime cycle).
export function badgeCount(
  item: ChNavItem,
  badges: { messages: number; announcements: number; tasks: number; travel: number },
  shell: ChShellData,
): number | null {
  if (item.badge === 'messages')
    return badges.messages > 0 ? badges.messages : null;
  if (item.badge === 'hub') {
    // The same sum as the current app's Team Hub badge (src/lib/golf/nav-registry.ts).
    const n = badges.announcements + badges.tasks + badges.travel;
    return n > 0 ? n : null;
  }
  if (item.badge === 'joinRequests')
    return shell.pendingJoinRequests ? shell.pendingJoinRequests : null;
  return null;
}
