'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { IconPlus, IconCopy, IconCheck, IconX } from '@/components/icons';
import { invitePlayerToTeam } from '@/app/golf/actions/golf';
import { useToast } from '@/components/ui/toast';

interface InvitePlayerButtonProps {
  teamName: string;
  existingCode: string | null;
}

export function InvitePlayerButton({ teamName, existingCode }: InvitePlayerButtonProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState(existingCode);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Only render portal after mount (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Set invite link on client side only (when we have an existing code)
  useEffect(() => {
    if (existingCode && typeof window !== 'undefined') {
      setInviteCode(existingCode);
      setInviteLink(`${window.location.origin}/golf/join/${existingCode}`);
    }
  }, [existingCode]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await invitePlayerToTeam('');
      if (result.success) {
        setInviteCode(result.data.inviteCode);
        setInviteLink(`${window.location.origin}${result.data.inviteLink}`);
        addToast({ type: 'success', title: 'Invite link generated', description: 'Share this link with players to invite them to your team.' });
        router.refresh();
      } else {
        setError(result.error);
        addToast({ type: 'error', title: 'Failed to generate invite', description: result.error });
      }
    } catch {
      setError('An unexpected error occurred');
      addToast({ type: 'error', title: 'Error', description: 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      addToast({ type: 'success', title: 'Copied to clipboard', description: 'Invite link copied successfully.' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setError(null);
    
    // If we don't have an invite link yet, generate one
    if (!inviteLink) {
      handleGenerate();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
  };

  // Modal content
  const modalContent = (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          maxWidth: '32rem',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-warm-200">
          <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">
            Invite Player to {teamName}
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-warm-600">
            Share this link with players to invite them to your team. They&apos;ll be able to join by clicking the link and creating an account.
          </p>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="ml-3 text-sm text-warm-500">Generating invite link...</span>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <IconX size={12} className="text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-800">Failed to generate invite</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerate}
                  className="mt-3"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {/* Success State - Show Invite Code & Link */}
          {!loading && !error && inviteLink && (
            <>
              <div className="bg-warm-50 rounded-lg p-4 border border-warm-200">
                <p className="text-xs font-medium text-warm-500 mb-2">Invite Code</p>
                <p className="text-2xl font-mono font-medium text-warm-900 tracking-wider select-all">
                  {inviteCode}
                </p>
              </div>

              <div className="bg-warm-50 rounded-lg p-4 border border-warm-200">
                <p className="text-xs font-medium text-warm-500 mb-2">Invite Link</p>
                <div className="text-sm text-warm-700 break-all font-mono select-all bg-white p-2 rounded border border-warm-100">
                  {inviteLink}
                </div>
              </div>

              <Button
                onClick={handleCopy}
                className="w-full gap-2"
                variant={copied ? 'secondary' : 'primary'}
              >
                {copied ? (
                  <>
                    <IconCheck size={18} />
                    Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <IconCopy size={18} />
                    Copy Invite Link
                  </>
                )}
              </Button>

              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                <p className="text-xs font-medium text-primary-800 mb-2">How it works</p>
                <ul className="text-xs text-primary-700 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500">1.</span>
                    Player clicks the link or enters the code at signup
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500">2.</span>
                    They create an account or log in
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500">3.</span>
                    They&apos;re automatically added to your team roster
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-warm-200 flex justify-end">
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Button onClick={handleOpen} className="gap-2">
        <IconPlus size={18} />
        Invite Player
      </Button>

      {/* Use portal to render modal at document body level, escaping any transforms */}
      {isOpen && mounted && createPortal(modalContent, document.body)}
    </>
  );
}
