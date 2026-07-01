/**
 * TearSheet — the Scout Packet one-page layout (spec §6 #9, the exportable
 * artifact).
 *
 * A print-perfect tear-sheet on Paper stock: a `<Masthead>` name block with its
 * green accent rule and a pressed `<PacketSeal>`, a `<StatLineStack>` of ruled
 * measurables, a `children` viz slot (a spray/break infographic), and a footer
 * dateline (`ISSUED BY … · JUL ’26`) under a hairline. Screen and PDF are one
 * object, so the layout is print-friendly (borderless / shadowless in print).
 *
 * No hooks / handlers — safe in a server component.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Masthead, PaperCard, HairlineRule, PacketSeal } from '..';
import type { RuledStatLineProps } from '..';
import { StatLineStack } from './StatLineStack';

export interface TearSheetPlayer {
  firstName: string;
  lastName: string;
  /** Small-caps dateline, e.g. `SS · 2027 · TX`. */
  eyebrow?: string;
}

export interface TearSheetProps {
  player: TearSheetPlayer;
  /** Ruled measurables (the passport stat stack). */
  measurables: Array<RuledStatLineProps>;
  /** Footer dateline, e.g. `ISSUED BY RINI UNIVERSITY BASEBALL · JUL ’26`. */
  footer?: string;
  /** Viz slot — a spray chart / break plot infographic. */
  children?: ReactNode;
  className?: string;
}

export function TearSheet({ player, measurables, footer, children, className }: TearSheetProps) {
  return (
    <PaperCard
      registrationTick
      className={cn('mx-auto w-full max-w-2xl px-8 py-10 print:max-w-none print:border-0 print:shadow-none', className)}
    >
      <div className="flex items-start justify-between gap-6">
        <Masthead given={player.firstName} surname={player.lastName} dateline={player.eyebrow} ink="team" accentRule />
        <PacketSeal size="md" className="shrink-0" />
      </div>

      <div className="mt-10">
        <StatLineStack items={measurables} gap="normal" />
      </div>

      {children ? <div className="mt-10">{children}</div> : null}

      {footer ? (
        <div className="mt-10">
          <HairlineRule ink="team" />
          <p className="mt-3 text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">{footer}</p>
        </div>
      ) : null}
    </PaperCard>
  );
}
