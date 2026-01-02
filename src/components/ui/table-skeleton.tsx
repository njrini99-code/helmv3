import { cn } from '@/lib/utils';

interface TableSkeletonProps {
  columns: number;
  rows: number;
  selectable?: boolean;
}

export function TableSkeleton({ columns, rows, selectable }: TableSkeletonProps) {
  return (
    <div className="w-full">
      {/* Header Skeleton */}
      <div className="
        flex items-center gap-3
        px-4 py-3
        bg-warm-50/80
        rounded-t-[14px]
      ">
        {selectable && <div className="w-6 h-5 bg-warm-200 rounded animate-pulse" />}
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-4 bg-warm-200 rounded animate-pulse"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>

      {/* Row Skeletons */}
      <div className="flex flex-col gap-2 mt-2">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="
              flex items-center gap-3
              px-4 py-3
              bg-white
              border border-warm-100
              rounded-[14px]
            "
            style={{ animationDelay: `${rowIndex * 100}ms` }}
          >
            {selectable && (
              <div className="w-5 h-5 bg-warm-100 rounded animate-pulse" />
            )}
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div
                key={colIndex}
                className={cn(
                  "h-4 bg-warm-100 rounded animate-pulse",
                  colIndex === 0 ? "w-32" : "flex-1"
                )}
                style={{ animationDelay: `${(rowIndex * columns + colIndex) * 30}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
