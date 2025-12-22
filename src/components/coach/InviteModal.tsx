'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconLink, IconCheck, IconCopy, IconX } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';

interface InviteModalProps {
  teamId: string;
  teamName: string;
  coachId: string;
  onClose: () => void;
}

export function InviteModal({ teamId, teamName, coachId, onClose }: InviteModalProps) {
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number>(30); // days

  async function generateInviteLink() {
    setGenerating(true);

    try {
      const supabase = createClient();

      // Generate a unique code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();

      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresIn);

      // Insert into team_invitations table
      const { error } = await supabase
        .from('team_invitations')
        .insert({
          team_id: teamId,
          invite_code: code,
          created_by: coachId,
          expires_at: expiresAt.toISOString(),
          max_uses: null, // Unlimited uses
          is_active: true,
        });

      if (error) {
        console.error('Error generating invite:', error);
        showToast('Failed to generate invite link', 'error');
      } else {
        setInviteCode(code);
        showToast('Invite link generated successfully', 'success');
      }
    } catch (err) {
      console.error('Error:', err);
      showToast('An error occurred', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard() {
    if (!inviteCode) return;

    const inviteUrl = `${window.location.origin}/join/${inviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                <IconLink size={20} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Invite Players</h2>
                <p className="text-sm leading-relaxed text-slate-500">{teamName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Close invite modal"
            >
              <IconX size={20} />
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {!inviteCode ? (
            <>
              <p className="text-sm leading-relaxed text-slate-600 mb-4">
                Generate a unique invite link that players can use to join your team. You can share this link via email, text, or any messaging platform.
              </p>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Link expires in (days)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(parseInt(e.target.value) || 30)}
                  className="w-full"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Link will expire on {new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={generateInviteLink} loading={generating}>
                  <IconLink size={16} className="mr-2" />
                  Generate Invite Link
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                    <IconCheck size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900 mb-1">Invite link generated!</h3>
                    <p className="text-sm leading-relaxed text-slate-600">
                      Share this link with players to join your team.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Invite Link
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={`${window.location.origin}/join/${inviteCode}`}
                    readOnly
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant={copied ? 'success' : 'secondary'}
                    onClick={copyToClipboard}
                  >
                    {copied ? (
                      <>
                        <IconCheck size={16} className="mr-2" />
                        Copied
                      </>
                    ) : (
                      <>
                        <IconCopy size={16} className="mr-2" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
                <h4 className="font-medium text-slate-900 mb-3 text-sm">How to share:</h4>
                <ol className="space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <span className="font-medium text-slate-700">1.</span>
                    <span>Copy the link above</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium text-slate-700">2.</span>
                    <span>Send it to your players via email, text, or team chat</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium text-slate-700">3.</span>
                    <span>Players will automatically be added when they sign up using the link</span>
                  </li>
                </ol>
              </div>

              <Button onClick={onClose} className="w-full">
                Done
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
