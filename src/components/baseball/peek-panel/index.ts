/**
 * Peek Panel Components
 *
 * A slide-out panel system for quick player/school previews.
 *
 * Usage:
 * 1. Add PeekPanelProvider to your layout
 * 2. Use PeekPanelTrigger to wrap clickable elements
 * 3. Or call usePeekPanelStore().openPlayerPanel(id) directly
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * import { PeekPanelProvider } from '@/components/baseball/peek-panel';
 *
 * export default function Layout({ children }) {
 *   return (
 *     <PeekPanelProvider>
 *       {children}
 *     </PeekPanelProvider>
 *   );
 * }
 *
 * // In a component
 * import { PeekPanelTrigger } from '@/components/baseball/peek-panel';
 *
 * <PeekPanelTrigger type="player" id={player.id}>
 *   <PlayerCard player={player} />
 * </PeekPanelTrigger>
 *
 * // Or using the store directly
 * import { usePeekPanelStore } from '@/stores/peek-panel-store';
 *
 * const { openPlayerPanel } = usePeekPanelStore();
 * onClick={() => openPlayerPanel(player.id)}
 * ```
 */

export { PeekPanelProvider } from './PeekPanelProvider';
