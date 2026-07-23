'use client';

import { useState, useId } from 'react';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconLink, IconCheck, IconCopy } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/sonner';

interface InviteModalProps {
  teamId: string;
  teamName: string;
  coachId: string;
  onClose: () => void;
}

// Built on the shared Fairway <ModalShell> (Radix Dialog under the hood) so
// this gets correct dialog semantics for free — role="dialog", aria-modal,
// aria-labelledby wired to a real Dialog.Title, Escape-to-close, a Tab focus
// trap, and focus restored to the "Invite" trigger on close — instead of the
// old hand-rolled `fixed inset-0` div, which had none of that (#a11y-sweep
// P1). The parent only ever mounts this component while the invite flow is
// open and unmounts it on close, so `open` is always true here; closing
// (Escape / scrim click / the header close button) routes back through
// `onClose` so the parent's unmount still drives visibility.
export function InviteModal({ teamId, teamName, coachId, onClose }: InviteModalProps) {
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number>(30); // days
  const uid = useId();

  async function generateInviteLink() {
    setGenerating(true);

    try {
      const supabase = createClient();

      // Generate a unique code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();

      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresIn);

      // Insert into baseball_team_invitations table
      const { error } = await supabase
        .from('baseball_team_invitations')
        .insert({
          team_id: teamId,
          code: code,
          created_by_coach_id: coachId,
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

    const inviteUrl = `${window.location.origin}/baseball/join/${inviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <ModalShell
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      title="Invite Players"
      hideTitle
      description={`Generate an invite link players can use to join ${teamName}.`}
    >
      {/* Wrapped in a min-h-0/flex-auto/overflow-y-auto scroll region so tall
          content (the post-generate state below) scrolls inside ModalShell's
          fixed max-h panel instead of being clipped by its overflow-hidden —
          `flex-auto` (not `flex-1`) matches ModalShell.Body's own rationale:
          the panel is `h-fit`, and `flex-1`'s 0% basis collapses to ~0px
          height against `h-fit` on iOS Safari. */}
      <div className="flex min-h-0 flex-auto flex-col overflow-y-auto">
        {/* Custom header (icon + title + team name) — the Fairway header is
            hidden above (hideTitle) in favor of this baseball-styled one, while
            ModalShell still renders a visually-hidden Dialog.Title/Description
            so screen readers get the same accessible name + description. */}
        <div className="border-b border-warm-200 px-6 pt-6 pb-4 pr-14">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
              <IconLink size={20} className="text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-warm-900">Invite Players</h2>
              <p className="text-sm leading-relaxed text-warm-500">{teamName}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {!inviteCode ? (
            <>
              <p className="text-sm leading-relaxed text-warm-600 mb-4">
                Generate a unique invite link that players can use to join your team. You can share this link via email, text, or any messaging platform.
              </p>

              <div className="mb-6">
                <label htmlFor={`${uid}-expires`} className="block text-sm font-medium text-warm-700 mb-2">
                  Link expires in (days)
                </label>
                <Input
                  id={`${uid}-expires`}
                  type="number"
                  min="1"
                  max="365"
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(parseInt(e.target.value) || 30)}
                  className="w-full"
                />
                <p className="text-xs text-warm-500 mt-1">
                  Link will expire on {new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={generateInviteLink} isLoading={generating}>
                  <IconLink size={16} className="mr-2" />
                  Generate Invite Link
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                    <IconCheck size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-medium text-warm-900 mb-1">Invite link generated!</h3>
                    <p className="text-sm leading-relaxed text-warm-600">
                      Share this link with players to join your team.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label htmlFor={`${uid}-link`} className="block text-sm font-medium text-warm-700 mb-2">
                  Invite Link
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${uid}-link`}
                    type="text"
                    value={`${window.location.origin}/baseball/join/${inviteCode}`}
                    readOnly
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant={copied ? 'primary' : 'secondary'}
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

              <div className="bg-warm-50 border border-warm-200 rounded-lg p-4 mb-6">
                <h4 className="font-medium text-warm-900 mb-3 text-sm">How to share:</h4>
                <ol className="space-y-2 text-sm text-warm-600">
                  <li className="flex gap-2">
                    <span className="font-medium text-warm-700">1.</span>
                    <span>Copy the link above</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium text-warm-700">2.</span>
                    <span>Send it to your players via email, text, or team chat</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium text-warm-700">3.</span>
                    <span>Players will automatically be added when they sign up using the link</span>
                  </li>
                </ol>
              </div>

              <Button onClick={onClose} className="w-full">
                Done
              </Button>
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
