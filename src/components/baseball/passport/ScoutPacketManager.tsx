'use client';

// =============================================================================
// src/components/baseball/passport/ScoutPacketManager.tsx
//
// V5 Scout Packet — the STAFF management island for ONE player's share links.
// This is the ACTION surface: a coach with export rights mints a revocable share
// link for a college coach, copies it, downloads the CSV, previews exactly what
// the scout sees, and revokes or relabels a link when recruiting moves on.
//
// Honest guardrails surfaced inline:
//   * if the passport isn't exposed, minting is blocked with a clear path to fix.
//   * if program scout-export is off, minting is blocked with a clear path.
//   * a revoked/expired link reads as "off", never as live.
//
// Design: cream/green GolfHelm look + design-system primitives (Input, Button).
//   - uses the Input primitive (not raw <input>) for the recipient field
//   - relabel affordance on each link (pencil inline-edit)
//   - framer-motion entrance + LazyMotion for the link list rows
// =============================================================================

import { useState, useTransition } from 'react';
import { LazyMotion, m, AnimatePresence } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { useToast } from '@/components/ui/sonner';
import { InkNotice } from '@/components/baseball/living-annual';
import {
  IconLink,
  IconCopy,
  IconTrash,
  IconPlus,
  IconEye,
  IconExternalLink,
  IconShieldCheck,
  IconCheckCircle2,
  IconPencil,
  IconX,
} from '@/components/icons';
import {
  mintScoutPacketLink,
  revokeScoutPacketLink,
  relabelScoutPacketLink,
} from '@/app/baseball/actions/scout-packet';
import type {
  PassportShareLinkView,
  PassportVisibilityState,
} from '@/lib/types/baseball-passport';

interface Props {
  playerId: string;
  playerName: string;
  visibilityState: PassportVisibilityState;
  exportEnabled: boolean;
  initialLinks: PassportShareLinkView[];
  /** Where staff can preview the packet as a scout would see it. */
  previewHref: string;
}

function expiryLabel(link: PassportShareLinkView): string {
  if (link.status === 'revoked') return 'Revoked';
  if (link.expiresAt) {
    const t = new Date(link.expiresAt).getTime();
    if (t <= Date.now()) return 'Expired';
    return `Expires ${new Date(link.expiresAt).toLocaleDateString('en-US')}`;
  }
  return 'No expiry';
}

// -----------------------------------------------------------------------------
// Inline relabel editor for one link
// -----------------------------------------------------------------------------

