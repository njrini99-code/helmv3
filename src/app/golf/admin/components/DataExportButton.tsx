'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  data: Record<string, unknown>[];
  filename: string;
  label?: string;
}

export function DataExportButton({ data, filename, label = 'Export CSV' }: Props) {
  const handleExport = useCallback(() => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]!);
    const csvRows = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            const str = val == null ? '' : String(val);
            // Escape quotes and wrap in quotes if needed
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      ),
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data, filename]);

  return (
    <Button variant="ghost"
      onClick={handleExport}
      disabled={data.length === 0}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg glass-standard text-warm-600 hover:bg-cream-100 hover:text-warm-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {label}
    </Button>
  );
}
