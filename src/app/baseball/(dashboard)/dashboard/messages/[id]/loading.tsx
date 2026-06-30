import { Skeleton } from '@/components/ui/skeleton';

export default function ConversationLoading() {
  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-warm-200 bg-cream-50">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-36 mb-1.5" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* Message bubbles skeleton */}
      <div className="flex-1 overflow-hidden p-6 space-y-4">
        {/* Incoming */}
        <div className="flex items-end gap-2">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="space-y-1">
            <Skeleton className="h-10 w-56 rounded-2xl rounded-bl-md" />
          </div>
        </div>
        {/* Outgoing */}
        <div className="flex justify-end">
          <Skeleton className="h-10 w-44 rounded-2xl rounded-br-md" />
        </div>
        {/* Incoming */}
        <div className="flex items-end gap-2">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="space-y-1">
            <Skeleton className="h-14 w-72 rounded-2xl rounded-bl-md" />
          </div>
        </div>
        {/* Outgoing */}
        <div className="flex justify-end">
          <Skeleton className="h-10 w-60 rounded-2xl rounded-br-md" />
        </div>
        {/* Incoming */}
        <div className="flex items-end gap-2">
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="space-y-1">
            <Skeleton className="h-10 w-48 rounded-2xl rounded-bl-md" />
          </div>
        </div>
      </div>

      {/* Input area skeleton */}
      <div className="p-4 border-t border-warm-200 bg-cream-50">
        <div className="flex items-center gap-3 max-w-[720px] mx-auto">
          <Skeleton className="flex-1 h-12 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}
