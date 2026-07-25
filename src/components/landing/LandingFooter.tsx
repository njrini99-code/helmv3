'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { scrollToHash } from './LandingHeader';

/**
 * Dark marketing footer — shared by the landing, About, and Pricing pages.
 */

interface LandingFooterProps {
  onRequestDemo: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function LandingFooter({ onRequestDemo }: LandingFooterProps) {
  const pathname = usePathname();
  const onHome = pathname === '/';

  return (
    <footer className="border-t border-[oklch(1_0_0/0.08)] bg-stone-950 text-text-on-accent">
      <div
        className="mx-auto grid max-w-[1320px] gap-9 px-[clamp(20px,4vw,64px)] py-11"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))' }}
      >
        <div>
          <div className="flex items-center gap-2.5">
            {/* The square mark, not the horizontal lockup. The lockup already
                contains the words "Helm Sports Labs", so squeezing it into
                28x28 beside the same words rendered the wordmark twice — once
                illegibly (audit 2026-07-24, L-07). */}
            <Image
              src="/Helm-Logo-New-Main.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
            <span className="text-body font-semibold text-text-on-accent">Helm Sports Labs</span>
          </div>
          <p className="mt-3.5 max-w-[22em] text-body-sm leading-normal text-[oklch(0.7_0.008_85)]">
            College sports intelligence, built for the people who run programs.
          </p>
        </div>
        <div>
          <div className="font-fw-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[oklch(0.62_0.008_85)]">Products</div>
          <div className="mt-3.5 flex flex-col gap-2.5 text-body-sm">
            <Link
              href="/#golfhelm"
              onClick={onHome ? (e) => scrollToHash(e, '#golfhelm') : undefined}
              className="-my-2 inline-flex min-h-11 items-center py-2 text-[oklch(0.82_0.008_85)] transition-colors hover:text-text-on-accent"
            >
              GolfHelm
            </Link>
            <Link href="/baseball" className="-my-2 inline-flex min-h-11 items-center py-2 text-[oklch(0.82_0.008_85)] transition-colors hover:text-text-on-accent">
              BaseballHelm
            </Link>
          </div>
        </div>
        <div>
          <div className="font-fw-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[oklch(0.62_0.008_85)]">Company</div>
          <div className="mt-3.5 flex flex-col items-start gap-2.5 text-body-sm">
            <Link href="/about" className="-my-2 inline-flex min-h-11 items-center py-2 text-[oklch(0.82_0.008_85)] transition-colors hover:text-text-on-accent">
              About
            </Link>
            <Link href="/pricing" className="-my-2 inline-flex min-h-11 items-center py-2 text-[oklch(0.82_0.008_85)] transition-colors hover:text-text-on-accent">
              Pricing
            </Link>
            <Button
              variant="ghost"
              onClick={onRequestDemo}
              className="h-auto min-h-0 rounded-none p-0 text-[0.8125rem] font-normal text-[oklch(0.82_0.008_85)] hover:bg-transparent hover:text-text-on-accent"
            >
              Request Demo
            </Button>
          </div>
        </div>
        <div>
          <div className="font-fw-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[oklch(0.62_0.008_85)]">Legal</div>
          <div className="mt-3.5 flex flex-col gap-2.5 text-body-sm">
            <Link href="/support" className="-my-2 inline-flex min-h-11 items-center py-2 text-[oklch(0.82_0.008_85)] transition-colors hover:text-text-on-accent">
              Support
            </Link>
            <Link href="/golf/login" className="-my-2 inline-flex min-h-11 items-center py-2 text-[oklch(0.82_0.008_85)] transition-colors hover:text-text-on-accent">
              Log in
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)] pb-10 text-caption font-normal text-[oklch(0.6_0.008_85)]">
        © 2026 Helm Sports Labs. All rights reserved.
      </div>
    </footer>
  );
}
