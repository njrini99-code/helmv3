import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types/database';

/**
 * Generate or retrieve a unique tab ID for session isolation
 */
function getTabId(): string {
  if (typeof window === 'undefined') return 'server';

  let tabId = sessionStorage.getItem('helm-tab-id');
  if (!tabId) {
    tabId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    sessionStorage.setItem('helm-tab-id', tabId);
  }
  return tabId;
}

/**
 * Get the storage key for this tab's auth session
 */
function getStorageKey(): string {
  return `sb-auth-${getTabId()}`;
}

/**
 * Custom storage adapter using sessionStorage for complete tab isolation
 * Each tab gets its own auth session, allowing multiple accounts simultaneously
 */
const createTabIsolatedStorage = () => ({
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    // Use tab-specific key
    const tabKey = key.replace('supabase-auth-token', getStorageKey());
    return sessionStorage.getItem(tabKey);
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    const tabKey = key.replace('supabase-auth-token', getStorageKey());
    sessionStorage.setItem(tabKey, value);

    // Also set a tab-specific cookie for server-side auth
    syncToCookie(value);
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    const tabKey = key.replace('supabase-auth-token', getStorageKey());
    sessionStorage.removeItem(tabKey);
    clearCookie();
  },
});

/**
 * Sync session to tab-specific cookies for server requests
 */
function syncToCookie(sessionData: string): void {
  if (typeof document === 'undefined') return;

  try {
    const parsed = JSON.parse(sessionData);
    const tabId = getTabId();
    const maxAge = 60 * 60 * 24 * 7; // 7 days

    // Store the full session in a tab-specific cookie
    // The cookie name includes the tab ID so each tab has its own
    document.cookie = `sb-session-${tabId}=${encodeURIComponent(sessionData)}; path=/; max-age=${maxAge}; SameSite=Lax`;

    // Also set the standard Supabase cookies for the CURRENT tab's session
    // These get overwritten when switching tabs, but that's expected
    if (parsed.access_token) {
      document.cookie = `sb-access-token=${parsed.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
    if (parsed.refresh_token) {
      document.cookie = `sb-refresh-token=${parsed.refresh_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
  } catch {
    // Ignore parse errors
  }
}

/**
 * Clear cookies on logout
 */
function clearCookie(): void {
  if (typeof document === 'undefined') return;
  const tabId = getTabId();
  document.cookie = `sb-session-${tabId}=; path=/; max-age=0`;
  document.cookie = `sb-access-token=; path=/; max-age=0`;
  document.cookie = `sb-refresh-token=; path=/; max-age=0`;
}

// Singleton client per tab to ensure consistent session
let clientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Create a Supabase client for use in Client Components
 * Uses sessionStorage for tab-isolated auth (allows multiple accounts in different tabs)
 */
export function createClient() {
  if (typeof window === 'undefined') {
    // Server-side: create fresh client each time
    return createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  // Client-side: reuse singleton for consistent session
  if (!clientInstance) {
    clientInstance = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          storage: createTabIsolatedStorage(),
          storageKey: 'supabase-auth-token',
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
        },
      }
    );
  }

  return clientInstance;
}

/**
 * Initialize tab session sync - syncs this tab's session to cookies when focused
 * This ensures server requests use the correct session for the active tab
 */
export function initTabSessionSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  const syncOnFocus = () => {
    const storageKey = getStorageKey();
    const session = sessionStorage.getItem(storageKey);
    if (session) {
      syncToCookie(session);
    }
  };

  // Sync immediately
  syncOnFocus();

  // Sync when tab becomes visible
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      syncOnFocus();
    }
  };

  window.addEventListener('focus', syncOnFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('focus', syncOnFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * Clear the client instance (useful for testing or after logout)
 */
export function clearClientInstance(): void {
  clientInstance = null;
}
