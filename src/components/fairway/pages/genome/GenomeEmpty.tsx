/**
 * The honest empty Genome: a player with no scored rounds on file. One action.
 * Server-safe.
 */

import Link from 'next/link';
import { fwPress } from '@/components/fairway/controls';

export function GenomeEmpty({
  playerId,
  playerName,
  firstName,
}: {
  playerId: string;
  playerName: string;
  firstName: string;
}) {
  return (
    <div data-slot="genome-page" className="mx-auto flex w-full max-w-[1120px] flex-col px-4 pb-16 pt-4 md:px-8 md:pt-8">
      <h1 className="font-fw-display text-h1 text-text-primary md:text-display">{playerName}</h1>
      <p className="mt-1 font-fw-sans text-caption text-text-tertiary">No rounds on file</p>

      <section
        aria-labelledby="genome-empty-title"
        data-slot="genome-strand"
        className="mt-8 rounded-card border border-border-subtle bg-surface px-4 py-6 md:mt-10 md:px-6"
      >
        {/* A ghost strand: the rungs a genome will fill, with nothing on them. */}
        <div aria-hidden className="relative flex h-24 w-full gap-1.5">
          <span className="absolute inset-x-0 top-1/2 h-px bg-border-subtle" />
          {Array.from({ length: 19 }, (_, i) => (
            <span key={`rung-${i}`} className="relative flex-1">
              <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border-subtle" />
            </span>
          ))}
        </div>
        <h2 id="genome-empty-title" className="mt-6 font-fw-sans text-h3 text-text-primary">
          {firstName}&rsquo;s genome starts with a logged round
        </h2>
        <p className="mt-1 max-w-[52ch] font-fw-sans text-body text-text-secondary">
          Each skill fills in against the team and Tour once {firstName} has five scored rounds on file.
          Nothing here is estimated until then.
        </p>
        <Link
          href={`/golf/dashboard/messages?player=${playerId}`}
          className={`mt-5 inline-flex h-11 items-center justify-center rounded-fw-md bg-accent-fill px-5 font-fw-sans text-body font-semibold text-text-on-accent-fill transition-[background-color,transform] duration-150 active:bg-accent-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 ${fwPress}`}
        >
          Message {firstName}
        </Link>
      </section>
    </div>
  );
}
