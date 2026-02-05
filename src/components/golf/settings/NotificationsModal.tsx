'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getNotificationPreferences,
  updateNotificationPreferences
} from '@/app/actions/notification-preferences';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NotificationPreferences {
  // Email preferences (mapped to database fields)
  email_messages: boolean;
  email_announcements: boolean;
  email_event_reminders: boolean;
  email_task_reminders: boolean;
  // Push preferences
  push_messages: boolean;
  push_events: boolean;
  push_task_reminders: boolean;
}

export function NotificationsModal({ isOpen, onClose }: NotificationsModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_messages: true,
    email_announcements: true,
    email_event_reminders: true,
    email_task_reminders: true,
    push_messages: false,
    push_events: false,
    push_task_reminders: true,
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
      const result = await getNotificationPreferences();
      if (result.data) {
        setPreferences({
          email_messages: result.data.email_messages ?? true,
          email_announcements: result.data.email_announcements ?? true,
          email_event_reminders: result.data.email_event_reminders ?? true,
          email_task_reminders: result.data.email_task_reminders ?? true,
          push_messages: result.data.push_messages ?? false,
          push_events: result.data.push_events ?? false,
          push_task_reminders: result.data.push_task_reminders ?? true,
        });
      }
    } catch {
      // Use defaults if fetch fails
    } finally {
      setLoadingPrefs(false);
    }
  }

  async function handleSave() {
    setLoading(true);

    try {
      const result = await updateNotificationPreferences({
        email_messages: preferences.email_messages,
        email_announcements: preferences.email_announcements,
        email_event_reminders: preferences.email_event_reminders,
        email_task_reminders: preferences.email_task_reminders,
        push_messages: preferences.push_messages,
        push_events: preferences.push_events,
        push_task_reminders: preferences.push_task_reminders,
      });

      if (result.success) {
        showToast('Notification preferences updated', 'success');
        onClose();
      } else {
        showToast(result.error || 'Failed to update preferences', 'error');
      }
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
                label="Event Reminders"
                description="Reminders for upcoming events and schedule changes"
                checked={preferences.email_event_reminders}
                onChange={() => togglePreference('email_event_reminders')}
              />
              <ToggleRow
                label="Tasks & Practice Reminders"
                description="Practice tasks and assignment reminders"
                checked={preferences.email_task_reminders}
                onChange={() => togglePreference('email_task_reminders')}
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Push Notifications</h3>
            <div className="space-y-2">
              <ToggleRow
                label="Messages"
                description="Instant notifications for new messages"
                checked={preferences.push_messages}
                onChange={() => togglePreference('push_messages')}
              />
              <ToggleRow
                label="Events"
                description="Notifications for events and schedule updates"
                checked={preferences.push_events}
                onChange={() => togglePreference('push_events')}
              />
              <ToggleRow
                label="Tasks & Reminders"
                description="Push notifications for tasks and reminders"
                checked={preferences.push_task_reminders}
                onChange={() => togglePreference('push_task_reminders')}
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
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${checked ? 'enabled' : 'disabled'}`}
      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
    >
      <div className="text-left flex-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
          checked ? 'bg-emerald-600' : 'bg-slate-200'
        )}
      >
        <div className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
          checked && 'transform translate-x-5'
        )} />
      </div>
    </button>
  );
}
