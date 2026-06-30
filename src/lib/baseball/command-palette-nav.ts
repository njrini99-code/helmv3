// =============================================================================
// Baseball command palette — registry-driven navigation items.
//
// The ⌘K palette MUST stay in sync with the same nav resolver the sidebar and
// mobile shell use (getVisibleBaseballNav). Hardcoded route lists drift from
// capability gates and program-type ordering; this module is the single bridge.
// =============================================================================

import type { ComponentType, SVGProps } from 'react';
import {
  BASEBALL_MESSAGES_NAV,
  getVisibleBaseballNav,
  type BaseballNavContext,
  type BaseballNavEntry,
} from './nav-registry';
import { IconSettings } from '@/components/icons';

export type BaseballCommandPaletteItem = {
  id: string;
  label: string;
  description?: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  keywords?: string[];
};

/** Account settings lives outside the feature registry but is always reachable. */
const ACCOUNT_SETTINGS_ITEM: BaseballCommandPaletteItem = {
  id: 'account-settings',
  label: 'Settings',
  description: 'Account and password settings',
  href: '/baseball/dashboard/settings',
  icon: IconSettings,
  keywords: ['account', 'profile', 'password', 'security'],
};

function entryToCommand(entry: BaseballNavEntry): BaseballCommandPaletteItem {
  return {
    id: entry.id,
    label: entry.label,
    description: `Go to ${entry.label}`,
    href: entry.href,
    icon: entry.icon,
    keywords: [entry.label.toLowerCase(), entry.id.replace(/-/g, ' ')],
  };
}

function messagesToCommand(): BaseballCommandPaletteItem {
  return {
    id: BASEBALL_MESSAGES_NAV.id,
    label: BASEBALL_MESSAGES_NAV.label,
    description: 'Team communication',
    href: BASEBALL_MESSAGES_NAV.href,
    icon: BASEBALL_MESSAGES_NAV.icon,
    keywords: ['messages', 'chat', 'communication', 'inbox'],
  };
}

/**
 * Build the visible ⌘K command list for a resolved Baseball nav context.
 * Hidden / capability-gated routes never appear because we reuse getVisibleBaseballNav.
 */
export function buildBaseballCommandPaletteItems(
  ctx: BaseballNavContext,
): BaseballCommandPaletteItem[] {
  const visible = getVisibleBaseballNav(ctx);
  const items = visible.map(entryToCommand);

  if (!items.some((item) => item.id === BASEBALL_MESSAGES_NAV.id)) {
    items.push(messagesToCommand());
  }

  if (!items.some((item) => item.href === ACCOUNT_SETTINGS_ITEM.href)) {
    items.push(ACCOUNT_SETTINGS_ITEM);
  }

  return items;
}
