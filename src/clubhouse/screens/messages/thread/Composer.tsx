'use client';

import { type ReactNode, useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useSendKeyPop, useChipRise } from '../thread-v2';
import type { ChMessagesApi, ChPendingAttachmentSend } from '../api/types';
import { type ChConv, type ChMsg, firstName, MESSAGE_MAX } from '../model';
import { takeThreadFiles, subscribeThreadFiles } from '../prefill';
import { useAddAttachments, useAutosize, AttachChips, CharsLeft } from './composer-parts';
import { useComposerInset } from '../composer-inset';
import { useImeGuard } from '../../../lib/ime-guard';
import { CH_MS } from '../../../lib/motion';
import { msAnimate } from '../motion/messages-motion';
import { HOUSE_EASE, playArrowLeave, playFieldReturn } from '../motion/messages-beats';
import { chTrail } from '../../../lib/track';
import { haptic } from '../../../lib/haptics';
import { useClassText } from '../../../ui/ClassStatusLine';
import { sendNotify, isNotifyChord, notifyChordLabel } from '../notify-anyway';
import { personOf } from '../person-of';
import { InlineNotice } from '../../../ui/Notices';
import { Icon } from '../../../ui/Icon';
import { Pencil, X, Reply, FileText } from 'lucide-react';
import { IconButton, Button } from '../../../ui/Button';
import { replyName } from './MessageText';
import { Tooltip } from '../../../ui/Tooltip';
import { GroupClassLine } from '../GroupClassLine';
import { ComposerPlusV2 } from '../ComposerPlusV2';
import { SendCluster } from '../NotifyAnyway';
import { Modal } from '../../../ui/Modal';

/** Redesign: the send key's place. Empty field, nothing there at all (computed `display: none`, MSG-ALL-09); otherwise it pops in and out. */
function SendKeyHolder({ ready, children }: { ready: boolean; children: ReactNode }) {
  const reduced = useChReducedMotion();
  const { ref, hidden } = useSendKeyPop(ready, reduced);

  return (
    <span ref={ref} className="ch-msv-sendkey" hidden={hidden}>
      {children}
    </span>
  );
}

