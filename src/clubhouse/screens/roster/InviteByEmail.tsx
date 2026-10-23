'use client';

import { Mail, X } from 'lucide-react';
import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { emailPlayerInvites } from '@/app/golf/actions/team-management';
import { isInviteEmail, MAX_INVITE_EMAILS, normalizeInviteEmail, parseInviteEmails } from '@/lib/golf/invite-emails';
import { haptic } from '../../lib/haptics';
import { useAction } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { plural } from '../../lib/plural';

interface Chip {
  /** What was typed: the normalised address when it reads as one. */
  text: string;
  ok: boolean;
  /** The last send did not take this address: it stays so the coach can send again. */
  unsent?: boolean;
}

/** A failure the coach can't fix by trying again: the toast offers no Retry. */
const FINAL = new Set(['email_off', 'rate_limited', 'no_code']);

/**
 * "Email them": type or paste addresses, each becomes a chip, and one button sends the team's link and code to all of
 * them (Roster › Invite players, QUEUE doc-60). An address that can't be read stays as a flagged chip, never dropped
 * silently; one that didn't send stays for another try; the ones that went are cleared. With email paused the section
 * is one quiet line, because the code and link above still work.
 */
export function InviteByEmail({ enabled }: { enabled: boolean }) {
  const id = useId();
  const [chips, setChips] = useState<Chip[]>([]);
  const [draft, setDraft] = useState('');
  const [over, setOver] = useState(false);
  const [receipt, setReceipt] = useState<{ sent: number; failed: number } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const finalCode = useRef(false);

  const good = chips.filter((c) => c.ok);
  const bad = chips.length - good.length;

  const take = (text: string) => {
    const { valid, invalid } = parseInviteEmails(text);
    if (!valid.length && !invalid.length) return;
    setReceipt(null);
    const have = new Set(chips.map((c) => c.text.toLowerCase()));
    const next = [...chips];
    let room = MAX_INVITE_EMAILS - good.length;
    let dropped = false;
    for (const e of valid) {
      if (have.has(e)) continue;
      if (room <= 0) {
        dropped = true;
        continue;
      }
      next.push({ text: e, ok: true });
      have.add(e);
      room -= 1;
    }
    for (const t of invalid) if (!have.has(t.toLowerCase())) next.push({ text: t, ok: false });
    setChips(next);
    setOver(dropped);
  };

  const commit = () => {
    if (!draft.trim()) return;
    take(draft);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ') {
      if (draft.trim()) {
        e.preventDefault();
        commit();
      } else if (e.key !== 'Enter') {
        e.preventDefault();
      }
    } else if (e.key === 'Backspace' && !draft && chips.length) {
      haptic('select');
      setChips((cur) => cur.slice(0, -1));
      setOver(false);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!/[\s,;]/.test(text.trim())) return;
    e.preventDefault();
    take(`${draft} ${text}`);
    setDraft('');
  };

  const remove = (text: string) => {
    haptic('select');
    setChips((cur) => cur.filter((c) => c.text !== text));
    setOver(false);
    field.current?.focus();
  };

  const send = useAction(
    'roster.emailPlayerInvites',
    async (emails: string[]) => {
      const r = await emailPlayerInvites(emails);
      finalCode.current = !r.success && !!r.code && FINAL.has(r.code);
      return r;
    },
    (emails) => ({ done: emails.length === 1 ? 'Invite sent' : `${emails.length} invites sent`, failed: 'Couldn’t send the invites', code: 'CH-3080' }),
    (result, c) => {
      if (result.success && result.data && result.data.failed.length > 0) {
        const total = result.data.sent + result.data.failed.length;
        return { ...c, done: result.data.sent > 0 ? `Sent ${result.data.sent} of ${total} invites` : '' };
      }
      return result.success ? c : { ...c, hint: result.error, retry: finalCode.current ? false : undefined };
    },
  );

  const submit = async () => {
    commit();
    const emails = [...new Set([...good.map((c) => c.text), ...(isInviteEmail(draft) ? [normalizeInviteEmail(draft)] : [])])];
    if (!emails.length) return;
    const res = await send.run(emails);
    if (!res.success || !res.data) return;
    const failed = new Set(res.data.failed);
    setReceipt({ sent: res.data.sent, failed: failed.size });
    setOver(false);
    setChips((cur) => cur.filter((c) => !c.ok || failed.has(c.text)).map((c) => (c.ok ? { ...c, unsent: true } : c)));
    setDraft('');
  };

  if (!enabled) {
    return (
      <p className="ch-field__help ch-rs-em__off" data-ch-code="CH-3980">
        Email invites are off for now. Share the team code or link above.
      </p>
    );
  }

  const count = good.length;
  return (
    <div className="ch-field ch-rs-em">
      <label className="ch-field__label" htmlFor={id}>
        Or email them
      </label>
      {/* The box is the field's frame: the chips and the text share one focus ring. */}
      <div className="ch-rs-em__box" data-invalid={bad > 0 ? '' : undefined}>
        {chips.map((c) => (
          <span key={c.text} className={'ch-rs-em__chip' + (c.ok ? '' : ' is-invalid') + (c.unsent ? ' is-unsent' : '')} data-ch-code={c.ok ? undefined : 'CH-3180'}>
            <span>{c.text}</span>
            {!c.ok && <span className="ch-sr-only">, can’t be read as an email address</span>}
            {c.unsent && <span className="ch-sr-only">, didn’t send</span>}
            <button type="button" className="ch-rs-em__x" aria-label={`Remove ${c.text}`} onClick={() => remove(c.text)}>
              <Icon icon={X} size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={field}
          className="ch-rs-em__in"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder={chips.length ? '' : 'eli@school.edu, mia@school.edu'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={commit}
        />
      </div>
      <div className="ch-rs-em__foot">
        <span className={'ch-field__help' + (over || bad > 0 ? ' is-error' : '')} role={over || bad > 0 ? 'alert' : undefined}>
          {bad > 0
            ? `${bad === 1 ? 'One address' : `${bad} addresses`} can’t be read. Fix or remove ${bad === 1 ? 'it' : 'them'}.`
            : over
              ? `${MAX_INVITE_EMAILS} at a time. Send these, then add the rest.`
              : `They get the link and the team code. ${count} of ${MAX_INVITE_EMAILS}`}
        </span>
        <Button variant="primary" size="sm" leftIcon={Mail} disabled={(count === 0 && !isInviteEmail(draft)) || bad > 0} busy={send.pending} onClick={() => void submit()}>
          {count > 1 ? `Send ${count} invites` : 'Send invite'}
        </Button>
      </div>
      <span className="ch-field__help ch-rs-em__receipt" role="status" aria-live="polite">
        {receipt
          ? receipt.failed
            ? `${receipt.sent ? `Sent to ${receipt.sent}. ` : ''}${receipt.failed} didn’t send. Try again.`
            : `Sent to ${plural(receipt.sent, 'player')}.`
          : ''}
      </span>
    </div>
  );
}
