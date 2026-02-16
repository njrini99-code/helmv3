import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function Loading() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Skeleton className="h-9 w-20" />
        <div className="flex-1">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Round Summary Card */}
      <Card variant="glass" className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
              <div className="flex items-center gap-6">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex items-center gap-4 mt-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <div className="text-right">
              <Skeleton className="h-14 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-warm-200">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Scorecard */}
      <Card variant="glass">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto overscroll-x-contain touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200">
                  <th className="text-left py-3 px-3">
                    <Skeleton className="h-4 w-12" />
                  </th>
                  <th className="text-center py-3 px-3">
                    <Skeleton className="h-4 w-8 mx-auto" />
                  </th>
                  <th className="text-center py-3 px-3">
                    <Skeleton className="h-4 w-12 mx-auto" />
                  </th>
                  <th className="text-center py-3 px-3">
                    <Skeleton className="h-4 w-8 mx-auto" />
                  </th>
                  <th className="text-center py-3 px-3">
                    <Skeleton className="h-4 w-12 mx-auto" />
                  </th>
                  <th className="text-center py-3 px-3">
                    <Skeleton className="h-4 w-8 mx-auto" />
                  </th>
                  <th className="text-center py-3 px-3">
                    <Skeleton className="h-4 w-8 mx-auto" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <tr key={i} className="border-b border-warm-100">
                    <td className="py-3 px-3">
                      <Skeleton className="h-4 w-4" />
                    </td>
                    <td className="text-center py-3 px-3">
                      <Skeleton className="h-4 w-4 mx-auto" />
                    </td>
                    <td className="text-center py-3 px-3">
                      <Skeleton className="h-4 w-4 mx-auto" />
                    </td>
                    <td className="text-center py-3 px-3">
                      <Skeleton className="h-4 w-6 mx-auto" />
                    </td>
                    <td className="text-center py-3 px-3">
                      <Skeleton className="h-4 w-4 mx-auto" />
                    </td>
                    <td className="text-center py-3 px-3">
                      <Skeleton className="h-4 w-4 mx-auto" />
                    </td>
                    <td className="text-center py-3 px-3">
                      <Skeleton className="h-4 w-4 mx-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
