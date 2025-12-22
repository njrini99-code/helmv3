/**
 * Lazy-loaded components for code splitting
 *
 * Import these instead of the direct components for better performance.
 * These components are split into separate bundles and loaded on demand.
 */

import dynamic from 'next/dynamic';
import { ComponentType } from 'react';

/**
 * Loading component shown while lazy component is loading
 */
const DefaultLoading = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
  </div>
);

/**
 * Lazy load Video Showcase component
 * Heavy component with video player and modals
 */
export const LazyVideoShowcase: any = dynamic(
  () => import('@/components/player/VideoShowcase').then(mod => ({ default: mod.VideoShowcase })),
  {
    loading: () => <DefaultLoading />,
    ssr: false, // Client-side only for video player
  }
);

/**
 * Lazy load Chat Window component
 * Heavy component with real-time updates
 */
export const LazyChatWindow: any = dynamic(
  () => import('@/components/messages/ChatWindow').then(mod => ({ default: mod.ChatWindow })),
  {
    loading: () => <DefaultLoading />,
  }
);

/**
 * Lazy load Conversation List component
 * Heavy component with real-time updates
 */
export const LazyConversationList: any = dynamic(
  () => import('@/components/messages/ConversationList').then(mod => ({ default: mod.ConversationList })),
  {
    loading: () => <DefaultLoading />,
  }
);

/**
 * Lazy load USA Map component
 * Heavy component with map rendering
 */
export const LazyUSAMap: any = dynamic(
  () => import('@/components/coach/discover/USAMap').then(mod => ({ default: mod.USAMap })),
  {
    loading: () => <DefaultLoading />,
    ssr: false, // Map rendering is client-side only
  }
);

/**
 * Generic lazy component loader with custom loading component
 */
export function createLazyComponent<P = {}>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options?: {
    loading?: () => React.ReactElement;
    ssr?: boolean;
  }
) {
  return dynamic(importFn, {
    loading: options?.loading || (() => <DefaultLoading />),
    ssr: options?.ssr ?? true,
  });
}

/**
 * Preload a lazy component
 * Call this when you know the user will need the component soon
 */
export function preloadComponent(lazyComponent: any) {
  if (lazyComponent && typeof lazyComponent.preload === 'function') {
    lazyComponent.preload();
  }
}
