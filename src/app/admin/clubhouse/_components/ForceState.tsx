import { MonitorSmartphone } from 'lucide-react';
import type { PageId } from '@/lib/admin/clubhouse/graph';
import { previewPath, previewServed } from '@/lib/admin/clubhouse/screens';

/**
 * "Force this state" (BR-0208, BR-0508; owner decision D6). It opens the Clubhouse preview app only where that app is
 * served. `/clubhouse-preview/[screen]` calls `notFound()` in production, so there the control is labelled "local"
 * and shows the path to open on a dev server instead of a link that would 404.
 */
export function ForceState({ page, code, state }: { page: PageId; code: string; state?: string }) {
  const path = previewPath(page);
  if (!path) return null;
  const href = state ? `${path}?state=${encodeURIComponent(state)}` : path;
  const className =
    'inline-flex min-h-9 items-center gap-1.5 rounded-fw-sm border border-border-control bg-surface px-3 text-caption font-medium text-text-secondary [@media(pointer:coarse)]:min-h-11';
  if (!previewServed()) {
    return (
      <span
        data-br={code}
        title={`The preview app is not served in production. On a local dev server: ${href}`}
        className={`${className} border-dashed text-text-tertiary`}
      >
        <MonitorSmartphone size={14} aria-hidden />
        Force this state · local
        <span className="sr-only">: open {href} on a local dev server</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-br={code}
      className={`${className} hover:border-border-strong hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500`}
    >
      <MonitorSmartphone size={14} aria-hidden />
      Force this state
      <span className="sr-only"> (opens the preview app in a new tab)</span>
    </a>
  );
}
