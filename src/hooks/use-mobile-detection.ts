'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './use-local-storage';

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
  const [screenWidth, setScreenWidth] = useState(0);
  const [screenHeight, setScreenHeight] = useState(0);
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
export function useIsMobile(): boolean {
  const { isMobile } = useMobileDetection();
  return isMobile;
}

/**
 * Hook for handling safe area insets (notches, home indicators)
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
      const style = getComputedStyle(document.documentElement);
      setInsets({
        top: parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0', 10),
        right: parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0', 10),
        bottom: parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10),
        left: parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0', 10),
      });
    };

    computeInsets();
    window.addEventListener('resize', computeInsets);
    return () => window.removeEventListener('resize', computeInsets);
  }, []);

  return insets;
}

/**
 * Hook for triggering haptic feedback (vibration)
 */
export function useHapticFeedback() {
  const triggerHaptic = useCallback((pattern: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light') => {
    if (typeof window === 'undefined' || !navigator.vibrate) return;

    const patterns: Record<string, number | number[]> = {
      light: 10,
      medium: 25,
      heavy: 50,
      success: [10, 50, 10],
      warning: [25, 50, 25],
      error: [50, 100, 50, 100, 50],
    };

    try {
      navigator.vibrate(patterns[pattern] ?? 10);
    } catch {
      // Vibration not supported or blocked
    }
  }, []);

  return { triggerHaptic };
}
