'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { IconCopy, IconRefresh, IconCheck } from '@/components/icons';

interface InviteSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InviteSettingsModal({ isOpen, onClose }: InviteSettingsModalProps) {
  const { modalRef } = useFocusTrap(isOpen, onClose);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  const generateNewCode = useCallback(async (teamIdParam?: string) => {
    const targetTeamId = teamIdParam || teamId;
    if (!targetTeamId) return;

    setLoading(true);
    const supabase = createClient();

    try {
      // Generate random 8-character code
      const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      const { error } = await supabase
        .from('golf_teams')
        .update({
          join_code: newCode,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetTeamId);

      if (error) throw error;

      setInviteCode(newCode);
      showToast('New invite code generated', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to generate code', 'error');
    } finally {
      setLoading(false);
    }
  }, [teamId, showToast]);

  const loadInviteCode = useCallback(async () => {
    setLoadingData(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get coach's organization_id
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!coach?.organization_id) return;

      // Get team via organization_id
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id, join_code')
        .eq('organization_id', coach.organization_id)
        .single();

      if (!team?.id) return;

      setTeamId(team.id);

      if (team?.join_code) {
        setInviteCode(team.join_code);
      } else {
        // Generate new code if none exists
        await generateNewCode(team.id);
      }
    } catch {
      showToast('Failed to load invite code', 'error');
    } finally {
      setLoadingData(false);
    }
  }, [generateNewCode, showToast]);

  useEffect(() => {
    if (isOpen) {
      loadInviteCode();
    }
  }, [isOpen, loadInviteCode]);

  async function copyInviteLink() {
    const inviteUrl = `${window.location.origin}/golf/join/${inviteCode}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      showToast('Invite link copied to clipboard', 'success');

      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy link', 'error');
    }
  }

  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/golf/join/${inviteCode}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Team Invite Settings">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      {loadingData ? (
        <div className="flex items-center justify-center py-8">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-warm-700 mb-2">Invite Code</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-warm-50 border border-warm-200 rounded-lg font-mono text-lg font-semibold text-warm-900">
                {inviteCode || 'Loading...'}
              </div>
              <Button
                variant="secondary"
                onClick={() => generateNewCode()}
                isLoading={loading}
                className="px-3"
              >
                <IconRefresh size={18} />
              </Button>
            </div>
            <p className="text-xs text-warm-500 mt-2">
              Share this code with players to join your team
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-warm-700 mb-2">Invite Link</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-warm-50 border border-warm-200 rounded-lg text-sm text-warm-600 truncate">
                {inviteUrl}
              </div>
              <Button
                variant="secondary"
                onClick={copyInviteLink}
                className="px-3"
              >
                {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
              </Button>
            </div>
            <p className="text-xs text-warm-500 mt-2">
              Players can click this link to automatically join your team
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">How it works</h4>
            <ul className="text-xs text-blue-700 space-y-1.5 ml-4 list-disc">
              <li>Share the invite code or link with your players</li>
              <li>Players enter the code or click the link to join</li>
              <li>You can generate a new code anytime to revoke old invites</li>
              <li>There is no limit to how many players can use the code</li>
            </ul>
          </div>

          <div className="flex justify-end pt-4 border-t border-warm-200">
            <Button onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
      </div>
    </Modal>
  );
}
