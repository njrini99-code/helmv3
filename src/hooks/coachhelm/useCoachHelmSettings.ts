'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// Database row type for golf_coachhelm_settings (table created in migration)
interface CoachHelmSettingsRow {
  id: string;
  user_id: string;
  enabled: boolean;
  show_insights: boolean;
  show_predictions: boolean;
  show_patterns: boolean;
  notification_level: 'all' | 'important' | 'critical' | 'none';
  disabled_at: string | null;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface CoachHelmUserSettings {
  enabled: boolean;
  showInsights: boolean;
  showPredictions: boolean;
  showPatterns: boolean;
  notificationLevel: 'all' | 'important' | 'critical' | 'none';
  disabledAt: string | null;
  disabledReason: string | null;
}

interface UseCoachHelmSettingsReturn {
  settings: CoachHelmUserSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  updateSettings: (updates: Partial<CoachHelmUserSettings>) => Promise<boolean>;
  enable: () => Promise<boolean>;
  disable: (reason?: string) => Promise<boolean>;
}

const DEFAULT_SETTINGS: CoachHelmUserSettings = {
  enabled: true,
  showInsights: true,
  showPredictions: true,
  showPatterns: true,
  notificationLevel: 'all',
  disabledAt: null,
  disabledReason: null,
};

/**
 * Hook to manage CoachHelm user settings
 *
 * @param userId - The user's UUID
 */
export function useCoachHelmSettings(
  userId: string | null
): UseCoachHelmSettingsReturn {
  const [settings, setSettings] = useState<CoachHelmUserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch settings on mount
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const currentUserId = userId;

    async function fetchSettings() {
      setLoading(true);
      setError(null);

      // Use type assertion since table is created via migration
      const { data, error: fetchError } = await (supabase
        .from('golf_coachhelm_settings' as 'users') // Type hack for new table
        .select('*')
        .eq('user_id', currentUserId)
        .maybeSingle() as unknown as Promise<{ data: CoachHelmSettingsRow | null; error: Error | null }>);

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      if (data) {
        setSettings({
          enabled: data.enabled,
          showInsights: data.show_insights,
          showPredictions: data.show_predictions,
          showPatterns: data.show_patterns,
          notificationLevel: data.notification_level,
          disabledAt: data.disabled_at,
          disabledReason: data.disabled_reason,
        });
      } else {
        // Create default settings if none exist
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = supabase.from('golf_coachhelm_settings' as any) as any;
        const { data: newData, error: createError } = await table
          .insert({
            user_id: currentUserId,
            enabled: true,
            show_insights: true,
            show_predictions: true,
            show_patterns: true,
            notification_level: 'all',
          })
          .select()
          .single() as { data: CoachHelmSettingsRow | null; error: Error | null };

        if (createError) {
          // Settings don't exist yet, use defaults
          setSettings(DEFAULT_SETTINGS);
        } else if (newData) {
          setSettings({
            enabled: newData.enabled,
            showInsights: newData.show_insights,
            showPredictions: newData.show_predictions,
            showPatterns: newData.show_patterns,
            notificationLevel: newData.notification_level,
            disabledAt: newData.disabled_at,
            disabledReason: newData.disabled_reason,
          });
        }
      }

      setLoading(false);
    }

    fetchSettings();
  }, [userId, supabase]);

  // Update settings
  const updateSettings = useCallback(
    async (updates: Partial<CoachHelmUserSettings>): Promise<boolean> => {
      if (!userId) return false;

      setSaving(true);
      setError(null);

      // Map to database columns
      const dbUpdates: Record<string, unknown> = {};
      if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
      if (updates.showInsights !== undefined)
        dbUpdates.show_insights = updates.showInsights;
      if (updates.showPredictions !== undefined)
        dbUpdates.show_predictions = updates.showPredictions;
      if (updates.showPatterns !== undefined)
        dbUpdates.show_patterns = updates.showPatterns;
      if (updates.notificationLevel !== undefined)
        dbUpdates.notification_level = updates.notificationLevel;
      if (updates.disabledAt !== undefined)
        dbUpdates.disabled_at = updates.disabledAt;
      if (updates.disabledReason !== undefined)
        dbUpdates.disabled_reason = updates.disabledReason;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = supabase.from('golf_coachhelm_settings' as any) as any;
      const { data, error: updateError } = await table
        .upsert({
          user_id: userId,
          ...dbUpdates,
        })
        .select()
        .single() as { data: CoachHelmSettingsRow | null; error: Error | null };

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return false;
      }

      if (data) {
        setSettings({
          enabled: data.enabled,
          showInsights: data.show_insights,
          showPredictions: data.show_predictions,
          showPatterns: data.show_patterns,
          notificationLevel: data.notification_level,
          disabledAt: data.disabled_at,
          disabledReason: data.disabled_reason,
        });
      }

      setSaving(false);
      return true;
    },
    [userId, supabase]
  );

  // Enable CoachHelm
  const enable = useCallback(async (): Promise<boolean> => {
    return updateSettings({
      enabled: true,
      disabledAt: null,
      disabledReason: null,
    });
  }, [updateSettings]);

  // Disable CoachHelm
  const disable = useCallback(
    async (reason?: string): Promise<boolean> => {
      return updateSettings({
        enabled: false,
        disabledAt: new Date().toISOString(),
        disabledReason: reason ?? null,
      });
    },
    [updateSettings]
  );

  return {
    settings,
    loading,
    saving,
    error,
    updateSettings,
    enable,
    disable,
  };
}
