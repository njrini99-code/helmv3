/**
 * Shared utility functions for admin dashboard components.
 * Eliminates duplication of timeAgo, formatDate, formatBytes across components.
 */

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return 'Never';
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  // Use deterministic formatting to avoid hydration mismatch from toLocaleDateString
  const d = new Date(dateStr);
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  // Append T00:00:00 for date-only strings to prevent UTC midnight → local timezone shift
  const raw = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '\u2014';
  // Use deterministic formatting to avoid hydration mismatch from toLocaleDateString
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
