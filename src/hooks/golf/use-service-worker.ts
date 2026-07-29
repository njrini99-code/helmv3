'use client';

/**
 * Service Worker Hook for Golf Shot Tracking
 *
 * Handles service worker registration, updates, and messaging.
 *
 * Features:
 * - Automatic registration on mount
 * - Update detection and prompt
 * - Background sync registration
 * - Push notification permission handling
 * - Service worker messaging
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface ServiceWorkerState {
  /** Whether service workers are supported */
  isSupported: boolean;
  /** Whether the service worker is registered */
  isRegistered: boolean;
  /** Whether there's an update available */
  hasUpdate: boolean;
  /** Current registration status */
  status: 'idle' | 'registering' | 'registered' | 'error' | 'updating';
  /** The service worker registration object */
  registration: ServiceWorkerRegistration | null;
  /** Error message if registration failed */
  error: string | null;
  /** Whether push notifications are enabled */
  pushEnabled: boolean;
  /** Whether background sync is supported */
  syncSupported: boolean;
}

interface UseServiceWorkerOptions {
  /** Path to the service worker file */
  swPath?: string;
  /** Whether to register immediately */
  immediate?: boolean;
  /** Callback when service worker is registered */
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
  /** Callback when an update is available */
  onUpdateAvailable?: () => void;
  /** Callback when the service worker takes control */
  onControlled?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SW_PATH = '/sw.js';

// ============================================================================
// HOOK
// ============================================================================

export function useServiceWorker(options: UseServiceWorkerOptions = {}): ServiceWorkerState & {
  register: () => Promise<void>;
  unregister: () => Promise<void>;
  update: () => Promise<void>;
  skipWaiting: () => void;
  requestPushPermission: () => Promise<boolean>;
  registerBackgroundSync: (tag: string) => Promise<boolean>;
  postMessage: (message: unknown) => void;
} {
  const {
    swPath = DEFAULT_SW_PATH,
    immediate = true,
    onRegistered,
    onUpdateAvailable,
    onControlled,
    onError,
  } = options;

  // State
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    hasUpdate: false,
    status: 'idle',
    registration: null,
    error: null,
    pushEnabled: false,
    syncSupported: false,
  });

  // Refs
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const mountedRef = useRef(true);

  // Check if service workers are supported
  useEffect(() => {
    const isSupported = typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'caches' in window;

    setState(prev => ({ ...prev, isSupported }));

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Register the service worker
   */
  const register = useCallback(async () => {
    if (!state.isSupported) {
      return;
    }

    if (state.isRegistered) {
      return;
    }

    setState(prev => ({ ...prev, status: 'registering', error: null }));

    try {
      const registration = await navigator.serviceWorker.register(swPath, {
        scope: '/',
      });

      if (!registration) {
        throw new Error('Service worker registration did not return a registration.');
      }

      registrationRef.current = registration;

      if (!mountedRef.current) return;

      // Check for sync support
      const syncSupported = typeof registration === 'object' && 'sync' in registration;

      // Check push notification permission. Guard `Notification` — it is
      // undefined in browsers/contexts without the Notifications API (e.g.
      // some iOS Safari versions and in-app WebViews), where a bare reference
      // throws "ReferenceError: Can't find variable: Notification".
      const pushEnabled =
        typeof Notification !== 'undefined' && Notification.permission === 'granted';

      setState(prev => ({
        ...prev,
        isRegistered: true,
        status: 'registered',
        registration,
        syncSupported,
        pushEnabled,
      }));

      onRegistered?.(registration);

      // Set up update listener
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New update available
              if (mountedRef.current) {
                setState(prev => ({ ...prev, hasUpdate: true }));
                onUpdateAvailable?.();
              }
            }
          });
        }
      });

      // Listen for controller change
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (mountedRef.current) {
          onControlled?.();
        }
      });

    } catch (error) {
      if (!mountedRef.current) return;

      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      const lowerMessage = errorMessage.toLowerCase();
      const blockedOrUnavailable =
        lowerMessage.includes('blocked') ||
        lowerMessage.includes('not available') ||
        lowerMessage.includes('did not return a registration');

      if (blockedOrUnavailable) {
        setState(prev => ({
          ...prev,
          isSupported: false,
          status: 'idle',
          error: null,
        }));
        return;
      }

      console.error('[SW Hook] Registration failed:', error);

      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));

      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [state.isSupported, state.isRegistered, swPath, onRegistered, onUpdateAvailable, onControlled, onError]);

  /**
   * Unregister the service worker
   */
  const unregister = useCallback(async () => {
    if (!registrationRef.current) {
      return;
    }

    try {
      await registrationRef.current.unregister();

      if (!mountedRef.current) return;

      registrationRef.current = null;

      setState(prev => ({
        ...prev,
        isRegistered: false,
        status: 'idle',
        registration: null,
        hasUpdate: false,
      }));
    } catch (error) {
      console.error('[SW Hook] Unregistration failed:', error);
    }
  }, []);

  /**
   * Check for updates
   */
  const update = useCallback(async () => {
    if (!registrationRef.current) {
      return;
    }

    setState(prev => ({ ...prev, status: 'updating' }));

    try {
      await registrationRef.current.update();

      if (!mountedRef.current) return;

      setState(prev => ({ ...prev, status: 'registered' }));
    } catch (error) {
      console.error('[SW Hook] Update check failed:', error);

      if (!mountedRef.current) return;

      setState(prev => ({ ...prev, status: 'error', error: 'Update check failed' }));
    }
  }, []);

  /**
   * Skip waiting and activate the new service worker
   */
  const skipWaiting = useCallback(() => {
    if (!registrationRef.current?.waiting) {
      return;
    }

    registrationRef.current.waiting.postMessage({ type: 'SKIP_WAITING' });
  }, []);

  /**
   * Request push notification permission
   */
  const requestPushPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';

      if (mountedRef.current) {
        setState(prev => ({ ...prev, pushEnabled: granted }));
      }

      return granted;
    } catch (error) {
      console.error('[SW Hook] Push permission request failed:', error);
      return false;
    }
  }, []);

  /**
   * Register for background sync
   */
  const registerBackgroundSync = useCallback(async (tag: string): Promise<boolean> => {
    if (!registrationRef.current || !state.syncSupported) {
      return false;
    }

    try {
      // @ts-expect-error - sync API is not in TypeScript types
      await registrationRef.current.sync.register(tag);
      return true;
    } catch (error) {
      console.error('[SW Hook] Background sync registration failed:', error);
      return false;
    }
  }, [state.syncSupported]);

  /**
   * Post a message to the service worker
   */
  const postMessage = useCallback((message: unknown) => {
    if (!navigator.serviceWorker.controller) {
      return;
    }

    navigator.serviceWorker.controller.postMessage(message);
  }, []);

  /*
   * DEV: never register, and tear down anything already registered.
   *
   * `CACHE_VERSION` in public/sw.js is only stamped with a real build id by
   * scripts/stamp-sw.mjs on an actual Vercel build (deliberately — see that
   * file's generated-file policy note). On a dev machine it stays the literal
   * placeholder `golfhelm-vsource` forever, so the install/activate cache-bust
   * never triggers and a dev cache NEVER invalidates. Combined with the old
   * navigation handler, that served pre-migration HTML on back-navigation
   * indefinitely — pages that hadn't existed in that form for weeks.
   *
   * A service worker earns nothing in dev (there is no offline story to test on
   * localhost that is worth a permanently poisoned cache), so we both skip
   * registration and unregister + drop caches for any SW a previous dev session
   * left installed. Without that cleanup the fix would only help machines that
   * had never run the app before.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    void (async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith('golfhelm-')).map((k) => caches.delete(k)));
        }
      } catch {
        // Best effort — a browser that refuses either call just keeps its SW.
      }
    })();
  }, []);

  // Auto-register on mount if immediate is true
  useEffect(() => {
    // Production only: see the dev teardown effect above.
    if (process.env.NODE_ENV !== 'production') return;
    if (immediate && state.isSupported && !state.isRegistered && state.status === 'idle') {
      register();
    }
  }, [immediate, state.isSupported, state.isRegistered, state.status, register]);

  // Listen for messages from service worker
  useEffect(() => {
    if (!state.isSupported) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_REQUESTED') {
        // Dispatch custom event that the app can listen for
        window.dispatchEvent(new CustomEvent('sw-sync-requested', {
          detail: event.data,
        }));
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [state.isSupported]);

  return {
    ...state,
    register,
    unregister,
    update,
    skipWaiting,
    requestPushPermission,
    registerBackgroundSync,
    postMessage,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// UseServiceWorkerOptions is already exported as an interface above
