'use client';

/**
 * ============================================================================
 * Fairway · Travel · FairwayExpenseForm — coach add / edit travel expense
 * ----------------------------------------------------------------------------
 * P317 — the Fairway re-skin of the legacy ExpenseForm. Both coach editors on
 * the /travel surface now share ONE overlay paradigm (the centered Fairway
 * ModalShell) and ONE token set, killing the Nielsen-#4 inconsistency where the
 * itinerary editor used ModalShell while the expense editor used the legacy vaul
 * Drawer.
 *
 * ALL write logic is preserved VERBATIM from the legacy ExpenseForm:
 *   • Server actions  — createTravelExpense / updateTravelExpense /
 *                       uploadExpenseReceipt (exact import paths, unchanged).
 *   • Validation      — description required + amount > 0 (identical rules).
 *   • Receipt upload  — upload-first-then-persist (the only receipt_url write
 *                       path), with the same file-type + 5MB size checks.
 *   • Category / paid-by sets — identical (the deferred 'split' option stays out).
 *
 * Presentation only: Fairway ModalShell + Fairway tokens + Fairway Input /
 * Select / TextArea controls; InlineNotice for errors; fairwayToast on success.
 * Coach-only (mounted only on the coach path by FairwayTravel).
 * ========================================================================== */

import * as React from 'react';

import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button, InlineNotice, fairwayToast } from '@/components/fairway';
import { IconButton } from '@/components/fairway/controls/button';
import { Input, Select, TextArea } from '@/components/fairway/forms';
import {
  IconUpload,
  IconX,
  IconHome,
  IconAirplane,
  IconClipboardList,
  IconAward,
  IconFlag,
  IconLayers,
  IconPaperclip,
} from '@/components/icons';
import type { ComponentType, SVGAttributes } from 'react';
import {
  createTravelExpense,
  updateTravelExpense,
  uploadExpenseReceipt,
  type ExpenseCategory,
  type ExpensePaidBy,
  type TravelExpense,
  type CreateExpenseInput,
} from '@/app/golf/actions/travel';

type ExpenseIcon = ComponentType<SVGAttributes<SVGElement> & { size?: number }>;

/* ── shared field recipes (matches FairwayItineraryModal) ─────────────────── */
const fieldCls =
  'w-full rounded-fw-md border border-border-subtle bg-surface-sunken px-3 py-2 font-fw-sans text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent-500 focus:bg-surface focus:ring-2 focus:ring-accent-500/25 disabled:opacity-50';
const labelCls = 'mb-1.5 block font-fw-sans text-caption font-medium text-text-secondary';
const sectionLabelCls = 'mb-2 block font-fw-sans text-caption font-medium text-text-secondary';

/* ── category + paid-by sets (IDENTICAL to the legacy ExpenseForm) ────────── */
const CATEGORIES: { value: ExpenseCategory; label: string; icon: ExpenseIcon }[] = [
  { value: 'lodging', label: 'Lodging', icon: IconHome },
  { value: 'transportation', label: 'Transportation', icon: IconAirplane },
  { value: 'meals', label: 'Meals', icon: IconClipboardList },
  { value: 'entry_fees', label: 'Entry Fees', icon: IconAward },
  { value: 'equipment', label: 'Equipment', icon: IconFlag },
  { value: 'other', label: 'Other', icon: IconLayers },
];

// The deferred 'split' paid-by option stays out (no CRUD/calc exists yet); the
// type still accepts 'split' so any legacy rows render correctly.
const PAID_BY_OPTIONS: { value: ExpensePaidBy; label: string }[] = [
  { value: 'team', label: 'Team' },
  { value: 'player', label: 'Player' },
  { value: 'pending_reimbursement', label: 'Pending Reimbursement' },
];

export interface FairwayExpenseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  teamId: string;
  itineraryId?: string | null;
  expense?: TravelExpense | null;
}

