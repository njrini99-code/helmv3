import Link from 'next/link';
import { IconArrowRight, IconLock } from '@/components/icons';
import { LargeTitleHeader } from './LargeTitleHeader';

interface FeatureUnavailableProps {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}

export function FeatureUnavailable({
  title,
  message,
  actionHref = '/golf/dashboard',
  actionLabel = 'Back to Dashboard',
}: FeatureUnavailableProps) {
  return (
    <div className="min-h-full bg-transparent">
      <LargeTitleHeader title={title} subtitle={message} />
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="surface-matte rounded-3xl p-6 md:p-8">
          <div className="w-11 h-11 rounded-2xl bg-primary-50/80 text-primary-700 flex items-center justify-center mb-5">
            <IconLock size={20} />
          </div>
          <h2 className="text-xl md:text-2xl font-medium tracking-[-0.018em] text-warm-900 mb-2">
            {title}
          </h2>
          <p className="text-sm md:text-base leading-relaxed text-warm-500 max-w-xl">
            {message}
          </p>
          <Link
            href={actionHref}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-600/95 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_14px_rgba(22,163,74,0.18)] transition-colors hover:bg-primary-700"
          >
            {actionLabel}
            <IconArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
