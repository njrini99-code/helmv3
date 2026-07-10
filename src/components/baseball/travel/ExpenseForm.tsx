'use client';

// =============================================================================
// ExpenseForm — reskinned onto "The Living Annual" kit (Lane 3 · THE
// PRESSBOX, team ink — sibling of TravelClient which already migrated; this
// nested component was missed in that pass). PRESENTATION ONLY: form state,
// validation, and the `addExpense` server action are unchanged.
//
// Off-palette chrome removed: the category/paid-by chip pickers carried a
// `shadow-sm` drop shadow (spec §4.3: letterpress only, never elevation
// outside an actively-dragged object) plus primary-50/warm-200 chrome — both
// now use the lane-ink (team green) border + tint. The inline validation
// banner moves off bg-red-50/border-red-200 onto the app's one sanctioned
// destructive token (`--color-destructive`, already used elsewhere in this
// migrated surface family, e.g. CampsClient's delete icon).
// =============================================================================

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  addExpense,
  type ExpenseCategory,
  type ExpensePaidBy,
} from '@/app/baseball/actions/travel';

interface ExpenseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  teamId: string;
  itineraryId: string;
}

const CATEGORIES: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: 'transport', label: 'Transport', icon: '🚌' },
  { value: 'lodging', label: 'Lodging', icon: '🏨' },
  { value: 'meals', label: 'Meals', icon: '🍽️' },
  { value: 'equipment', label: 'Equipment', icon: '⚾' },
  { value: 'other', label: 'Other', icon: '📦' },
];

const PAID_BY_OPTIONS: { value: ExpensePaidBy; label: string }[] = [
  { value: 'team', label: 'Team' },
  { value: 'player', label: 'Player' },
  { value: 'pending_reimbursement', label: 'Pending Reimbursement' },
  { value: 'split', label: 'Split' },
];

export function ExpenseForm({
  isOpen,
  onClose,
  onSaved,
  teamId,
  itineraryId,
}: ExpenseFormProps) {
  const prefersReducedMotion = useReducedMotion();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0] || '');
  const [paidBy, setPaidBy] = useState<ExpensePaidBy>('team');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setCategory('other');
    setDescription('');
    setAmount('');
    setVendorName('');
    setExpenseDate(new Date().toISOString().split('T')[0] || '');
    setPaidBy('team');
    setNotes('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);

    try {
      const result = await addExpense(itineraryId, teamId, {
        category,
        amount: parsedAmount,
        description: description.trim() || undefined,
        paid_by: paidBy,
        expense_date: expenseDate || undefined,
        vendor_name: vendorName.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (!result.success) {
        setError(result.error || 'Failed to add expense');
        return;
      }

      onSaved();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Expense</DrawerTitle>
        </DrawerHeader>
      <form
        onSubmit={handleSubmit}
        className="space-y-5 px-6 pb-6 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        {error && (
          <motion.div
            initial={prefersReducedMotion ? false : ({ opacity: 0, y: -10 })}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-fw-md border border-destructive/30 bg-destructive/10 p-3 font-annual text-body-sm text-destructive"
          >
            {error}
          </motion.div>
        )}

        {/* Category Selection */}
        <div>
          <p className="mb-2 block font-annual text-body-sm font-medium text-text-secondary">Category</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {CATEGORIES.map((cat) => (
              <motion.button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                whileHover={prefersReducedMotion ? undefined : ({ scale: 1.02 })}
                whileTap={prefersReducedMotion ? undefined : ({ scale: 0.98 })}
                className={cn(
                  'rounded-fw-md border p-3 text-center transition-colors',
                  category === cat.value
                    ? 'border-grade-plus bg-grade-plus/[0.08]'
                    : 'border-[color:var(--hairline)] hover:border-grade-plus/40',
                )}
              >
                <span className="text-xl block mb-1">{cat.icon}</span>
                <span className="font-annual text-xs font-medium text-text-primary">{cat.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Description and Amount */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Hotel stay, bus fuel..."
          />
          <Input
            label="Amount ($)"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        {/* Vendor and Date */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Vendor (Optional)"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="Marriott, Greyhound..."
          />
          <Input
            label="Expense Date"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
        </div>

        {/* Paid By */}
        <div>
          <p className="mb-2 block font-annual text-body-sm font-medium text-text-secondary">Paid By</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PAID_BY_OPTIONS.map((option) => (
              <motion.button
                key={option.value}
                type="button"
                onClick={() => setPaidBy(option.value)}
                whileHover={prefersReducedMotion ? undefined : ({ scale: 1.02 })}
                whileTap={prefersReducedMotion ? undefined : ({ scale: 0.98 })}
                className={cn(
                  'rounded-fw-md border px-3 py-2 text-center font-annual text-sm font-medium transition-colors',
                  paidBy === option.value
                    ? 'border-grade-plus bg-grade-plus/[0.08] text-grade-plus'
                    : 'border-[color:var(--hairline)] text-text-secondary hover:border-grade-plus/40',
                )}
              >
                {option.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="ef-notes" className="text-sm font-medium text-warm-700 block mb-1">Notes (Optional)</label>
          <Textarea
            id="ef-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details..."
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-[color:var(--hairline)] pt-4">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={loading}>
            Add Expense
          </Button>
        </div>
      </form>
      </DrawerContent>
    </Drawer>
  );
}
