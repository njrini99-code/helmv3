// REDESIGN-SCRATCH (docs/redesign/rounds): kit-built preview of the player Rounds redesign.
//
//   /fairway-preview/redesign-rounds?d=G   Your usual   (default)
//   /fairway-preview/redesign-rounds?d=H   The ledger
//   /fairway-preview/redesign-rounds?d=I   Course book
//
// Each direction renders full page at phone width, on the labeled fixture in ./fixture.ts,
// with the real Fairway components. Nothing here is linked from the app, and the whole folder
// is deleted at ship.
import type { Metadata } from 'next';

import { fairwayScope } from '@/lib/redesign/flag';

import { GYourUsual } from './GYourUsual';
import { PreviewTabs, type Direction } from './PageChrome';

export const metadata: Metadata = {
  title: 'Rounds redesign preview',
  robots: { index: false, follow: false },
};

function parseDirection(raw: string | string[] | undefined): Direction {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toUpperCase();
  return value === 'H' || value === 'I' ? value : 'G';
}

export default async function RedesignRoundsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string | string[] }>;
}) {
  const { d } = await searchParams;
  const direction = parseDirection(d);

  return (
    <div className={fairwayScope('min-h-screen bg-canvas text-text-primary')}>
      <main className="mx-auto flex w-full max-w-[390px] flex-col gap-5 px-4 pb-16 pt-4">
        <PreviewTabs current={direction} />
        {direction === 'G' ? <GYourUsual /> : null}
      </main>
    </div>
  );
}
