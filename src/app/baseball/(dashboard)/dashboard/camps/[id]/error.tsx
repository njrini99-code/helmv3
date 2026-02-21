'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconAlertCircle, IconArrowLeft, IconRefresh } from '@/components/icons';

export default function CampDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <Header title="Error" />
      <div className="p-6 lg:p-8">
        <EmptyState
          icon={<IconAlertCircle size={24} className="text-red-500" />}
          title="Failed to load camp"
          description={error.message || 'Something went wrong while loading the camp details.'}
          action={
            <div className="flex items-center gap-3">
              <Link href="/baseball/dashboard/camps">
                <Button variant="secondary">
                  <IconArrowLeft size={16} className="mr-1.5" />
                  Back to Camps
                </Button>
              </Link>
              <Button onClick={reset}>
                <IconRefresh size={16} className="mr-1.5" />
                Try Again
              </Button>
            </div>
          }
        />
      </div>
    </>
  );
}
