'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, type SelectOption } from '@/components/ui/select';
import { ExpenseForm } from './ExpenseForm';
import { ReceiptViewer } from './ReceiptViewer';
import {
  deleteExpense,
  approveExpense,
  rejectExpense,
  markAsReimbursed,
  bulkApproveExpenses,
} from '@/lib/actions/travel/expenses';
import type {
  TravelExpenseWithDetails,
  ExpenseCategory,
  ExpenseStatus,
} from '@/lib/types/travel';

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

// Category icons
const CATEGORY_ICONS: Record<ExpenseCategory, React.ReactNode> = {
  transportation: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  ),
  lodging: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  meals: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.38a48.474 48.474 0 0 0-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12" />
    </svg>
  ),
  entry_fees: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
    </svg>
  ),
  equipment: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
    </svg>
  ),
  other: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    </svg>
  ),
};

// Status badge variants
const STATUS_VARIANTS: Record<ExpenseStatus, 'secondary' | 'success' | 'danger' | 'info'> = {
  pending: 'secondary',
  approved: 'success',
  rejected: 'danger',
  reimbursed: 'info',
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

// Status labels
const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  reimbursed: 'Reimbursed',
};

interface ExpenseListProps {
  expenses: TravelExpenseWithDetails[];
  itineraryId: string;
  teamId: string;
  isCoach?: boolean;
  onRefresh?: () => void;
}

