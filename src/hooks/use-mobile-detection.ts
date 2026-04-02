'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './use-local-storage';
import { triggerHaptic as triggerHapticUtil } from '@/lib/utils/capacitor';

interface MobileDetectionResult {
  isMobile: boolean;
  isTablet: boolean;
  isTouch: boolean;
  isMobileDevice: boolean; // Mobile or tablet with touch
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait' | 'landscape';
  preferMobileUI: boolean;
  setPreferMobileUI: (prefer: boolean) => void;
  togglePreferMobileUI: () => void;
}

const MOBILE_UI_PREF_KEY = 'helm-prefer-mobile-ui';

/**
 * Hook for detecting mobile devices and managing mobile UI preference.
 * Combines device detection with user preference for UI mode.
 *
 * Usage:
 * ```tsx
 * const { isMobile, isTouch, preferMobileUI, togglePreferMobileUI } = useMobileDetection();
 *
 * if (preferMobileUI) {
 *   return <MobileUI />;
 * }
 * return <DesktopUI />;
 * ```
 */
export function useMobileDetection(): MobileDetectionResult {
  // Always initialize with server-safe defaults to avoid hydration mismatch.
  // useEffect below will set the real values on the client after hydration.
  const [screenWidth, setScreenWidth] = useState(768);
  const [screenHeight, setScreenHeight] = useState(1024);
  const [isTouch, setIsTouch] = useState(false);
  const [preferMobileUIStored, setPreferMobileUIStored] = useLocalStorage<boolean | null>(
    MOBILE_UI_PREF_KEY,
    null
  );

  // Detect screen size and touch capability
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateDimensions = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };

    const detectTouch = () => {
      const hasTouch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        // @ts-expect-error - Legacy IE detection
        (window.DocumentTouch && document instanceof window.DocumentTouch);
      setIsTouch(hasTouch);
    };

    updateDimensions();
    detectTouch();

    window.addEventListener('resize', updateDimensions);
    window.addEventListener('orientationchange', updateDimensions);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
    };
  }, []);

  // Device type detection based on screen width
  const isMobile = screenWidth > 0 && screenWidth < 768;
  const isTablet = screenWidth >= 768 && screenWidth < 1024;
  const isMobileDevice = (isMobile || isTablet) && isTouch;
  const orientation = screenWidth > screenHeight ? 'landscape' : 'portrait';

  // Determine if mobile UI should be used
  // If user has set preference, use that. Otherwise, auto-detect.
  const preferMobileUI = preferMobileUIStored !== null
    ? preferMobileUIStored
    : isMobileDevice;

  const setPreferMobileUI = useCallback((prefer: boolean) => {
    setPreferMobileUIStored(prefer);
  }, [setPreferMobileUIStored]);

  const togglePreferMobileUI = useCallback(() => {
    setPreferMobileUIStored(!preferMobileUI);
  }, [preferMobileUI, setPreferMobileUIStored]);

  return {
    isMobile,
    isTablet,
    isTouch,
    isMobileDevice,
    screenWidth,
    screenHeight,
    orientation,
    preferMobileUI,
    setPreferMobileUI,
    togglePreferMobileUI,
  };
}

/**
 * Simple hook to check if current viewport is mobile-sized
 */
function useIsMobile(): boolean {
  const { isMobile } = useMobileDetection();
  return isMobile;
}

/**
 * Hook for handling safe area insets (notches, home indicators)
 * Uses CSS custom properties set by the viewport-fit=cover meta tag
 */
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const computeInsets = () => {
      // Create a temporary element to measure env() values
      const el = document.createElement('div');
      el.style.position = 'fixed';
      el.style.visibility = 'hidden';
      el.style.top = 'env(safe-area-inset-top, 0px)';
      el.style.right = 'env(safe-area-inset-right, 0px)';
      el.style.bottom = 'env(safe-area-inset-bottom, 0px)';
      el.style.left = 'env(safe-area-inset-left, 0px)';
      document.body.appendChild(el);

      const computed = getComputedStyle(el);
      setInsets({
        top: parseInt(computed.top || '0', 10),
        right: parseInt(computed.right || '0', 10),
        bottom: parseInt(computed.bottom || '0', 10),
        left: parseInt(computed.left || '0', 10),
      });

      document.body.removeChild(el);
    };

    computeInsets();
    window.addEventListener('orientationchange', computeInsets);
    return () => window.removeEventListener('orientationchange', computeInsets);
  }, []);

  return insets;
}

/**
 * Hook for triggering haptic feedback
 * Uses Capacitor Haptics on native, falls back silently on web
 */
export function useHapticFeedback() {
  const triggerHapticFeedback = useCallback((pattern: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light') => {
    triggerHapticUtil(pattern);
  }, []);

  return { triggerHaptic: triggerHapticFeedback };
}
