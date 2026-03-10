'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface AlertBadgeProps {
  coachId: string;
  teamId: string;
  className?: string;
}

interface AlertCounts {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

function AlertBadge({ coachId, teamId, className }: AlertBadgeProps) {
  const [counts, setCounts] = useState<AlertCounts>({ critical: 0, warning: 0, info: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      const supabase = createClient();

      // Get undismissed alerts for this coach
      const { data, error } = await supabase
        .from('golf_coach_insights')
        .select('priority')
        .eq('coach_id', coachId)
        .eq('dismissed', false)
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching alert counts:', error);
        setIsLoading(false);
        return;
      }

      const newCounts: AlertCounts = {
        critical: 0,
        warning: 0,
        info: 0,
        total: data?.length || 0,
      };

      (data || []).forEach((insight) => {
        if (insight.priority === 'critical' || insight.priority === 'high') {
          newCounts.critical++;
        } else if (insight.priority === 'medium' || insight.priority === 'warning') {
          newCounts.warning++;
        } else {
          newCounts.info++;
        }
      });

      setCounts(newCounts);
      setIsLoading(false);
    };

    fetchCounts();

    // Set up realtime subscription for live updates
    const supabase = createClient();
    const channel = supabase
      .channel('alert-counts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_coach_insights',
          filter: `coach_id=eq.${coachId}`,
        },
        () => {
          // Refetch on any change
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [coachId, teamId]);

  if (isLoading || counts.total === 0) {
    return null;
  }

  const hasCritical = counts.critical > 0;
  const displayCount = counts.total > 99 ? '99+' : counts.total;

  return (
    <AnimatePresence>
      <motion.span
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        className={cn(
          'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1',
          'text-xs font-bold rounded-full',
          hasCritical
            ? 'bg-red-500 text-white'
            : counts.warning > 0
              ? 'bg-amber-500 text-white'
              : 'bg-warm-200 text-warm-700',
          className
        )}
        role="status"
      >
        {displayCount}
        <span className="sr-only">
          {` unread alert${counts.total !== 1 ? 's' : ''}${hasCritical ? ', including critical' : ''}`}
        </span>
        {hasCritical && (
          <motion.span
            className="absolute inset-0 rounded-full bg-red-400"
            aria-hidden="true"
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.5, 0, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
      </motion.span>
    </AnimatePresence>
  );
}

// Inline badge for nav items (simpler version)
interface NavAlertBadgeProps {
  count: number;
  hasCritical?: boolean;
  className?: string;
}

function NavAlertBadge({ count, hasCritical = false, className }: NavAlertBadgeProps) {
  if (count === 0) return null;

  const displayCount = count > 99 ? '99+' : count;

  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1',
        'text-xs font-bold rounded-full',
        hasCritical
          ? 'bg-red-500 text-white'
          : 'bg-amber-500 text-white',
        className
      )}
      role="status"
    >
      {displayCount}
      <span className="sr-only">
        {` alert${count !== 1 ? 's' : ''}${hasCritical ? ', including critical' : ''}`}
      </span>
      {hasCritical && (
        <motion.span
          className="absolute inset-0 rounded-full bg-red-400"
          aria-hidden="true"
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </span>
  );
}

// Hook for getting alert counts (for use in parent components)
function useAlertCounts(coachId: string, teamId: string) {
  const [counts, setCounts] = useState<AlertCounts>({ critical: 0, warning: 0, info: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('golf_coach_insights')
        .select('priority')
        .eq('coach_id', coachId)
        .eq('dismissed', false)
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching alert counts:', error);
        setIsLoading(false);
        return;
      }

      const newCounts: AlertCounts = {
        critical: 0,
        warning: 0,
        info: 0,
        total: data?.length || 0,
      };

      (data || []).forEach((insight) => {
        if (insight.priority === 'critical' || insight.priority === 'high') {
          newCounts.critical++;
        } else if (insight.priority === 'medium' || insight.priority === 'warning') {
          newCounts.warning++;
        } else {
          newCounts.info++;
        }
      });

      setCounts(newCounts);
      setIsLoading(false);
    };

    fetchCounts();
  }, [coachId, teamId]);

  return { counts, isLoading };
}
