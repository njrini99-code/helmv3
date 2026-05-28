'use client';

import { useEffect, useState } from 'react';
import { m } from 'framer-motion';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import {
  IconBell,
  IconCalendar,
  IconMessageSquare,
  IconCheck,
} from '@/components/icons';
import {
  shouldShowPushSoftAsk,
  requestPushPermission,
  setPushSoftAskState,
} from '@/lib/utils/push-registration';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { useToast } from '@/components/ui/sonner';

/**
 * iOS-native "soft ask" before the system push permission prompt.
 *
 * Apple HIG: ask for permission in context, after the user has seen the
 * app and understands its value — NEVER on cold launch. Once the system
 * prompt is shown the user gets ONE chance to answer, so we front this
 * with our own Drawer explaining why notifications help them.
 *
 * This component mounts invisibly, checks native state + localStorage,
 * and shows the sheet exactly once until the user decides.
 */
export function PushPermissionSoftAsk() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    // Delay ~2s so it doesn't fight with the initial dashboard paint —
    // the user should see the app first, per HIG.
    const timeoutId = window.setTimeout(async () => {
      const show = await shouldShowPushSoftAsk();
      if (!cancelled && show) setOpen(true);
    }, 2000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  async function handleEnable() {
    setSubmitting(true);
    await triggerHaptic('light');
    const result = await requestPushPermission();
    setSubmitting(false);
    setOpen(false);
    if (result === 'granted') {
      await triggerHaptic('success');
      showToast('Notifications enabled', 'success');
    }
    // If denied, stay quiet — no nag. User can re-enable in Settings.
  }

  function handleDismiss() {
    void triggerHaptic('light');
    setPushSoftAskState('dismissed');
    setOpen(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDismiss();
      }}
    >
      <DrawerContent>
      <div
        className="flex flex-col items-center text-center pt-2 pb-6 px-6 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        {/* Hero icon */}
        <m.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30 mb-5"
        >
          <IconBell size={28} className="text-white" />
        </m.div>

        <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em] tracking-tight">
          Stay in the loop
        </h2>
        <p className="text-sm text-warm-500 mt-1.5 max-w-sm">
          Turn on notifications so you never miss what matters from your team.
        </p>

        {/* Value props */}
        <ul className="w-full max-w-sm mt-5 space-y-3 text-left">
          <SoftAskBullet
            icon={<IconCalendar size={16} className="text-primary-600" />}
            title="Events & schedule changes"
            description="Know the moment practice, tee times, or travel updates."
          />
          <SoftAskBullet
            icon={<IconMessageSquare size={16} className="text-primary-600" />}
            title="Messages from coaches"
            description="Get pinged when your coach reaches out directly."
          />
          <SoftAskBullet
            icon={<IconCheck size={16} className="text-primary-600" />}
            title="Task reminders"
            description="Gentle nudges for qualifiers, reviews, and assignments."
          />
        </ul>

        {/* Actions */}
        <div className="w-full max-w-sm mt-6 space-y-2">
          <Button
            variant="primary"
            className="w-full"
            onClick={handleEnable}
            isLoading={submitting}
          >
            Enable Notifications
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full text-sm text-warm-500 hover:text-warm-700 py-2.5 font-medium transition-colors"
          >
            Not now
          </button>
        </div>

        <p className="text-eyebrow text-warm-600 mt-2 max-w-xs leading-relaxed">
          You can change this anytime in Settings.
        </p>
      </div>
      </DrawerContent>
    </Drawer>
  );
}

function SoftAskBullet({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-warm-900">{title}</p>
        <p className="text-xs text-warm-500 leading-snug">{description}</p>
      </div>
    </li>
  );
}
