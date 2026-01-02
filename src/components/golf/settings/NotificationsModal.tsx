'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NotificationPreferences {
  email_rounds: boolean;
  email_messages: boolean;
  email_announcements: boolean;
  email_tasks: boolean;
  push_rounds: boolean;
  push_messages: boolean;
  push_announcements: boolean;
  push_tasks: boolean;
}

export function NotificationsModal({ isOpen, onClose }: NotificationsModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_rounds: true,
    email_messages: true,
    email_announcements: true,
    email_tasks: true,
    push_rounds: true,
    push_messages: true,
    push_announcements: true,
    push_tasks: true,
  });
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen]);

  async function loadPreferences() {
    setLoadingPrefs(true);
    try {
      const stored = localStorage.getItem('golf_notification_preferences');
      if (stored) {
        setPreferences(JSON.parse(stored));
      }
    } catch (error) {
      // Use defaults if no preferences exist
    } finally {
      setLoadingPrefs(false);
    }
  }

  async function handleSave() {
    setLoading(true);

    try {
      localStorage.setItem('golf_notification_preferences', JSON.stringify(preferences));
      showToast('Notification preferences updated', 'success');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update preferences', 'error');
    } finally {
      setLoading(false);
    }
  }

  function togglePreference(key: keyof NotificationPreferences) {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Notification Preferences">
      {loadingPrefs ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Email Notifications</h3>
            <div className="space-y-2">
              <ToggleRow
                label="Round Updates"
                description="Get notified about new rounds and scores"
                checked={preferences.email_rounds}
                onChange={() => togglePreference('email_rounds')}
              />
              <ToggleRow
                label="Messages"
                description="Receive email for new messages"
                checked={preferences.email_messages}
                onChange={() => togglePreference('email_messages')}
              />
              <ToggleRow
                label="Announcements"
                description="Team announcements and updates"
                checked={preferences.email_announcements}
                onChange={() => togglePreference('email_announcements')}
              />
              <ToggleRow
                label="Tasks & Reminders"
                description="Practice tasks and schedule reminders"
                checked={preferences.email_tasks}
                onChange={() => togglePreference('email_tasks')}
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Push Notifications</h3>
            <div className="space-y-2">
              <ToggleRow
                label="Round Updates"
                description="Get notified about new rounds and scores"
                checked={preferences.push_rounds}
                onChange={() => togglePreference('push_rounds')}
              />
              <ToggleRow
                label="Messages"
                description="Instant notifications for new messages"
                checked={preferences.push_messages}
                onChange={() => togglePreference('push_messages')}
              />
              <ToggleRow
                label="Announcements"
                description="Team announcements and updates"
                checked={preferences.push_announcements}
                onChange={() => togglePreference('push_announcements')}
              />
              <ToggleRow
                label="Tasks & Reminders"
                description="Practice tasks and schedule reminders"
                checked={preferences.push_tasks}
                onChange={() => togglePreference('push_tasks')}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={loading}>
              Save Preferences
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
    >
      <div className="text-left flex-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className={cn(
        'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
        checked ? 'bg-emerald-600' : 'bg-slate-200'
      )}>
        <div className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
          checked && 'transform translate-x-5'
        )} />
      </div>
    </button>
  );
}