export function Composer({
  api,
  conv,
  phone = false,
  initialDraft,
  initialFiles,
  autoSend = false,
  replyToId,
  onClearReply,
  onSendingChange,
  unavailable = false,
  seed = null,
  editing = null,
  onEditDone,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  /** Redesign: your text message being edited; the field holds it and Send saves it (MSG-EDIT-01). */
  editing?: ChMsg | null;
  onEditDone?: () => void;
  /** Phone: the design's "+" attach button, and no keyboard hint. */
  phone?: boolean;
  /** A first message written before the conversation existed (the phone's New message). */
  initialDraft?: string;
  /** Files picked with that first message. */
  initialFiles?: File[];
  /** Send `initialDraft` and `initialFiles` as soon as the thread opens; a failure leaves them in the box (CH-7004). */
  autoSend?: boolean;
  replyToId?: string | null;
  onClearReply?: () => void;
  onSendingChange?: (sending: boolean) => void;
  /** The conversation did not load (CH-7202): there is nothing to reply into, so the composer says so and stays off. */
  unavailable?: boolean;
  /**
   * P-2 D30: a reply prefilled by a poll action (Remind, Share result). It fills an empty composer, asks before replacing
   * a draft, and puts the caret at the end; the person presses Send. A new `nonce` is a new seed.
   */
  seed?: { text: string; nonce: number } | null;
}) {
  const recovery = api.attachmentRecovery?.get(conv.id);
  const [unconfirmed, setUnconfirmed] = useState(!!recovery);
  const [resumed, setResumed] = useState<ChPendingAttachmentSend | null>(recovery?.resumed ?? null);
  const [checking, setChecking] = useState(!!api.loadPendingAttachmentSend);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [recoveredParent, setRecoveredParent] = useState(recovery?.replyToId ?? null);
  const effectiveParent = recoveredParent ?? replyToId;
  const queued = useRef({ text: recovery?.queuedText ?? "", files: recovery?.queuedFiles ?? [] as File[] });
  const [draft, setDraftState] = useState(recovery?.text ?? initialDraft ?? api.drafts.get(conv.id) ?? "");
  const setDraft = (text: string) => {
    setDraftState(text);
    if (text) api.drafts.set(conv.id, text);
    else api.drafts.delete(conv.id);
  };
  const [files, setFiles] = useState<File[]>(recovery?.files ?? initialFiles ?? []);
  const filesRef = useRef(files);
  filesRef.current = files;
  // A board from Ask lands here as a file waiting to be sent: the coach presses Send.
  useEffect(() => {
    const take = () => {
      const seeded = takeThreadFiles(conv.id);
      if (seeded.length) setFiles((f) => [...f, ...seeded]);
    };
    take();
    return subscribeThreadFiles(take);
  }, [conv.id]);
  // Q-33: a plain-text send is allowed while the one before it is still saving, so MC-01 (two sends 140 ms apart) can happen. Edits,
  // files, recovery and an unconfirmed send stay serialized: `locked` is theirs, `flights` counts the plain ones in the air.
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false);
  const sendingRef = useRef(false);
  const flights = useRef(0);
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const ime = useImeGuard();
  const composerReduced = useChReducedMotion();
  // Redesign: Edit fills the field, focused, caret at the end; leaving it empties the field again.
  const editId = editing?.id ?? null;
  useEffect(() => {
    if (!editing) return;
    setDraft(editing.text);
    const t = ta.current;
    requestAnimationFrame(() => {
      t?.focus();
      t?.setSelectionRange(editing.text.length, editing.text.length);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per message put up for editing
  }, [editId]);
  const chipRise = useChipRise(composerReduced);
  const footer = useRef<HTMLElement | null>(null);
  const typingTimer = useRef<number | null>(null);
  const ready = (draft.trim() || files.length || resumed) && !locked && !checking && !checkFailed && !unavailable;
  const addFiles = useAddAttachments();
  const [replacing, setReplacing] = useState<string | null>(null);
  const applySeed = (text: string) => {
    setDraft(text);
    setReplacing(null);
    requestAnimationFrame(() => {
      const el = ta.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };
  useEffect(() => {
    if (!seed) return;
    if (draft.trim()) setReplacing(seed.text);
    else applySeed(seed.text);
  }, [seed?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useAutosize(ta, draft);
  // Toasts sit above this composer, however tall it grows (wave 5 #1).
  useComposerInset(footer);

  useEffect(() => {
    if (!api.loadPendingAttachmentSend) return;
    let mounted = true;
    setChecking(true);
    setCheckFailed(false);
    onSendingChange?.(true);
    void api.loadPendingAttachmentSend().then((pending) => {
      if (!mounted) return;
      if (pending) {
        const cached = api.attachmentRecovery?.get(conv.id);
        if (!cached) queued.current = { text: api.drafts.get(conv.id) ?? draft, files: filesRef.current };
        setResumed(pending);
        setUnconfirmed(true);
        setRecoveredParent(pending.replyToId);
        setDraftState(pending.text);
        setFiles(cached?.files ?? []);
        api.attachmentRecovery?.set(conv.id, {
          text: pending.text, files: cached?.files ?? [], replyToId: pending.replyToId,
          queuedText: queued.current.text, queuedFiles: queued.current.files, resumed: pending,
        });
      }
      setChecking(false);
      onSendingChange?.(!!pending || !!recovery);
    }).catch(() => {
      if (!mounted) return;
      setChecking(false);
      setCheckFailed(true);
      // A failed check cannot prove a previous write absent: leave normal Send locked.
      onSendingChange?.(true);
    });
    return () => { mounted = false; };
  }, [conv.id, checkAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (notifyAnyway = false) => {
    if (!ready || sendingRef.current) return;
    const plain = !editing && !files.length && !resumed && !unconfirmed;
    if (!plain && flights.current > 0) return;
    if (editing) {
      const text = draft.trim();
      if (text === editing.text.trim()) {
        onEditDone?.();
        setDraft("");
        return;
      }
      sendingRef.current = true;
      setLocked(true);
      setSending(true);
      const ok = await api.edit(editing.id, text);
      sendingRef.current = false;
      setLocked(false);
      setSending(false);
      if (ok) {
        // MOT-X-9: the saved bubble flashes .4 > 1 over 260 ms on the house ease (a crossfade under Reduce Motion).
        const saved = document.getElementById(`ch-ms-message-${editing.id}`)?.querySelector<HTMLElement>(".ch-ms-bub");
        if (saved) msAnimate(saved, [{ opacity: 0.4 }, { opacity: 1 }], null, { reduced: composerReduced, timing: { ms: CH_MS.receipt, easing: HOUSE_EASE } });
        setDraft("");
        onEditDone?.();
      }
      return;
    }
    const text = draft.trim();
    const pending = files;
    const parentId = effectiveParent;
    const recoveredRequest = resumed;
    if (plain) {
      flights.current += 1;
      // The reply belongs to this send; a failed bubble keeps its own parent, so the chip can go now.
      if (parentId) {
        setRecoveredParent(null);
        onClearReply?.();
      }
    } else {
      sendingRef.current = true;
      setLocked(true);
    }
    setSending(true);
    onSendingChange?.(true);
    // MOT-SEND-6, -8: the arrow leaves the key upward, and the field's placeholder fades back last.
    const arrow = footer.current?.querySelector<HTMLElement>(".ch-msv-sendkey .ch-ms-send svg");
    if (arrow) playArrowLeave(arrow, composerReduced);
    if (ta.current) playFieldReturn(ta.current, composerReduced);
    // Recovery retries clear the visible original, while the later ordinary draft stays durable.
    if (unconfirmed || recoveredRequest) setDraftState("");
    else setDraft("");
    setFiles([]);
    api.onTyping(false);
    chTrail("messages send");
    const ok = recoveredRequest
      ? await (api.retryPendingAttachmentSend?.() ?? Promise.resolve("unknown" as const))
      : pending.length
      ? await (parentId ? api.sendFiles(text, pending, parentId) : api.sendFiles(text, pending))
      : notifyAnyway
      // P-10: only a plain text send carries the flag (the attachment path has none), and only when the coach chose it.
      ? await api.send(text, parentId ?? null, { notifyAnyway: true })
      : await (parentId ? api.send(text, parentId) : api.send(text));
    if (plain) flights.current -= 1;
    else {
      sendingRef.current = false;
      setLocked(false);
    }
    setSending(flights.current > 0);
    if (ok === "unknown") {
      if (!unconfirmed) queued.current = { text: api.drafts.get(conv.id) ?? "", files: filesRef.current };
      api.attachmentRecovery?.set(conv.id, { text, files: pending, replyToId: parentId, queuedText: queued.current.text, queuedFiles: queued.current.files, resumed: recoveredRequest });
      setUnconfirmed(true);
      setRecoveredParent(parentId ?? null);
      setDraftState(text);
      // Persist only the later ordinary draft; the uncertain original belongs to its stored operation.
      if (queued.current.text) api.drafts.set(conv.id, queued.current.text);
      else api.drafts.delete(conv.id);
      setFiles(pending);
      onSendingChange?.(true);
      haptic("warning");
      ta.current?.blur();
      return;
    }
    api.attachmentRecovery?.delete(conv.id);
    setUnconfirmed(false);
    setResumed(null);
    if (recoveredRequest && ok !== true) {
      setMissingFiles(recoveredRequest.filenames.filter((name) => !pending.some((file) => file.name === name)));
    }
    if (unconfirmed) {
      setDraft(queued.current.text);
      setFiles(queued.current.files);
      queued.current = { text: "", files: [] };
    }
    if (flights.current === 0) onSendingChange?.(false);
    // Text failures retain their parent in the failed bubble; attachment failures stay in this composer.
    if (ok === true || (!pending.length && !recoveredRequest)) { setRecoveredParent(null); onClearReply?.(); }
    if (ok === true) haptic("success");
    else if (ok === "partial") {
      // The text was delivered; recover only the unsaved files, never duplicate that text.
      haptic("warning");
      setFiles((now) => [...pending, ...now]);
    } else {
      haptic("error");
      // A failed text stays in the thread as its own bubble, marked, with Retry (same id, so never a duplicate) and
      // Discard: putting it back in the box as well made a second send under a new id easy (owner 2026-10-01). A failed
      // attachment send has no bubble, so its text and files go back in the box, in front of anything typed since,
      // never over it (MSG-26). The drafts map mirrors the box and outlives it when the thread was switched meanwhile.
      if (pending.length || recoveredRequest) {
        const since = api.drafts.get(conv.id) ?? "";
        setDraft(since ? (text ? `${text}\n${since}` : since) : text);
        setFiles((now) => [...pending, ...now]);
      }
    }
    ta.current?.focus();
  };
  useEffect(() => {
    if (recovery && !api.loadPendingAttachmentSend) onSendingChange?.(true);
    // Restore the parent action lock when an unresolved composer remounts.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const autoRequested = useRef(autoSend && !!(initialDraft?.trim() || initialFiles?.length));
  const autoSent = useRef(false);
  useEffect(() => {
    if (!autoRequested.current || autoSent.current || checking || checkFailed || unconfirmed || resumed) return;
    autoSent.current = true;
    void send();
    // Keep the handed-over first message until the pending-send check permits it.
  }, [checking, checkFailed, unconfirmed, resumed]); // eslint-disable-line react-hooks/exhaustive-deps
  // P-10 Notify anyway: offered for a plain text send to a recipient who is in class with pushes held (see sendNotify). Otherwise nothing
  // below changes: same placeholder, same Send, same hint, and Cmd/Ctrl+Shift+Enter keeps meaning a new line.
  const classText = useClassText(api.classDay?.day ? { teamTimeZone: api.classDay.day.teamTimeZone, classTimeZone: api.classDay.day.classTimeZone } : null);
  const notifyRule = sendNotify(api.classDay, conv, (id) => personOf(api, id), classText);
  const notify = notifyRule && !files.length && !resumed && !unconfirmed && !checking && !checkFailed && !unavailable ? notifyRule : null;
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)), []);
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // An input method is committing a word: this Enter is not a send (Safari ends composition before it; see ime-guard).
    if (ime.composing(e)) return;
    if (!phone && notify && isNotifyChord(e)) {
      e.preventDefault();
      void send(true);
      return;
    }
    if (!phone && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };
  const label = conv.group ? conv.title : firstName(conv.title);
  return (
    <footer ref={footer} className="ch-ms-comp" aria-busy={checking || sending || undefined}>
      {checkFailed && <InlineNotice code="CH-7217" title="Couldn’t check a pending send" body="Try again before sending another message." onRetry={() => setCheckAttempt((n) => n + 1)} />}
      {unconfirmed && <InlineNotice code="CH-7023" title="Couldn’t confirm this send" body="This send is unconfirmed. Retry send checks the original request; editing stays locked until its outcome is known." />}
      {editing && (
        <div className="ch-ms-comp__reply is-edit" ref={chipRise}>
          <Icon icon={Pencil} size={18} />
          Editing message
          <IconButton icon={X} label="Cancel edit" onClick={() => { setDraft(""); onEditDone?.(); }} />
        </div>
      )}
      {effectiveParent && (
        <div className="ch-ms-comp__reply" ref={chipRise}>
          <Icon icon={Reply} size={18} />
          Replying to {replyName(api, effectiveParent)}
          <IconButton icon={X} label="Cancel reply" onClick={() => { setRecoveredParent(null); onClearReply?.(); }} disabled={sending || unconfirmed || checking || checkFailed} />
        </div>
      )}

      {resumed && !files.length && <div role="group" className="ch-ms-to" aria-label="Pending attachments">{resumed.filenames.map((name, i) => <span key={`${name}-${i}`} className="ch-ms-to__c"><Icon icon={FileText} size={13} />{name}</span>)}</div>}
      {missingFiles.length > 0 && <div role="status" className="ch-ms-to" aria-label="Attachments to choose again">Choose these files again: {missingFiles.map((name, i) => <span key={`${name}-${i}`} className="ch-ms-to__c">{name}<Tooltip><button type="button" aria-label={`Dismiss ${name}`} onClick={() => setMissingFiles((now) => now.filter((_, j) => j !== i))}><Icon icon={X} size={12} /></button></Tooltip></span>)}</div>}
      {conv.group && api.classDay && <GroupClassLine cls={api.classDay} conv={conv} personOf={(id) => personOf(api, id)} />}
      <AttachChips
        disabled={unconfirmed || checking || checkFailed || unavailable}
        files={files}
        onRemove={(i) => setFiles((s) => s.filter((_, j) => j !== i))}
      />
      {/* The pill is the field to the finger (F-0021): its own 5px around the 36px field puts the caret in it, so the
          target is the pill's 46, not 36. A keyboard goes to the field itself. */}
      <div className="ch-ms-comp__field" role="presentation" onClick={(e) => e.target === e.currentTarget && ta.current?.focus()}>
        <ComposerPlusV2
            api={api}
            conv={conv}
            disabled={unconfirmed || checking || checkFailed || unavailable}
            onPick={(picked) => { setFiles(addFiles(filesRef.current, picked)); setMissingFiles((names) => names.filter((name) => !picked.some((file) => file.name === name))); }}
          />
        <textarea
          ref={ta}
          rows={1}
          // CH-7802: desktop Enter sends; phone Return adds a line and the Send button sends.
          aria-label={`Message ${label}`}
          placeholder={unavailable ? "Replies are off until this loads" : (notify?.placeholder ?? `Message ${label}`)}
          data-ch-code={notify?.placeholder ? "CH-7270" : undefined}
          value={draft}
          readOnly={unconfirmed || checking || checkFailed || unavailable}
          onChange={(e) => {
            setDraft(e.target.value);
            api.onTyping(true);
            if (typingTimer.current) window.clearTimeout(typingTimer.current);
            typingTimer.current = window.setTimeout(
              () => api.onTyping(false),
              2500,
            );
          }}
          onKeyDown={onKey}
          {...ime.composition}
          maxLength={MESSAGE_MAX}
          enterKeyHint={phone ? "enter" : "send"}
        />
        <SendKeyHolder ready={!!ready || unconfirmed}><SendCluster phone={phone} ready={!!ready} unconfirmed={unconfirmed} notify={notify} mac={mac} onSend={(notifyAnyway) => void send(notifyAnyway)} /></SendKeyHolder>
      </div>
      {unavailable ? (
        <span className="ch-ms-comp__hint">
          This conversation didn’t load, so you can’t send yet. Try again above.
        </span>
      ) : (
        <>
          {/* MSG-308: nothing is drawn under the desktop pill. The keys are still said to a screen reader (CH-7802), and the
              Notify anyway chord is on its own menu row. */}
          {!phone && (
            <span className="ch-sr-only" data-ch-comp-keys="">
              Enter to send · Shift + Enter for a new line{notify ? ` · ${notifyChordLabel(mac).hint}` : ""}
            </span>
          )}
          <CharsLeft text={draft} />
        </>
      )}
      <Modal
        open={replacing != null}
        onClose={() => setReplacing(null)}
        title="Replace your draft?"
        description="Your message so far will be replaced with the reminder."
        width={400}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReplacing(null)}>
              Keep my draft
            </Button>
            <Button variant="primary" onClick={() => replacing != null && applySeed(replacing)}>
              Replace
            </Button>
          </>
        }
      />
    </footer>
  );
}
