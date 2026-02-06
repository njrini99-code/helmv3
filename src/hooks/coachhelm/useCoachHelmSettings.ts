'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

// Database row type for golf_coachhelm_settings (table created in migration)
interface CoachHelmSettingsRow {
  id: string;
  coach_id: string;
  team_id: string | null;
  enabled: boolean | null;
  auto_insights: boolean | null;
  weekly_summary: boolean | null;
  trend_alerts: boolean | null;
  insight_frequency: string | null;
  min_rounds_for_insights: number | null;
  focus_areas: string[] | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CoachHelmUserSettings {
  enabled: boolean;
  showInsights: boolean;
  showPredictions: boolean;
  showPatterns: boolean;
  insightFrequency: string | null;
  minRoundsForInsights: number | null;
  focusAreas: string[];
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
  insightFrequency: null,
  minRoundsForInsights: null,
  focusAreas: [],
  disabledAt: null,
  disabledReason: null,
};

function mapRowToSettings(row: CoachHelmSettingsRow): CoachHelmUserSettings {
  return {
    enabled: row.enabled ?? true,
    showInsights: row.auto_insights ?? true,
    showPredictions: row.weekly_summary ?? true,
    showPatterns: row.trend_alerts ?? true,
    insightFrequency: row.insight_frequency ?? null,
    minRoundsForInsights: row.min_rounds_for_insights ?? null,
    focusAreas: row.focus_areas ?? [],
    disabledAt: null,
    disabledReason: null,
  };
}

/**
 * Hook to manage CoachHelm coach settings
 *
 * @param coachId - The coach's UUID
 */
export function useCoachHelmSettings(
  coachId: string | null
): UseCoachHelmSettingsReturn {
  const [settings, setSettings] = useState<CoachHelmUserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());

  // Fetch settings on mount
  useEffect(() => {
    if (!coachId) {
      setLoading(false);
      return;
    }

    const currentCoachId = coachId;

    async function fetchSettings() {
      setLoading(true);
      setError(null);

      // Use type assertion since table is created via migration
      const { data, error: fetchError } = await (supabaseRef.current
        .from('golf_coachhelm_settings' as 'users') // Type hack for new table
        .select('*')
        .eq('coach_id', currentCoachId)
        .maybeSingle() as unknown as Promise<{ data: CoachHelmSettingsRow | null; error: Error | null }>);

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      if (data) {
        setSettings(mapRowToSettings(data));
      } else {
        // Create default settings if none exist
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = supabaseRef.current.from('golf_coachhelm_settings' as any) as any;
        const { data: newData, error: createError } = await table
          .insert({
            coach_id: currentCoachId,
            enabled: true,
            auto_insights: true,
            weekly_summary: true,
            trend_alerts: true,
          })
          .select()
          .single() as { data: CoachHelmSettingsRow | null; error: Error | null };

        if (createError) {
          // Settings don't exist yet, use defaults
          setSettings(DEFAULT_SETTINGS);
        } else if (newData) {
          setSettings(mapRowToSettings(newData));
        }
      }

      setLoading(false);
    }

    fetchSettings();
  }, [coachId]);

  // Update settings
  const updateSettings = useCallback(
    async (updates: Partial<CoachHelmUserSettings>): Promise<boolean> => {
      if (!coachId) return false;

      setSaving(true);
      setError(null);

      // Map to database columns
      const dbUpdates: Record<string, unknown> = {};
      if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
      if (updates.showInsights !== undefined)
        dbUpdates.auto_insights = updates.showInsights;
      if (updates.showPredictions !== undefined)
        dbUpdates.weekly_summary = updates.showPredictions;
      if (updates.showPatterns !== undefined)
        dbUpdates.trend_alerts = updates.showPatterns;
      if (updates.insightFrequency !== undefined)
        dbUpdates.insight_frequency = updates.insightFrequency;
      if (updates.minRoundsForInsights !== undefined)
        dbUpdates.min_rounds_for_insights = updates.minRoundsForInsights;
      if (updates.focusAreas !== undefined)
        dbUpdates.focus_areas = updates.focusAreas;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = supabaseRef.current.from('golf_coachhelm_settings' as any) as any;
      const { data, error: updateError } = await table
        .upsert({
          coach_id: coachId,
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
        setSettings((prev) => {
          const base = mapRowToSettings(data);
          return {
            ...base,
            disabledAt: updates.disabledAt ?? prev?.disabledAt ?? base.disabledAt,
            disabledReason:
              updates.disabledReason ?? prev?.disabledReason ?? base.disabledReason,
          };
        });
      }

      setSaving(false);
      return true;
    },
    [coachId]
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
