'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, LogOut, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/fairway';
import { LabNav } from './LabNav';
import type { HelmLiftingCoachRow } from '@/lib/types/helm-lifting';

interface LabShellProps {
  children: React.ReactNode;
  coachRow: HelmLiftingCoachRow | null;
  /** If true, show a VIEW-ONLY banner at top */
  isViewOnly?: boolean;
}

/**
 * Top-level glass-card shell for the Helm Lifting Lab dashboard.
 *
 * Layout:
 *   – Fixed sidebar (desktop) with LabNav
 *   – Mobile: sliding drawer triggered by hamburger
 *   – View-only banner when isViewOnly=true
 *   – Main content area (cream background)
 */
export function LabShell({ children, coachRow, isViewOnly = false }: LabShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/lifting/login?message=signed_out');
  }

  const displayName = coachRow?.full_name ?? 'Coach';
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <Link
        href="/lifting/dashboard"
        className="flex items-center gap-2.5 px-4 py-5 mb-2"
        onClick={() => setDrawerOpen(false)}
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
          <Image src="/helm-lifting-logo.png" alt="Helm Lifting Lab" width={32} height={32} className="object-contain" priority />
        </div>
        <div>
          <p className="text-sm font-bold text-warm-900 leading-none">Helm</p>
          <p className="text-xs text-primary-600 font-semibold leading-none mt-0.5">Lifting Lab</p>
        </div>
      </Link>

      {/* Navigation — flex-1 so settings link is pushed down */}
      <div
        className="flex-1 px-2 overflow-y-auto"
        onClick={() => setDrawerOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDrawerOpen(false); }}
        role="button"
        tabIndex={0}
      >
        <LabNav />
      </div>

      {/* User strip */}
      <div className="px-2 pb-4 pt-2 border-t border-white/20">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass-standard">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            {coachRow?.avatar_url ? (
              <Image
                src={coachRow.avatar_url}
                alt={displayName}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <span className="text-xs font-bold text-primary-700">{initials || <User className="w-4 h-4" />}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-warm-900 truncate">{displayName}</p>
            {coachRow?.title && (
              <p className="text-xs text-warm-500 truncate">{coachRow.title}</p>
            )}
          </div>
          <Button
            variant="ghost"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-warm-400 hover:text-warm-700 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh flex" style={{ backgroundColor: '#FFFEFA' }}>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 xl:w-60 flex-shrink-0 glass-standard border-r border-white/20 shadow-[2px_0_12px_rgba(0,0,0,0.04)]">
        <SidebarContent />
      </aside>

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <motion.aside
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="fixed inset-y-0 left-0 z-50 w-56 glass-standard border-r border-white/30 shadow-2xl lg:hidden flex flex-col"
              onKeyDown={(e) => { if (e.key === 'Escape') setDrawerOpen(false); }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 glass-standard border-b border-white/20">
          <Button
            variant="ghost"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-warm-600 transition-colors focus-visible:ring-primary-500/50"
          >
            {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center overflow-hidden">
              <Image src="/helm-lifting-logo.png" alt="" width={24} height={24} className="object-contain" priority />
            </div>
            <span className="text-sm font-bold text-warm-900">Lifting Lab</span>
          </div>
        </header>

        {/* View-only banner — neutral InlineNotice, not an amber warning box */}
        {isViewOnly && (
          <div className="px-4 sm:px-6 pt-4">
            <InlineNotice tone="info" title="View-only mode">
              You can see all lifting data but cannot make changes. Invite a lifting coach to enable full editing.
            </InlineNotice>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
