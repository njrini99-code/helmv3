'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconUpload, IconX } from '@/components/icons';
import {
  createTravelExpense,
  updateTravelExpense,
  type ExpenseCategory,
  type ExpensePaidBy,
  type TravelExpense,
  type CreateExpenseInput,
} from '@/app/golf/actions/travel';

interface ExpenseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  teamId: string;
  itineraryId?: string | null;
  expense?: TravelExpense | null;
}

const CATEGORIES: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: 'lodging', label: 'Lodging', icon: '🏨' },
  { value: 'transportation', label: 'Transportation', icon: '🚗' },
  { value: 'meals', label: 'Meals', icon: '🍽️' },
  { value: 'entry_fees', label: 'Entry Fees', icon: '🎟️' },
  { value: 'equipment', label: 'Equipment', icon: '⛳' },
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
  expense,
}: ExpenseFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [paidBy, setPaidBy] = useState<ExpensePaidBy>('team');
  const [notes, setNotes] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Reset form when expense changes
  useEffect(() => {
    if (expense) {
      setCategory(expense.category);
      setDescription(expense.description);
      setAmount(expense.amount.toString());
      setVendorName(expense.vendor_name || '');
      setExpenseDate(expense.expense_date || '');
      setPaidBy(expense.paid_by);
      setNotes(expense.notes || '');
      setReceiptUrl(expense.receipt_url);
    } else {
      resetForm();
    }
  }, [expense]);

  function resetForm() {
    setCategory('other');
    setDescription('');
    setAmount('');
    setVendorName('');
    setExpenseDate(new Date().toISOString().split('T')[0] || '');
    setPaidBy('team');
    setNotes('');
    setReceiptUrl(null);
    setReceiptFile(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);

    try {
      // Handle receipt upload if there's a new file
      const finalReceiptUrl = receiptUrl;
      if (receiptFile) {
        // For now, we'll handle receipt upload in a separate flow
        // In production, you'd upload to Supabase Storage here
        console.log('Receipt file selected:', receiptFile.name);
      }

      if (expense) {
        // Update existing expense
        const result = await updateTravelExpense({
          id: expense.id,
          category,
          description: description.trim(),
          amount: parsedAmount,
          vendor_name: vendorName.trim() || null,
          expense_date: expenseDate || null,
          paid_by: paidBy,
          notes: notes.trim() || null,
          receipt_url: finalReceiptUrl,
        });

        if (!result.success) {
          setError(result.error || 'Failed to update expense');
          return;
        }
      } else {
        // Create new expense
        const input: CreateExpenseInput = {
          team_id: teamId,
          itinerary_id: itineraryId || null,
          category,
          description: description.trim(),
          amount: parsedAmount,
          vendor_name: vendorName.trim() || null,
          expense_date: expenseDate || null,
          paid_by: paidBy,
          notes: notes.trim() || null,
          receipt_url: finalReceiptUrl,
        };

        const result = await createTravelExpense(input);

        if (!result.success) {
          setError(result.error || 'Failed to create expense');
          return;
        }
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        setError('Please upload an image (JPG, PNG, WebP) or PDF');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      setReceiptFile(file);
      setError(null);
    }
  }

  function removeReceipt() {
    setReceiptFile(null);
    setReceiptUrl(null);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={expense ? 'Edit Expense' : 'Add Expense'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600"
          >
            {error}
          </motion.div>
        )}

        {/* Category Selection */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-2">Category</label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((cat) => (
              <motion.button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  category === cat.value
                    ? 'border-green-600 bg-green-50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <span className="text-xl block mb-1">{cat.icon}</span>
                <span className="text-sm font-medium text-slate-900">{cat.label}</span>
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
            placeholder="Hotel stay, flight tickets..."
            required
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
            label="Vendor Name (Optional)"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="Marriott, Delta Airlines..."
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
          <label className="text-sm font-medium text-slate-700 block mb-2">Paid By</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PAID_BY_OPTIONS.map((option) => (
              <motion.button
                key={option.value}
                type="button"
                onClick={() => setPaidBy(option.value)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                  paidBy === option.value
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {option.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Receipt Upload */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-2">Receipt (Optional)</label>
          <AnimatePresence mode="wait">
            {receiptFile || receiptUrl ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
              >
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <span className="text-lg">📎</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {receiptFile?.name || 'Receipt attached'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {receiptFile ? `${(receiptFile.size / 1024).toFixed(1)} KB` : 'Uploaded'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={removeReceipt}
                  className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <IconX size={16} className="text-slate-500" />
                </button>
              </motion.div>
            ) : (
              <motion.label
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl hover:border-green-300 hover:bg-green-50/50 transition-all cursor-pointer"
              >
                <IconUpload size={24} className="text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-600">Click to upload receipt</span>
                <span className="text-xs text-slate-400 mt-1">JPG, PNG, WebP or PDF (max 5MB)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </motion.label>
            )}
          </AnimatePresence>
        </div>

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Notes (Optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details about this expense..."
            rows={2}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-slate-900 placeholder:text-slate-400 transition-colors resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={loading}>
            {expense ? 'Save Changes' : 'Add Expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
