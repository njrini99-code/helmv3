'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { createSchoolInvoice, type CreateInvoiceResult } from '@/app/admin/actions/billing';

interface LineRow {
  description: string;
  unitDollars: string;
  quantity: string;
}

const emptyRow: LineRow = { description: '', unitDollars: '', quantity: '1' };

export function CreateInvoiceForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateInvoiceResult | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('US');
  const [daysUntilDue, setDaysUntilDue] = useState('30');
  const [autoTax, setAutoTax] = useState(true);
  const [send, setSend] = useState(true);
  const [rows, setRows] = useState<LineRow[]>([{ ...emptyRow }]);

  function updateRow(i: number, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const lineItems = rows
      .filter((r) => r.description.trim() && Number(r.unitDollars) > 0)
      .map((r) => ({
        description: r.description.trim(),
        unitAmountCents: Math.round(Number(r.unitDollars) * 100),
        quantity: Math.max(1, Math.round(Number(r.quantity) || 1)),
      }));

    if (lineItems.length === 0) {
      toast.error('Add at least one line item with a description and amount.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await createSchoolInvoice({
          customer: {
            name: name.trim(),
            email: email.trim(),
            address: {
              line1: line1.trim(),
              city: city.trim(),
              postal_code: postal.trim(),
              country: country.trim().toUpperCase(),
              ...(state.trim() ? { state: state.trim() } : {}),
            },
          },
          lineItems,
          daysUntilDue: Number(daysUntilDue) || 30,
          autoTax,
          send,
        });
        setResult(res);
        toast.success(send ? 'Invoice created and sent.' : 'Invoice created (unsent).');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create invoice.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Customer */}
      <section className="glass-standard rounded-2xl border border-cream-400/40 p-6 shadow-glass">
        <h2 className="mb-4 text-h3 text-warm-900">School / program</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Test University Athletics" required />
          </div>
          <div className="sm:col-span-2">
            <Input label="Billing email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="billing@school.edu" required />
          </div>
          <div className="sm:col-span-2">
            <Input label="Address" value={line1} onChange={(e) => setLine1(e.target.value)}
              placeholder="1 Stadium Way" required />
          </div>
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} required />
          <Input label="State / province" value={state} onChange={(e) => setState(e.target.value)}
            placeholder="TX" />
          <Input label="Postal code" value={postal} onChange={(e) => setPostal(e.target.value)} required />
          <Input label="Country (ISO-2)" value={country} maxLength={2}
            onChange={(e) => setCountry(e.target.value)} required />
        </div>
        <p className="mt-3 text-caption text-warm-500">
          A resolvable address is required for Stripe Tax to determine the jurisdiction.
        </p>
      </section>

      {/* Line items */}
      <section className="glass-standard rounded-2xl border border-cream-400/40 p-6 shadow-glass">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h3 text-warm-900">Line items</h2>
          <Button type="button" variant="ghost" size="sm"
            onClick={() => setRows((p) => [...p, { ...emptyRow }])}>
            + Add item
          </Button>
        </div>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <div className="col-span-7">
                <Input placeholder="Description" value={row.description}
                  onChange={(e) => updateRow(i, { description: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Input type="number" min="0" step="0.01" placeholder="Amount"
                  value={row.unitDollars} onChange={(e) => updateRow(i, { unitDollars: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Input type="number" min="1" step="1" placeholder="Qty"
                  value={row.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} />
              </div>
              <div className="col-span-1 flex justify-center">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove line item"
                  disabled={rows.length === 1}
                  onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))}>
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-caption text-warm-500">Amount is per unit, in dollars.</p>
      </section>

      {/* Options */}
      <section className="glass-standard rounded-2xl border border-cream-400/40 p-6 shadow-glass">
        <h2 className="mb-4 text-h3 text-warm-900">Options</h2>
        <div className="flex flex-wrap items-end gap-6">
          <div className="w-32">
            <Input label="Days until due" type="number" min="0" max="365"
              value={daysUntilDue} onChange={(e) => setDaysUntilDue(e.target.value)} />
          </div>
          <Checkbox label="Apply Stripe Tax" checked={autoTax}
            onChange={(e) => setAutoTax(e.target.checked)} />
          <Checkbox label="Email the invoice" checked={send}
            onChange={(e) => setSend(e.target.checked)} />
        </div>
      </section>

      <Button type="submit" variant="primary" isLoading={isPending}>
        Create invoice
      </Button>

      {result && (
        <section className="glass-standard rounded-2xl border border-primary-600/30 p-6 shadow-glass">
          <h2 className="mb-2 text-h3 text-warm-900">Invoice {result.status}</h2>
          <dl className="space-y-1 text-body-sm text-warm-700">
            <div className="flex justify-between"><dt>Total</dt><dd>${(result.total / 100).toFixed(2)}</dd></div>
            <div className="flex justify-between">
              <dt>Tax</dt><dd>{result.tax === null ? '—' : `$${(result.tax / 100).toFixed(2)}`}</dd>
            </div>
          </dl>
          {result.hostedInvoiceUrl && (
            <a href={result.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer"
              className="mt-4 inline-block rounded-md bg-primary-600 px-4 py-2 text-caption font-semibold text-white">
              Open hosted invoice ↗
            </a>
          )}
        </section>
      )}
    </form>
  );
}
