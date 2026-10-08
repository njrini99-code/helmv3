'use client';

import { Share } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChBests } from '../../data/stats-figures';
import type { ChViewer } from '../../data/stats-player';
import { formatToPar } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

/**
 * The personal-best card (P005-C2, owner 2026-10-08; sharing per D2-4): a quiet dated card of one best score (the
 * name, the score, the course, the date and the coach who attests it), drawn on a canvas and handed to the share
 * sheet. Minors' rule: no school or team name anywhere on it, and the player is their first name and last initial
 * unless the player is the one sharing it. Nothing is sent or posted: the share sheet is the player's or coach's.
 */
export interface ChBestCard {
  who: string;
  score: number;
  toPar: string | null;
  course: string;
  date: string;
  attest: string | null;
}

/** The card's fields. `name` is the player's full name; a coach's card says "Jonah O.", the player's own says it in full. */
export function bestCardFields(input: {
  viewer: ChViewer;
  name: string;
  bests: ChBests;
  coach: string | null | undefined;
}): ChBestCard | null {
  const s = input.bests.score;
  if (!s) return null;
  const parts = input.name.trim().split(/\s+/);
  const who = input.viewer === 'player' || parts.length < 2 ? input.name.trim() : `${parts[0]} ${parts[parts.length - 1]!.charAt(0)}.`;
  const tp = input.bests.toPar;
  // The best to par is its own round; it rides on this card only when it is the same round.
  const sameRound = tp && tp.course === s.course && tp.date === s.date;
  return {
    who,
    score: s.value,
    toPar: sameRound ? formatToPar(tp.value, 0) : null,
    course: s.course,
    date: s.date,
    attest: input.coach ? `Attested by ${input.coach}` : null,
  };
}

const W = 1080;
const H = 1350;

/** The page's own tokens, read at draw time, so the card is drawn in the Clubhouse's ink and paper (light or night). */
function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const host = document.querySelector('[data-ui="clubhouse"]') ?? document.documentElement;
  return getComputedStyle(host).getPropertyValue(name).trim() || fallback;
}

/** Draws the card. Sentence case, no tracking, no serif: the house type on paper between engraved rules. */
export function drawBestCard(canvas: HTMLCanvasElement, c: ChBestCard): void {
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return;
  const paper = token('--ch-ivory-25', '#fffdf7');
  const ink = token('--ch-ink-900', '#1c1912');
  const soft = token('--ch-text-secondary', '#5c5546');
  const rule = token('--ch-champagne-500', '#b09560');
  const sans = token('--ch-font-sans', 'system-ui, sans-serif');
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  // A double engraved rule inset from the edge, as the Ledger's head.
  g.strokeStyle = rule;
  g.lineWidth = 2;
  g.strokeRect(64, 64, W - 128, H - 128);
  g.lineWidth = 1;
  g.strokeRect(76, 76, W - 152, H - 152);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = soft;
  g.font = `500 40px ${sans}`;
  g.fillText('Personal best', W / 2, 250);
  g.fillStyle = ink;
  g.font = `600 300px ${sans}`;
  g.fillText(String(c.score), W / 2, 640);
  if (c.toPar) {
    g.fillStyle = soft;
    g.font = `500 56px ${sans}`;
    g.fillText(c.toPar, W / 2, 740);
  }
  g.strokeStyle = rule;
  g.beginPath();
  g.moveTo(W / 2 - 120, 820);
  g.lineTo(W / 2 + 120, 820);
  g.stroke();
  g.fillStyle = ink;
  g.font = `600 64px ${sans}`;
  g.fillText(c.who, W / 2, 940);
  g.fillStyle = soft;
  g.font = `400 44px ${sans}`;
  g.fillText(`${c.course} · ${c.date}`, W / 2, 1020);
  if (c.attest) {
    g.font = `400 36px ${sans}`;
    g.fillText(c.attest, W / 2, 1180);
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** "Share" on a personal best: a preview of the card and one Share, which opens the device's share sheet with the image. */
export function BestCardShare({ card }: { card: ChBestCard }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const c = document.createElement('canvas');
    drawBestCard(c, card);
    canvas.current = c;
    setSrc(c.toDataURL('image/png'));
  }, [open, card]);

  const share = async () => {
    haptic('press');
    const c = canvas.current;
    if (!c) return;
    try {
      const blob = await toBlob(c);
      if (!blob) throw new Error('no image');
      const file = new File([blob], `personal-best-${card.score}.png`, { type: 'image/png' });
      if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: `Personal best · ${card.score}` });
      } else {
        // No share sheet (a desktop browser): the image downloads instead.
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      haptic('success');
      setOpen(false);
    } catch (e) {
      // Closing the share sheet is not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      chTrail('stats best card share failed');
      haptic('error');
      toast({ tone: 'error', title: 'Couldn’t share the card', body: 'Try again, or save the image from the preview.', code: 'CH-5005' });
    }
  };

  return (
    <>
      <Button size="sm" leftIcon={Share} onClick={() => setOpen(true)}>
        Share best score
      </Button>
      <Modal
        code="CH-5810"
        open={open}
        onClose={() => setOpen(false)}
        width={420}
        title="Share a personal best"
        description="A dated card of the round. It shows no school or team name."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" leftIcon={Share} onClick={() => void share()} disabled={!src}>
              Share
            </Button>
          </>
        }
      >
        <div className="ch-bestcard">
          {src ? (
            <img src={src} alt={`Personal best card: ${card.score} by ${card.who}, ${card.course}, ${card.date}`} />
          ) : (
            <span className="ch-bestcard__hold" aria-hidden="true" />
          )}
        </div>
      </Modal>
    </>
  );
}
