'use client';

import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { isNativeApp } from '@/lib/utils/capacitor';

interface PushPermissionPromptProps {
  onClose: () => void;
}

/**
 * Explanation modal for push notification permission.
 * Shows after first login on native app. Uses Helm glass design.
 */
export function PushPermissionPrompt({ onClose }: PushPermissionPromptProps) {
  const { requestPermission } = usePushNotifications();
  const [isRequesting, setIsRequesting] = useState(false);

  if (!isNativeApp()) return null;

  const handleEnable = async () => {
    setIsRequesting(true);
    await requestPermission();
    setIsRequesting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/30 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm bg-white/90 backdrop-blur-xl border border-white/30 rounded-2xl shadow-glass-lg p-6 animate-scale-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="w-12 h-12 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-center mb-4">
          <Bell className="w-6 h-6 text-primary-600" />
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-warm-900 mb-2">
          Stay in the loop
        </h3>
        <p className="text-sm text-warm-500 leading-relaxed mb-6">
          Enable notifications to get instant updates on messages, announcements, tasks, and team events.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleEnable}
            disabled={isRequesting}
            className="
              w-full py-3
              bg-primary-600 text-white font-medium text-sm
              rounded-[10px] shadow-sm
              transition-all duration-200
              hover:bg-primary-700 hover:shadow-md
              active:scale-[0.98]
              disabled:opacity-50
            "
          >
            {isRequesting ? 'Enabling...' : 'Enable Notifications'}
          </button>
          <button
            onClick={onClose}
            className="
              w-full py-3
              text-warm-500 font-medium text-sm
              rounded-[10px]
              transition-all duration-200
              hover:bg-warm-100 hover:text-warm-700
              active:scale-[0.98]
            "
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}