export function FairwayExpenseForm({
  isOpen,
  onClose,
  onSaved,
  teamId,
  itineraryId,
  expense,
}: FairwayExpenseFormProps) {
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [category, setCategory] = React.useState<ExpenseCategory>('other');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [vendorName, setVendorName] = React.useState('');
  const [expenseDate, setExpenseDate] = React.useState('');
  const [paidBy, setPaidBy] = React.useState<ExpensePaidBy>('team');
  const [notes, setNotes] = React.useState('');
  const [receiptUrl, setReceiptUrl] = React.useState<string | null>(null);
  const [receiptFile, setReceiptFile] = React.useState<File | null>(null);

  const resetForm = React.useCallback(() => {
    setCategory('other');
    setDescription('');
    setAmount('');
    setExpenseDate(new Date().toISOString().split('T')[0] || '');
    setPaidBy('team');
    setNotes('');
    setReceiptUrl(null);
    setReceiptFile(null);
    setError(null);
  }, []);

  // Reset / prefill when the editing target changes (verbatim contract).
  React.useEffect(() => {
    if (expense) {
      setCategory(expense.category);
      setDescription(expense.description);
      setAmount(expense.amount.toString());
      setVendorName(expense.vendor_name || '');
      setExpenseDate(expense.expense_date || '');
      setPaidBy(expense.paid_by);
      setNotes(expense.notes || '');
      setReceiptUrl(expense.receipt_url);
      setReceiptFile(null);
      setError(null);
    } else {
      setVendorName('');
      resetForm();
    }
  }, [expense, resetForm]);

  async function handleSubmit() {
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
      // Upload the receipt first so its URL is persisted with the expense — the
      // only write path for receipt_url (without it the file is silently lost).
      let finalReceiptUrl = receiptUrl;
      if (receiptFile) {
        setUploading(true);
        const uploadResult = await uploadExpenseReceipt(receiptFile, teamId, expense?.id);
        setUploading(false);
        if (!uploadResult.success || !uploadResult.url) {
          setError(uploadResult.error || 'Failed to upload receipt');
          return;
        }
        finalReceiptUrl = uploadResult.url;
      }

      if (expense) {
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

      fairwayToast.success(expense ? 'Expense updated.' : 'Expense added.');
      onSaved();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        setError('Please upload an image (JPG, PNG, WebP) or PDF');
        return;
      }
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

  const busy = loading || uploading;

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      size="lg"
      title={expense ? 'Edit expense' : 'Add expense'}
      description={
        expense
          ? 'Update this travel expense and its receipt.'
          : 'Log a travel expense so the team budget stays in sync.'
      }
      data-slot="expense-editor"
    >
      <ModalShell.Body className="flex min-h-0 flex-col gap-5">
        {error ? (
          <InlineNotice tone="danger" title="Couldn't save the expense">
            {error}
          </InlineNotice>
        ) : null}

        {/* Category */}
        <div>
          <p className={sectionLabelCls}>Category</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {CATEGORIES.map((cat) => {
              const CatIcon = cat.icon;
              const selected = category === cat.value;
              return (
                // eslint-disable-next-line helm/no-raw-button -- selectable category card tile (icon + label, aria-pressed); not a pill CTA the Fairway Button can host
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  disabled={busy}
                  aria-pressed={selected}
                  className={cn(
                    'rounded-fw-md border p-3 text-left transition-colors disabled:opacity-50',
                    'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                    selected
                      ? 'border-accent-500 bg-accent-50'
                      : 'border-border-subtle hover:border-border-strong hover:bg-surface-sunken',
                  )}
                >
                  <CatIcon
                    size={20}
                    className={cn(
                      'mb-1 block',
                      selected ? 'text-accent-700' : 'text-text-tertiary',
                    )}
                  />
                  <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                    {cat.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Description + amount */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="expense-description" className={labelCls}>
              Description
            </label>
            <Input
              id="expense-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              placeholder="Hotel stay, flight tickets…"
              className={fieldCls}
              required
            />
          </div>
          <div>
            <label htmlFor="expense-amount" className={labelCls}>
              Amount ($)
            </label>
            <Input
              id="expense-amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              placeholder="0.00"
              className={fieldCls}
              required
            />
          </div>
        </div>

        {/* Vendor + date */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="expense-vendor" className={labelCls}>
              Vendor name (optional)
            </label>
            <Input
              id="expense-vendor"
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              disabled={busy}
              placeholder="Marriott, Delta Airlines…"
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="expense-date" className={labelCls}>
              Expense date
            </label>
            <Input
              id="expense-date"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              disabled={busy}
              className={fieldCls}
            />
          </div>
        </div>

        {/* Paid by */}
        <div>
          <label htmlFor="expense-paid-by" className={sectionLabelCls}>
            Paid by
          </label>
          <Select
            name="expense-paid-by"
            value={paidBy}
            onValueChange={(value) => setPaidBy((value ?? 'team') as ExpensePaidBy)}
            disabled={busy}
            options={PAID_BY_OPTIONS}
            className={cn(fieldCls, 'bg-surface')}
          />
        </div>

        {/* Receipt upload */}
        <div>
          <p className={sectionLabelCls}>Receipt (optional)</p>
          {receiptFile || receiptUrl ? (
            <div className="flex items-center gap-3 rounded-fw-md bg-surface-sunken p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-fw-sm bg-accent-100">
                <IconPaperclip size={18} className="text-accent-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                  {receiptFile?.name || 'Receipt attached'}
                </p>
                <p className="font-fw-sans text-caption text-text-tertiary">
                  {receiptFile ? `${(receiptFile.size / 1024).toFixed(1)} KB` : 'Uploaded'}
                </p>
              </div>
              <IconButton
                aria-label="Remove receipt"
                variant="ghost"
                size="sm"
                onClick={removeReceipt}
                disabled={busy}
                className="h-8 w-8"
              >
                <IconX size={16} />
              </IconButton>
            </div>
          ) : (
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-fw-md border border-dashed border-border-strong p-6 text-center transition-colors hover:border-accent-500 hover:bg-accent-50/60',
                busy && 'pointer-events-none opacity-50',
              )}
            >
              <IconUpload size={24} className="mb-2 text-text-tertiary" />
              <span className="font-fw-sans text-body-sm font-medium text-text-secondary">
                Click to upload receipt
              </span>
              <span className="mt-1 font-fw-sans text-caption text-text-tertiary">
                JPG, PNG, WebP or PDF (max 5MB)
              </span>
              { }
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                disabled={busy}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="expense-notes" className={labelCls}>
            Notes (optional)
          </label>
          <TextArea
            id="expense-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            rows={2}
            placeholder="Additional details about this expense…"
            className={cn(fieldCls, 'resize-none')}
          />
        </div>
      </ModalShell.Body>

      <ModalShell.Footer>
        <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={handleSubmit}
          busy={busy}
          disabled={busy}
          className="min-w-[160px]"
        >
          {uploading ? 'Uploading receipt…' : expense ? 'Save changes' : 'Add expense'}
        </Button>
      </ModalShell.Footer>
    </ModalShell>
  );
}

export default FairwayExpenseForm;