export function ExpenseList({
  expenses,
  itineraryId,
  teamId,
  isCoach = false,
  onRefresh,
}: ExpenseListProps) {
  const [selectedExpense, setSelectedExpense] = useState<TravelExpenseWithDetails | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter expenses
  const filteredExpenses = expenses.filter((expense) => {
    if (filterCategory !== 'all' && expense.category !== filterCategory) return false;
    if (filterStatus !== 'all' && expense.status !== filterStatus) return false;
    return true;
  });

  // Category options for select
  const categoryOptions: SelectOption[] = [
    { value: 'all', label: 'All Categories' },
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
  ];

  // Status options for select
  const statusOptions: SelectOption[] = [
    { value: 'all', label: 'All Status' },
    ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
  ];

  // Handlers
  const handleEdit = (expense: TravelExpenseWithDetails) => {
    setSelectedExpense(expense);
    setEditDialogOpen(true);
    setOpenMenuId(null);
  };

  const handleDelete = async (expense: TravelExpenseWithDetails) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    setIsProcessing(true);
    setOpenMenuId(null);
    const result = await deleteExpense(expense.id);
    setIsProcessing(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    onRefresh?.();
  };

  const handleApprove = async (expense: TravelExpenseWithDetails) => {
    setIsProcessing(true);
    setOpenMenuId(null);
    const result = await approveExpense(expense.id);
    setIsProcessing(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    onRefresh?.();
  };

  const handleReject = async (expense: TravelExpenseWithDetails) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    setIsProcessing(true);
    setOpenMenuId(null);
    const result = await rejectExpense(expense.id, reason);
    setIsProcessing(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    onRefresh?.();
  };

  const handleMarkReimbursed = async (expense: TravelExpenseWithDetails) => {
    setIsProcessing(true);
    setOpenMenuId(null);
    const result = await markAsReimbursed(expense.id);
    setIsProcessing(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    onRefresh?.();
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;

    setIsProcessing(true);
    const result = await bulkApproveExpenses(Array.from(selectedIds));
    setIsProcessing(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    setSelectedIds(new Set());
    onRefresh?.();
  };

  const handleViewReceipt = (url: string) => {
    setReceiptUrl(url);
    setReceiptViewerOpen(true);
    setOpenMenuId(null);
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredExpenses.length && filteredExpenses.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExpenses.map((e) => e.id)));
    }
  };

  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mb-4">
          <svg
            className="w-6 h-6 text-warm-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"
            />
          </svg>
        </div>
        <h3 className="font-medium text-warm-900 mb-1">No expenses yet</h3>
        <p className="text-sm text-warm-500 max-w-sm">
          Start tracking expenses by adding your first one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-[180px]">
            <Select
              options={categoryOptions}
              value={filterCategory}
              onChange={(v) => setFilterCategory(v)}
              placeholder="All Categories"
            />
          </div>

          <div className="w-[150px]">
            <Select
              options={statusOptions}
              value={filterStatus}
              onChange={(v) => setFilterStatus(v)}
              placeholder="All Status"
            />
          </div>
        </div>

        {isCoach && selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-warm-500">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              onClick={handleBulkApprove}
              disabled={isProcessing}
            >
              Approve Selected
            </Button>
          </div>
        )}
      </div>

      {/* Expense Table */}
      <div className="border border-warm-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-warm-50">
            <tr>
              {isCoach && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredExpenses.length && filteredExpenses.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-warm-300"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-warm-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-warm-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-warm-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-warm-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-warm-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-warm-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-100">
            {filteredExpenses.map((expense) => (
              <tr
                key={expense.id}
                className="hover:bg-warm-50 transition-colors"
              >
                {isCoach && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(expense.id)}
                      onChange={() => toggleSelection(expense.id)}
                      className="rounded border-warm-300"
                      disabled={expense.status !== 'pending'}
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm text-warm-900">{expense.description}</span>
                    {expense.per_player && expense.player && (
                      <span className="text-xs text-warm-500">
                        For: {expense.player.profile?.full_name}
                      </span>
                    )}
                    {expense.receipt_url && (
                      <button
                        onClick={() => handleViewReceipt(expense.receipt_url!)}
                        className="text-xs text-primary-600 hover:underline mt-0.5 text-left"
                      >
                        View Receipt
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-warm-400">
                      {CATEGORY_ICONS[expense.category]}
                    </span>
                    <span className="text-sm text-warm-700">{CATEGORY_LABELS[expense.category]}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-medium text-warm-900">
                    {formatCurrency(expense.amount, expense.currency)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={STATUS_VARIANTS[expense.status]}>
                    {STATUS_LABELS[expense.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-warm-500">
                    {formatDate(expense.created_at)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="relative inline-block" ref={openMenuId === expense.id ? menuRef : null}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setOpenMenuId(openMenuId === expense.id ? null : expense.id)}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
                        />
                      </svg>
                    </Button>
                    {openMenuId === expense.id && (
                      <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg border border-warm-200 shadow-lg z-50 py-1">
                        <button
                          onClick={() => handleEdit(expense)}
                          className="w-full px-4 py-2 text-left text-sm text-warm-700 hover:bg-warm-50"
                        >
                          Edit
                        </button>
                        {expense.receipt_url && (
                          <button
                            onClick={() => handleViewReceipt(expense.receipt_url!)}
                            className="w-full px-4 py-2 text-left text-sm text-warm-700 hover:bg-warm-50"
                          >
                            View Receipt
                          </button>
                        )}
                        {isCoach && expense.status === 'pending' && (
                          <>
                            <div className="my-1 border-t border-warm-100" />
                            <button
                              onClick={() => handleApprove(expense)}
                              className="w-full px-4 py-2 text-left text-sm text-warm-700 hover:bg-warm-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(expense)}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-warm-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {isCoach && expense.status === 'approved' && (
                          <button
                            onClick={() => handleMarkReimbursed(expense)}
                            className="w-full px-4 py-2 text-left text-sm text-warm-700 hover:bg-warm-50"
                          >
                            Mark Reimbursed
                          </button>
                        )}
                        <div className="my-1 border-t border-warm-100" />
                        <button
                          onClick={() => handleDelete(expense)}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-warm-50 disabled:opacity-50"
                          disabled={expense.status === 'approved' || expense.status === 'reimbursed'}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-warm-500 pt-2">
        <span>
          Showing {filteredExpenses.length} of {expenses.length} expenses
        </span>
        <span>
          Total: {formatCurrency(filteredExpenses.reduce((sum, e) => sum + e.amount, 0))}
        </span>
      </div>

      {/* Edit Dialog */}
      {selectedExpense && (
        <ExpenseForm
          itineraryId={itineraryId}
          teamId={teamId}
          expense={selectedExpense}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={() => {
            setSelectedExpense(null);
            onRefresh?.();
          }}
        />
      )}

      {/* Receipt Viewer */}
      <ReceiptViewer
        url={receiptUrl}
        open={receiptViewerOpen}
        onOpenChange={setReceiptViewerOpen}
      />
    </div>
  );
}
