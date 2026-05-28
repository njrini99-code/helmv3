'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';

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

export function AlertBadge({ coachId, teamId, className }: AlertBadgeProps) {
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
      <Badge
        as={motion.span}
        tone={hasCritical ? 'red' : counts.warning > 0 ? 'amber' : 'warm'}
        appearance={counts.total > 0 && !hasCritical && counts.warning === 0 ? 'soft' : 'solid'}
        size="none"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        // Plain string (not the shared cn): Badge's custom-fontSize-aware merge
        // keeps BOTH the `text-eyebrow` size and the warm-200 fill's text color.
        className={`justify-center min-w-[18px] h-[18px] px-1 gap-0 border-0 text-eyebrow font-medium ${
          // The "no critical / no warning" case keeps its warm-200 fill.
          !hasCritical && counts.warning === 0 ? 'bg-warm-200 text-warm-700' : ''
        } ${className ?? ''}`}
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
      </Badge>
    </AnimatePresence>
  );
}

// Inline badge for nav items (simpler version)
interface NavAlertBadgeProps {
  count: number;
  hasCritical?: boolean;
  className?: string;
}

export function NavAlertBadge({ count, hasCritical = false, className }: NavAlertBadgeProps) {
  if (count === 0) return null;

  const displayCount = count > 99 ? '99+' : count;

  return (
    <Badge
      tone={hasCritical ? 'red' : 'amber'}
      appearance="solid"
      size="none"
      className={cn(
        // Count-badge geometry: fixed 18px circle, no border, centered.
        'relative justify-center min-w-[18px] h-[18px] px-1 gap-0 border-0',
        'text-eyebrow font-medium',
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
    </Badge>
  );
}

// Hook for getting alert counts (for use in parent components)
export function useAlertCounts(coachId: string, teamId: string) {
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
