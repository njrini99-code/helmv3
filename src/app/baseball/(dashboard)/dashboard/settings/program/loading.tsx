import { SettingsLeafSkeleton } from '@/components/baseball/settings/SettingsLeafSkeleton';

/**
 * Route-level loading skeleton for Program Settings.
 *
 * Previously a bespoke skeleton built from `Card variant="glass"` and
 * `border-warm-100` — the LEGACY design system — standing in for a page that
 * had already migrated to the Living Annual kit. The skeleton and the page it
 * represented were visibly different surfaces, which is the flash this pass
 * exists to remove.
 *
 * It now renders the same `SettingsLeafSkeleton` as every other settings route.
 * Program Settings is the tallest form in the tree (identity, access, AI,
 * notifications, retention…), so it opens with four section blocks rather than
 * the default three.
 *
 * Still deliberately NOT the live `<Header>`: Header calls useNotifications()
 * unconditionally, which would open a realtime Supabase subscription on every
 * route-transition mount of a skeleton for a screen about to render its own
 * header anyway.
 */
export default function Loading() {
  return <SettingsLeafSkeleton label="Loading Program Settings…" sections={4} />;
}
