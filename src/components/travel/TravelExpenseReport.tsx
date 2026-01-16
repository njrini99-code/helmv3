'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  ExpenseSummary,
  TravelExpenseWithDetails,
  ExpenseCategory,
} from '@/types/travel.types';

// Format currency
const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

// Format date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Category labels
const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  transportation: 'Transportation',
  lodging: 'Lodging',
  meals: 'Meals',
  entry_fees: 'Entry Fees',
  equipment: 'Equipment',
  other: 'Other',
};

interface TravelExpenseReportProps {
  summary: ExpenseSummary;
  expenses: TravelExpenseWithDetails[];
  teamName: string;
}

export function TravelExpenseReport({
  summary,
  expenses,
  teamName,
}: TravelExpenseReportProps) {
  const [filterItinerary, setFilterItinerary] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const reportRef = useRef<HTMLDivElement>(null);

  // Filter expenses based on selections
  const filteredExpenses = expenses.filter((expense) => {
    if (filterItinerary !== 'all' && expense.itinerary_id !== filterItinerary) return false;
    if (filterCategory !== 'all' && expense.category !== filterCategory) return false;
    return true;
  });

  // Calculate filtered totals
  const filteredTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const filteredApproved = filteredExpenses
    .filter((e) => e.status === 'approved' || e.status === 'reimbursed')
    .reduce((sum, e) => sum + e.amount, 0);

  // Get unique itineraries for filter
  const uniqueItineraries = Array.from(
    new Map(
      expenses
        .filter((e) => e.itinerary)
        .map((e) => [e.itinerary_id, e.itinerary!])
    ).values()
  );

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      'Date',
      'Description',
      'Category',
      'Amount',
      'Status',
      'Itinerary',
      'Player',
      'Created By',
    ];

    const rows = filteredExpenses.map((expense) => [
      formatDate(expense.created_at),
      expense.description,
      CATEGORY_LABELS[expense.category],
      expense.amount.toFixed(2),
      expense.status,
      expense.itinerary?.title || '',
      expense.per_player ? expense.player?.profile?.full_name || '' : 'Team',
      expense.creator?.full_name || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `expense-report-${teamName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Print report
  const printReport = () => {
    if (reportRef.current) {
      const printContents = reportRef.current.innerHTML;
      const printWindow = window.open('', '', 'height=600,width=800');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Expense Report - ${teamName}</title>
              <style>
                body { font-family: system-ui, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f5f5f5; }
                .header { margin-bottom: 20px; }
                .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0; }
                .summary-item { padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
                .summary-value { font-size: 24px; font-weight: bold; }
                .summary-label { font-size: 12px; color: #666; }
                @media print {
                  .no-print { display: none; }
                }
              </style>
            </head>
            <body>
              ${printContents}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters and Actions */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Export Report</CardTitle>
          <CardDescription>Filter and export expense data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                defaultValue={summary.date_range.start}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                defaultValue={summary.date_range.end}
              />
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Itinerary</Label>
              <Select value={filterItinerary} onValueChange={setFilterItinerary}>
                <SelectTrigger>
                  <SelectValue placeholder="All itineraries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Itineraries</SelectItem>
                  {uniqueItineraries.map((itinerary) => (
                    <SelectItem key={itinerary.title} value={itinerary.title || 'unknown'}>
                      {itinerary.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2 pt-2">
            <Button onClick={exportToCSV} variant="outline">
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Export CSV
            </Button>
            <Button onClick={printReport} variant="outline">
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"
                />
              </svg>
              Print Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Preview */}
      <div ref={reportRef}>
        <Card>
          <CardHeader>
            <div className="header">
              <CardTitle>Expense Report</CardTitle>
              <CardDescription>
                {teamName} - {formatDate(summary.date_range.start)} to{' '}
                {formatDate(summary.date_range.end)}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <p className="text-2xl font-bold">{formatCurrency(filteredTotal)}</p>
                <p className="text-xs text-muted-foreground">Total Expenses</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-2xl font-bold text-primary">{formatCurrency(filteredApproved)}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-2xl font-bold">{filteredExpenses.length}</p>
                <p className="text-xs text-muted-foreground">Transactions</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-2xl font-bold">{summary.by_itinerary.length}</p>
                <p className="text-xs text-muted-foreground">Itineraries</p>
              </div>
            </div>

            {/* Category breakdown */}
            <div>
              <h3 className="font-semibold mb-3">By Category</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(summary.by_category)
                  .filter(([_, amount]) => amount > 0)
                  .map(([category, amount]) => (
                    <div
                      key={category}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <span className="text-sm">{CATEGORY_LABELS[category as ExpenseCategory]}</span>
                      <span className="font-medium">{formatCurrency(amount)}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Itinerary breakdown */}
            {summary.by_itinerary.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">By Itinerary</h3>
                <div className="space-y-2">
                  {summary.by_itinerary.map((item) => (
                    <div
                      key={item.itinerary_id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <span className="text-sm">{item.itinerary_title}</span>
                      <span className="font-medium">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Player breakdown */}
            {summary.by_player.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">By Player</h3>
                <div className="space-y-2">
                  {summary.by_player.map((item) => (
                    <div
                      key={item.player_id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <span className="text-sm">{item.player_name}</span>
                      <span className="font-medium">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detailed transactions */}
            <div>
              <h3 className="font-semibold mb-3">All Transactions ({filteredExpenses.length})</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Description
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Category
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.id}>
                        <td className="px-4 py-2 text-sm">
                          {formatDate(expense.created_at)}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {expense.description}
                          {expense.per_player && expense.player && (
                            <span className="text-muted-foreground text-xs block">
                              ({expense.player.profile?.full_name})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {CATEGORY_LABELS[expense.category]}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-medium">
                          {formatCurrency(expense.amount)}
                        </td>
                        <td className="px-4 py-2 text-sm text-center capitalize">
                          {expense.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/50">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-sm font-medium">
                        Total
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-bold">
                        {formatCurrency(filteredTotal)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
