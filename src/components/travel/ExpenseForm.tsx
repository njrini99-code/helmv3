'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createExpense, updateExpense } from '@/lib/actions/travel/expenses';
import type {
  TravelExpense,
  CreateExpenseData,
  ExpenseCategory,
  ExpensePaidBy,
} from '@/lib/types/travel';

// Category options
const CATEGORIES: SelectOption[] = [
  { value: 'transportation', label: 'Transportation' },
  { value: 'lodging', label: 'Lodging' },
  { value: 'meals', label: 'Meals' },
  { value: 'entry_fees', label: 'Entry Fees' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

// Paid by options
const PAID_BY_OPTIONS: SelectOption[] = [
  { value: 'team', label: 'Team' },
  { value: 'player', label: 'Player' },
  { value: 'pending_reimbursement', label: 'Pending Reimbursement' },
  { value: 'split', label: 'Split' },
];

interface ExpenseFormProps {
  itineraryId: string;
  teamId: string;
  expense?: TravelExpense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ExpenseForm({
  itineraryId,
  teamId,
  expense,
  open,
  onOpenChange,
  onSuccess,
}: ExpenseFormProps) {
  const isEditing = !!expense;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category || 'other');
  const [description, setDescription] = useState(expense?.description || '');
  const [amount, setAmount] = useState(expense?.amount?.toString() || '');
  const [paidBy, setPaidBy] = useState<ExpensePaidBy>(expense?.paid_by || 'team');
  const [vendorName, setVendorName] = useState(expense?.vendor_name || '');
  const [expenseDate, setExpenseDate] = useState(expense?.expense_date || '');
  const [notes, setNotes] = useState(expense?.notes || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      setIsSubmitting(false);
      return;
    }

    if (!description.trim()) {
      setError('Please enter a description');
      setIsSubmitting(false);
      return;
    }

    try {
      let result;

      if (isEditing && expense) {
        result = await updateExpense(expense.id, {
          category,
          description: description.trim(),
          amount: amountNum,
          paid_by: paidBy,
          vendor_name: vendorName.trim() || undefined,
          expense_date: expenseDate || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        const data: CreateExpenseData = {
          itinerary_id: itineraryId,
          team_id: teamId,
          category,
          description: description.trim(),
          amount: amountNum,
          paid_by: paidBy,
          vendor_name: vendorName.trim() || undefined,
          expense_date: expenseDate || undefined,
          notes: notes.trim() || undefined,
        };
        result = await createExpense(data);
      }

      if (!result.success) {
        setError(result.error || 'Failed to save expense');
        return;
      }

      // Reset form
      setCategory('other');
      setDescription('');
      setAmount('');
      setPaidBy('team');
      setVendorName('');
      setExpenseDate('');
      setNotes('');

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the expense details below.'
              : 'Enter the details of the expense below.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-warm-700">Category</label>
            <Select
              options={CATEGORIES}
              value={category}
              onChange={(v) => setCategory(v as ExpenseCategory)}
              placeholder="Select category"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-warm-700">Description</label>
            <Input
              placeholder="e.g., Hotel for 2 nights"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-warm-700">Amount ($)</label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Paid By */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-warm-700">Paid By</label>
            <Select
              options={PAID_BY_OPTIONS}
              value={paidBy}
              onChange={(v) => setPaidBy(v as ExpensePaidBy)}
              placeholder="Select who paid"
            />
          </div>

          {/* Vendor Name (optional) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-warm-700">Vendor Name (optional)</label>
            <Input
              placeholder="e.g., Hilton Hotels"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
            />
          </div>

          {/* Expense Date (optional) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-warm-700">Expense Date (optional)</label>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>

          {/* Notes (optional) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-warm-700">Notes (optional)</label>
            <Input
              placeholder="Any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Saving...
                </span>
              ) : isEditing ? (
                'Update'
              ) : (
                'Add Expense'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
