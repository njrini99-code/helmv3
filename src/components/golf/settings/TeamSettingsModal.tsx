'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TeamSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function TeamSettingsModal({ isOpen, onClose, onUpdate }: TeamSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadTeamData();
    }
  }, [isOpen]);

  async function loadTeamData() {
    setLoadingData(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get coach's team
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('team_id')
        .eq('user_id', user.id)
        .single();

      if (!coach?.team_id) return;

      // Get team details
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id, name')
        .eq('id', coach.team_id)
        .single();

      if (team) {
        setTeamId(team.id);
        setTeamName(team.name || '');
      }
    } catch (error) {
      showToast('Failed to load team data', 'error');
    } finally {
      setLoadingData(false);
    }
  }

  async function handleSave() {
    if (!teamId) {
      showToast('No team found', 'error');
      return;
    }

    if (!teamName.trim()) {
      showToast('Team name is required', 'error');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('golf_teams')
        .update({
          name: teamName.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', teamId);

      if (error) throw error;

      showToast('Team settings updated', 'success');
      onUpdate();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update team', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Team Settings">
      {loadingData ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            label="Team Name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="University Golf Team"
            required
          />

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
            <p className="text-xs">
              This name will be visible to all team members and on shared scorecards.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={loading}>
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