function RelabelEditor({
  linkId,
  initial,
  onSaved,
  onCancel,
}: {
  linkId: string;
  initial: string | null;
  onSaved: (id: string, label: string | null) => void;
  onCancel: () => void;
}) {
  const { showToast } = useToast();
  const [value, setValue] = useState(initial ?? '');
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      try {
        await relabelScoutPacketLink({ linkId, recipientLabel: value.trim() || null });
        onSaved(linkId, value.trim() || null);
        showToast('Label updated', 'success');
      } catch {
        showToast('Could not update label', 'error');
      }
    });
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents the row click from closing this inline editor
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Recipient label"
        maxLength={160}
        disabled={pending}
        className="h-7 min-h-0 rounded-md py-0.5 text-xs"
        aria-label="Edit recipient label"
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onCancel();
        }}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- inline editor opens in response to an explicit user action (Rename click); focusing the field it just revealed is the expected behavior
        autoFocus
      />
      <Button
        type="button"
        variant="ghost"
        onClick={save}
        disabled={pending}
        haptic="none"
        className="min-h-0 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 p-0 text-primary-600 hover:bg-primary-100"
        aria-label="Save label"
      >
        <IconCheckCircle2 size={14} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={pending}
        haptic="none"
        className="min-h-0 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg p-0 text-warm-400 hover:bg-warm-100 hover:text-warm-600"
        aria-label="Cancel"
      >
        <IconX size={14} />
      </Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function ScoutPacketManager({
  playerId,
  playerName,
  visibilityState,
  exportEnabled,
  initialLinks,
  previewHref,
}: Props) {
  const { showToast } = useToast();
  const [links, setLinks] = useState<PassportShareLinkView[]>(initialLinks);
  const [recipient, setRecipient] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('30');
  const [pending, startTransition] = useTransition();
  // Track which link id is in relabel-edit mode (one at a time).
  const [editingId, setEditingId] = useState<string | null>(null);

  const exposed =
    visibilityState === 'public_profile' || visibilityState === 'scout_packet';
  const canMint = exposed && exportEnabled;

  const onMint = () => {
    if (!canMint) return;
    startTransition(async () => {
      try {
        const days = parseInt(expiresInDays, 10);
        const link = await mintScoutPacketLink({
          playerId,
          recipientLabel: recipient.trim() || null,
          expiresInDays: Number.isFinite(days) && days > 0 ? days : null,
        });
        setLinks((prev) => [link, ...prev]);
        setRecipient('');
        // Copy the new link immediately — the most common next action.
        try {
          await navigator.clipboard.writeText(link.url);
          showToast('Share link created and copied', 'success');
        } catch {
          showToast('Share link created', 'success');
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Could not create the link', 'error');
      }
    });
  };

  const onCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied', 'success');
    } catch {
      showToast('Could not copy the link', 'error');
    }
  };

  const onRevoke = (id: string) => {
    startTransition(async () => {
      try {
        await revokeScoutPacketLink(id);
        setLinks((prev) =>
          prev.map((l) => (l.id === id ? { ...l, status: 'revoked', isLive: false } : l)),
        );
        showToast('Link revoked', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Could not revoke the link', 'error');
      }
    });
  };

  const onRelabelSaved = (id: string, label: string | null) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, recipientLabel: label } : l)),
    );
    setEditingId(null);
  };

  return (
    <LazyMotion features={loadFeatures} strict>
      <div className="rounded-2xl border border-warm-200 bg-cream-50 p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <IconShieldCheck size={14} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-warm-800">Scout Packet links</h2>
            <p className="text-eyebrow text-warm-400">
              Share {playerName}&rsquo;s packet with college coaches.
            </p>
          </div>
        </div>

        {/* Guardrails */}
        {!exposed && (
          <InkNotice ink="pursuit" role="status" className="mt-4">
            This passport is internal-only. Set it to a public/scout state on the passport before
            sharing.
          </InkNotice>
        )}
        {exposed && !exportEnabled && (
          <InkNotice ink="pursuit" role="status" className="mt-4">
            Scout packet export is off for this program. Enable scout access + export in Settings.
          </InkNotice>
        )}

        {/* Mint */}
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Recipient (e.g. Coach Davis, Texas A&M)"
            disabled={!canMint || pending}
            aria-label="Recipient label for new scout packet link"
            className="h-10 min-h-0 rounded-lg py-1.5"
            onKeyDown={(e) => { if (e.key === 'Enter' && canMint && !pending) onMint(); }}
          />
          {/* Expiry selector — styled to match Input primitive (bg-cream-50/92, warm border, primary ring) */}
          <NativeSelect
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            disabled={!canMint || pending}
            aria-label="Link expiry"
            options={[
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
              { value: '0', label: 'No expiry' },
            ]}
            className="h-10 min-h-0 rounded-xl"
          />
          <Button type="button" onClick={onMint} disabled={!canMint || pending} isLoading={pending}>
            <IconPlus size={15} />
            Create link
          </Button>
        </div>

        {/* Preview affordance */}
        <a
          href={previewHref}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800"
        >
          <IconEye size={14} />
          Preview as a scout
        </a>

        {/* Links list */}
        <div className="mt-5">
          {links.length === 0 ? (
            <p className="rounded-xl border border-dashed border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-500">
              No share links yet. Create one to send this packet to a college coach.
            </p>
          ) : (
            <ul className="divide-y divide-warm-100">
              <AnimatePresence initial={false}>
                {links.map((link) => (
                  <m.li
                    key={link.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-3 py-3"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        link.isLive ? 'bg-primary-50 text-primary-600' : 'bg-warm-100 text-warm-400'
                      }`}
                    >
                      {link.isLive ? <IconCheckCircle2 size={15} /> : <IconLink size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* Relabel inline editor */}
                      {editingId === link.id ? (
                        <RelabelEditor
                          linkId={link.id}
                          initial={link.recipientLabel}
                          onSaved={onRelabelSaved}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-warm-900">
                            {link.recipientLabel ?? 'Unlabeled link'}
                          </p>
                          {link.status !== 'revoked' && (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setEditingId(link.id)}
                              title="Edit recipient label"
                              haptic="none"
                              className="min-h-0 flex h-5 w-5 shrink-0 items-center justify-center rounded p-0 text-warm-300 hover:bg-transparent hover:text-warm-500"
                            >
                              <IconPencil size={12} />
                            </Button>
                          )}
                        </div>
                      )}
                      <p className="text-eyebrow text-warm-400">
                        {expiryLabel(link)} · {link.viewCount} view
                        {link.viewCount === 1 ? '' : 's'}
                        {link.lastViewedAt
                          ? ` · last ${new Date(link.lastViewedAt).toLocaleDateString('en-US')}`
                          : ''}
                      </p>
                    </div>
                    {/* gap-3 (12px), not gap-1: each icon action below keeps
                        its compact 32px (h-8/w-8) visual but reaches the 44px
                        tap-target floor via an invisible `before:` hit-slop
                        (-inset-1.5, mirrors MinimumStandards.tsx). That
                        extends 6px past each element's own edge, so the gap
                        between neighbors has to be >= 12px or the invisible
                        zones overlap and a tap near the middle could fire
                        the wrong action. */}
                    <div className="flex shrink-0 items-center gap-3">
                      {link.isLive && (
                        <>
                          {/* eslint-disable-next-line helm/no-raw-button -- compact 32px icon action; Button's ripple needs overflow-hidden, which clips the hit-slop pseudo-element below (mirrors MinimumStandards.tsx) */}
                          <button
                            type="button"
                            onClick={() => onCopy(link.url)}
                            title="Copy link"
                            className="relative flex h-8 w-8 items-center justify-center rounded-lg p-0 text-warm-500 transition-colors hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 before:absolute before:-inset-1.5 before:content-['']"
                          >
                            <IconCopy size={15} />
                          </button>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open packet"
                            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 before:absolute before:-inset-1.5 before:content-['']"
                          >
                            <IconExternalLink size={15} />
                          </a>
                        </>
                      )}
                      {link.status !== 'revoked' && (
                        // eslint-disable-next-line helm/no-raw-button -- compact 32px icon action; Button's ripple needs overflow-hidden, which clips the hit-slop pseudo-element below (mirrors MinimumStandards.tsx)
                        <button
                          type="button"
                          onClick={() => onRevoke(link.id)}
                          disabled={pending}
                          title="Revoke link"
                          className="relative flex h-8 w-8 items-center justify-center rounded-lg p-0 text-warm-500 transition-colors hover:bg-[var(--notice-error-ink)]/10 hover:text-[color:var(--notice-error-ink)] disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 before:absolute before:-inset-1.5 before:content-['']"
                        >
                          <IconTrash size={15} />
                        </button>
                      )}
                    </div>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </LazyMotion>
  );
}
