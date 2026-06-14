'use client';

import {
  IconClock,
  IconCheckCircle2,
  IconEye,
  IconTarget as MousePointerClick,
  IconXCircle as Ban,
  IconShieldAlert as ShieldAlert,
  IconWarning,
  IconSend,
} from '@/components/icons';

// ---------------------------------------------------------------------------
// Status derivation from email row
// ---------------------------------------------------------------------------
export type EmailStatus =
  | 'pending'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'delayed';

export interface EmailStatusSource {
  sent_at: string | null;
  delivered_at: string | null;
  delivery_delayed_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}

/** Worst-outcome-wins status derivation — mirrors the Resend dashboard. */
export function deriveStatus(e: EmailStatusSource): EmailStatus {
  if (e.complained_at) return 'complained';
  if (e.bounced_at) return 'bounced';
  if (e.clicked_at) return 'clicked';
  if (e.opened_at) return 'opened';
  if (e.delivered_at) return 'delivered';
  if (e.delivery_delayed_at) return 'delayed';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Visual config per status / event type
// ---------------------------------------------------------------------------
export const STATUS_CONFIG: Record<
  EmailStatus,
  { label: string; color: string; bgColor: string; icon: React.ReactNode }
> = {
  pending:    { label: 'Pending',    color: 'text-warm-500',    bgColor: 'bg-warm-100',    icon: <IconClock size={14} /> },
  delayed:    { label: 'Delayed',    color: 'text-amber-600',   bgColor: 'bg-amber-50',    icon: <IconWarning size={14} /> },
  delivered:  { label: 'Delivered',  color: 'text-primary-600', bgColor: 'bg-primary-50',  icon: <IconCheckCircle2 size={14} /> },
  opened:     { label: 'Opened',     color: 'text-blue-600',    bgColor: 'bg-blue-50',     icon: <IconEye size={14} /> },
  clicked:    { label: 'Clicked',    color: 'text-violet-600',  bgColor: 'bg-violet-50',   icon: <MousePointerClick size={14} /> },
  bounced:    { label: 'Bounced',    color: 'text-red-600',     bgColor: 'bg-red-50',      icon: <Ban size={14} /> },
  complained: { label: 'Complained', color: 'text-red-700',     bgColor: 'bg-red-100',     icon: <ShieldAlert size={14} /> },
};

export const EVENT_CONFIG: Record<
  string,
  { label: string; color: string; dotColor: string; icon: React.ReactNode }
> = {
  'email.sent':             { label: 'Sent',      color: 'text-warm-600',   dotColor: 'bg-warm-400',    icon: <IconSend size={12} /> },
  'email.delivered':        { label: 'Delivered', color: 'text-primary-600', dotColor: 'bg-primary-500', icon: <IconCheckCircle2 size={12} /> },
  'email.delivery_delayed': { label: 'Delayed',   color: 'text-amber-600',  dotColor: 'bg-amber-500',   icon: <IconWarning size={12} /> },
  'email.opened':           { label: 'Opened',    color: 'text-blue-600',   dotColor: 'bg-blue-500',    icon: <IconEye size={12} /> },
  'email.clicked':          { label: 'Clicked',   color: 'text-violet-600', dotColor: 'bg-violet-500',  icon: <MousePointerClick size={12} /> },
  'email.bounced':          { label: 'Bounced',   color: 'text-red-600',    dotColor: 'bg-red-500',     icon: <Ban size={12} /> },
  'email.complained':       { label: 'Complained', color: 'text-red-700',   dotColor: 'bg-red-600',     icon: <ShieldAlert size={12} /> },
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'just now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function formatTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatFullTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function formatRate(numerator: number, denominator: number): string {
  if (denominator === 0) return '0.0%';
  return ((numerator / denominator) * 100).toFixed(1) + '%';
}

export function formatCount(n: number): string {
  if (n < 1000) return n.toLocaleString();
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (n < 1000000) return Math.floor(n / 1000) + 'k';
  return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------
export const WINDOW_OPTIONS: { id: '24h' | '7d' | '30d' | 'all'; label: string }[] = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d',  label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
];
