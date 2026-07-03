'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { IconPlus, IconCopy, IconCheck, IconX, IconRefresh } from '@/components/icons';
import { generateTeamInviteCode, regenerateTeamInviteCode } from '@/app/baseball/actions/teams';
import { useToast } from '@/components/ui/sonner';

interface BaseballInviteButtonProps {
  teamId: string;
  teamName: string;
  existingCode: string | null;
}

export function BaseballInviteButton({
  teamId,
  teamName,
  existingCode,
}: BaseballInviteButtonProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState(existingCode);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (existingCode && typeof window !== 'undefined') {
      setInviteCode(existingCode);
      setInviteLink(`${window.location.origin}/baseball/join/${existingCode}`);
    }
  }, [existingCode]);

  // Close on Escape + lock body scroll while the modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setError(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await generateTeamInviteCode(teamId);
      if (result.success && result.data) {
        setInviteCode(result.data.inviteCode);
        setInviteLink(`${window.location.origin}${result.data.inviteLink}`);
        addToast({
          type: 'success',
          title: 'Invite link generated',
          description: 'Share this link with players to invite them to your team.',
        });
        router.refresh();
      } else {
        setError(result.error || 'Failed to generate invite code');
        addToast({
          type: 'error',
          title: 'Failed to generate invite',
          description: result.error,
        });
      }
    } catch {
      setError('An unexpected error occurred');
      addToast({
        type: 'error',
        title: 'Error',
        description: 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await regenerateTeamInviteCode(teamId);
      if (result.success && result.data) {
        setInviteCode(result.data.inviteCode);
        setInviteLink(`${window.location.origin}${result.data.inviteLink}`);
        addToast({
          type: 'success',
          title: 'New invite code generated',
          description: 'The old code is no longer valid.',
        });
        router.refresh();
      } else {
        setError(result.error || 'Failed to regenerate invite code');
        addToast({
          type: 'error',
          title: 'Failed to regenerate',
          description: result.error,
        });
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      addToast({
        type: 'success',
        title: 'Copied to clipboard',
        description: 'Invite link copied successfully.',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setError(null);

    if (!inviteLink) {
      handleGenerate();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
  };

  const modalContent = (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(28, 25, 23, 0.45)',
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
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- stopPropagation prevents backdrop click from closing dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
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
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-warm-200">
          <h2 id="invite-modal-title" className="text-lg font-semibold text-warm-900">
            Invite Player to {teamName}
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-warm-600">
            Share this link with players to invite them to your team. They&apos;ll
            be able to join by clicking the link and creating an account.
          </p>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
              <div className="animate-spin motion-reduce:animate-none h-6 w-6 border-2 border-primary-600 border-t-transparent rounded-full" />
              <span className="ml-3 text-sm text-warm-500">
                Generating invite link…
              </span>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <IconX size={12} className="text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-800">
                  Failed to generate invite
                </p>
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

          {/* Success State */}
          {!loading && !error && inviteLink && (
            <>
              <div className="bg-warm-50 rounded-lg p-4 border border-warm-200">
                <p className="text-xs font-medium text-warm-500 mb-2">
                  Invite Code
                </p>
                <p className="text-2xl font-mono font-bold text-warm-900 tracking-wider select-all">
                  {inviteCode}
                </p>
              </div>

              <div className="bg-warm-50 rounded-lg p-4 border border-warm-200">
                <p className="text-xs font-medium text-warm-500 mb-2">
                  Invite Link
                </p>
                <div className="text-sm text-warm-700 break-all font-mono select-all bg-cream-50 p-2 rounded border border-warm-100">
                  {inviteLink}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCopy}
                  className="flex-1 gap-2"
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
                <Button
                  onClick={handleRegenerate}
                  variant="secondary"
                  className="gap-2"
                  disabled={loading}
                >
                  <IconRefresh size={18} />
                  New Code
                </Button>
              </div>

              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-primary-800 mb-2">
                  How it works
                </p>
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
        <span className="hidden sm:inline">Invite Player</span>
        <span className="sm:hidden">Invite</span>
      </Button>

      {isOpen && mounted && createPortal(modalContent, document.body)}
    </>
  );
}
