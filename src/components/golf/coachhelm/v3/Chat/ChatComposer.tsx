'use client';

import { useState, type KeyboardEvent } from 'react';

interface Props {
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatComposer({ onSend, disabled = false, placeholder }: Props) {
  const [value, setValue] = useState('');

  async function submit() {
    const text = value.trim();
    if (text.length === 0 || disabled) return;
    setValue('');
    await onSend(text);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="border-t border-warm-200 bg-white p-3 flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        rows={2}
        placeholder={placeholder ?? 'Ask anything about your team…'}
        disabled={disabled}
        className="flex-1 resize-none rounded-xl border border-warm-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-warm-100"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
        className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-40"
      >
        Send
      </button>
    </div>
  );
}
