'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { IconPlus, IconCopy, IconCheck } from '@/components/icons';
import { invitePlayerToTeam } from '@/app/golf/actions/golf';

interface InvitePlayerButtonProps {
  teamName: string;
  existingCode: string | null;
}

export function InvitePlayerButton({ teamName, existingCode }: InvitePlayerButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteCode, setInviteCode] = useState(existingCode);
  const [inviteLink, setInviteLink] = useState(
    existingCode ? `${window.location.origin}/golf/join/${existingCode}` : null
  );

  const handleGenerate = async () => {
    setLoading(true);

    try {
      const result = await invitePlayerToTeam('');
      setInviteCode(result.inviteCode);
      setInviteLink(`${window.location.origin}${result.inviteLink}`);
      router.refresh();
    } catch (err) {
      console.error('Failed to generate invite:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    if (!inviteCode) {
      handleGenerate();
    }
  };

  return (
    <>
      <Button onClick={handleOpen} className="gap-2">
        <IconPlus size={18} />
        Invite Player
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Invite Player to {teamName}</h2>
            </div>

            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-slate-600">
                Share this link with players to invite them to your team. They'll be able to join by clicking the link and creating an account.
              </p>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full"></div>
                </div>
              ) : inviteLink ? (
                <>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <p className="text-xs font-medium text-slate-500 mb-2">Invite Code</p>
                    <p className="text-xl font-mono font-bold text-slate-900 tracking-wider">
                      {inviteCode}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <p className="text-xs font-medium text-slate-500 mb-2">Invite Link</p>
                    <p className="text-sm text-slate-600 break-all font-mono">
                      {inviteLink}
                    </p>
                  </div>

                  <Button
                    onClick={handleCopy}
                    className="w-full gap-2"
                    variant={copied ? 'secondary' : 'primary'}
                  >
                    {copied ? (
                      <>
                        <IconCheck size={18} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <IconCopy size={18} />
                        Copy Link
                      </>
                    )}
                  </Button>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-blue-900 mb-1">How it works</p>
                    <ul className="text-xs text-blue-700 space-y-1">
                      <li>• Player clicks the link or enters the code</li>
                      <li>• They create an account or log in</li>
                      <li>• They're automatically added to your team</li>
                    </ul>
                  </div>
                </>
              ) : null}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setIsOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
