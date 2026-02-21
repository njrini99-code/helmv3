export default function CalendarLoading() {
  return (
    <div className="h-[calc(100vh-64px)] p-6" style={{
      background: 'linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 33%, #FAF5EB 66%, #F5F0E6 100%)',
    }}>
      <div className="glass-standard rounded-2xl overflow-hidden h-full animate-pulse">
        {/* Calendar header skeleton */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-200" />
            <div className="h-5 w-32 rounded bg-slate-200" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-20 rounded-lg bg-slate-200" />
            <div className="h-9 w-9 rounded-lg bg-slate-200" />
            <div className="h-9 w-9 rounded-lg bg-slate-200" />
          </div>
        </div>

        {/* Calendar grid skeleton */}
        <div className="p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((_day, i) => (
              <div key={i} className="text-center py-2">
                <div className="h-3 w-6 rounded bg-slate-200 mx-auto" />
              </div>
            ))}
          </div>

          {/* Calendar rows */}
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, colIndex) => (
                <div
                  key={colIndex}
                  className="aspect-square rounded-lg p-2"
                >
                  <div className="h-4 w-6 rounded bg-slate-100 mb-1" />
                  {(rowIndex === 1 && colIndex === 2) || (rowIndex === 2 && colIndex === 4) || (rowIndex === 3 && colIndex === 1) ? (
                    <div className="h-3 w-full rounded bg-primary-100 mt-1" />
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
