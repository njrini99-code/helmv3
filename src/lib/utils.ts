import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, isToday, isYesterday, differenceInMinutes, differenceInHours, differenceInDays, isSameYear } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ===== NUMBER FORMATTING =====
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  return num.toLocaleString();
}

export function formatCompactNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

// ===== PLURALIZATION =====
export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 0) return `No ${plural || singular + 's'}`;
  if (count === 1) return `1 ${singular}`;
  return `${formatNumber(count)} ${plural || singular + 's'}`;
}

// ===== DATE FORMATTING =====
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  if (isSameYear(d, new Date())) {
    return format(d, 'MMM d');
  }
  return format(d, 'MMM d, yyyy');
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  if (isToday(d)) return `Today at ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Yesterday at ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

// Premium relative time formatting
export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const mins = differenceInMinutes(now, d);
  const hours = differenceInHours(now, d);
  const days = differenceInDays(now, d);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (isSameYear(d, now)) return format(d, 'MMM d');
  return format(d, 'MMM d, yyyy');
}

// For activity feeds - more descriptive
export function formatActivityTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const mins = differenceInMinutes(now, d);
  const hours = differenceInHours(now, d);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (isYesterday(d)) return `Yesterday at ${format(d, 'h:mm a')}`;
  if (isSameYear(d, now)) return format(d, 'MMM d');
  return format(d, 'MMM d, yyyy');
}

export function formatHeight(feet: number | null | undefined, inches: number | null | undefined): string {
  if (!feet) return '—';
  return `${feet}'${inches || 0}"`;
}

export function formatWeight(lbs: number | null | undefined): string {
  return lbs ? `${lbs} lbs` : '—';
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function getFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
}

export function formatPosition(pos: string | null): string {
  if (!pos) return '—';
  const positions: Record<string, string> = {
    RHP: 'Right-Handed Pitcher', LHP: 'Left-Handed Pitcher', C: 'Catcher',
    '1B': 'First Base', '2B': 'Second Base', SS: 'Shortstop', '3B': 'Third Base',
    LF: 'Left Field', CF: 'Center Field', RF: 'Right Field', DH: 'Designated Hitter',
    OF: 'Outfield', IF: 'Infield', UTIL: 'Utility',
  };
  return positions[pos] || pos;
}

export function formatVelocity(velo: number | null, type: 'pitch' | 'exit' = 'pitch'): string {
  if (!velo) return '—';
  return `${velo} mph`;
}

export function formatTime(seconds: number | null): string {
  if (!seconds) return '—';
  return `${seconds.toFixed(2)}s`;
}

export function formatGPA(gpa: number | null): string {
  if (!gpa) return '—';
  return gpa.toFixed(2);
}

export function formatPhoneNumber(phone: string | null): string {
  if (!phone) return '—';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export function getBatsThrowsLabel(bats: string | null, throws: string | null): string {
  const b = bats === 'R' ? 'Right' : bats === 'L' ? 'Left' : bats === 'S' ? 'Switch' : null;
  const t = throws === 'R' ? 'Right' : throws === 'L' ? 'Left' : null;
  if (b && t) return `${b}/${t}`;
  return b || t || '—';
}

export function getGradYearLabel(year: number | null): string {
  if (!year) return '—';
  const currentYear = new Date().getFullYear();
  const diff = year - currentYear;
  if (diff <= 0) return `${year} (Grad)`;
  if (diff === 1) return `${year} (Sr)`;
  if (diff === 2) return `${year} (Jr)`;
  if (diff === 3) return `${year} (So)`;
  if (diff === 4) return `${year} (Fr)`;
  return `${year}`;
}

export function getPipelineStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    watchlist: 'Prospects',
    contacted: 'Contacted',
    high_priority: 'Interested',
    campus_visit: 'Campus Visit',
    offer_extended: 'Offer Extended',
    committed: 'Committed',
    uninterested: 'Not Interested',
  };
  return labels[stage] || stage;
}

export function getPipelineStageColor(stage: string): string {
  const colors: Record<string, string> = {
    watchlist: 'bg-slate-100',
    contacted: 'bg-blue-50',
    high_priority: 'bg-amber-50',
    campus_visit: 'bg-purple-50',
    offer_extended: 'bg-indigo-50',
    committed: 'bg-green-50',
    uninterested: 'bg-gray-50',
  };
  return colors[stage] || 'bg-gray-100';
}

