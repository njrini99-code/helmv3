/**
 * Lazy-loaded components for code splitting
 *
 * Import these instead of the direct components for better performance.
 * These components are split into separate bundles and loaded on demand.
 */

import dynamic from 'next/dynamic';

/**
 * Loading component shown while lazy component is loading
 */
const DefaultLoading = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin h-8 w-8 border-2 border-primary-600 border-t-transparent rounded-full" />
  </div>
);

/**
 * Lazy load Chat Window component
 * Heavy component with real-time updates
 */
export const LazyChatWindow = dynamic(
  () => import('@/components/messages/ChatWindow').then(mod => ({ default: mod.ChatWindow })),
  {
    loading: () => <DefaultLoading />,
  }
);

/**
 * Lazy load Conversation List component
 * Heavy component with real-time updates
 */
export const LazyConversationList = dynamic(
  () => import('@/components/messages/ConversationList').then(mod => ({ default: mod.ConversationList })),
  {
    loading: () => <DefaultLoading />,
  }
);
