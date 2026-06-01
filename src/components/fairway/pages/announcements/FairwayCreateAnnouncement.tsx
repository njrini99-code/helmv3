'use client';

/**
 * ============================================================================
 * Fairway · Announcements · FairwayCreateAnnouncement  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the coach CreateAnnouncementFlow — a trigger Button +
 * a Sheet (bottom drawer) carrying the multi-field create form. Re-skinned onto
 * the Fairway form primitives; the create logic is reused VERBATIM via
 * `createEnrichedAnnouncement` (same import path, same input contract).
 *
 * Every legacy field + interaction is preserved:
 *   • title (required) · body/message (required)
 *   • urgency RadioGroup (low / normal / high / urgent)
 *   • recipient targeting — All team (recipientPlayerIds = null) OR a specific
 *     subset (recipientPlayerIds = string[]); empty subset is rejected, mirroring
 *     the legacy validation.
 *   • require-acknowledgement Switch
 *   • document attachment from the `documents` prop (multi-select chips)
 *   • inline tasks (title required · optional description · optional due date) —
 *     same validation: all task titles must be filled.
 *   • live footer summary (recipients · docs · tasks · ack) — same vocabulary.
 *
 * Tokens / primitives ONLY. No glass / warm-* / blur. fairwayToast for feedback.
 * ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Sheet,
  Button,
  IconButton,
  Input,
  TextArea,
  FormField,
  FormSection,
  Switch,
  Checkbox,
  Chip,
  Badge,
  RadioGroup,
  fairwayToast,
  type FwStatusTone,
} from '@/components/fairway';
import {
  IconPlus,
  IconSend,
  IconPaperclip,
  IconClipboardList,
  IconUsers,
  IconUser,
  IconSearch,
  IconFile,
  IconCalendar,
  IconX,
} from '@/components/icons';
import { createEnrichedAnnouncement } from '@/app/golf/actions/announcements';

/* ─── Types (identical to the legacy flow) ─────────────────────────────────── */

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface DocumentLite {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
}

interface InlineTask {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
}

export interface FairwayCreateAnnouncementProps {
  players: Player[];
  documents: DocumentLite[];
}

type Urgency = 'low' | 'normal' | 'high' | 'urgent';

/* ─── Urgency → RadioGroup options + tone (low/normal/high/urgent →
 *     neutral/info/warning/danger). info has no off-green token so it reads
 *     neutral-secondary — matched to the StatusPill `info` tone). ──────────── */
const URGENCY_OPTIONS: Array<{ value: Urgency; label: string; tone: FwStatusTone }> = [
  { value: 'low', label: 'Low', tone: 'neutral' },
  { value: 'normal', label: 'Normal', tone: 'info' },
  { value: 'high', label: 'High', tone: 'warning' },
  { value: 'urgent', label: 'Urgent', tone: 'danger' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short file-type label for a document chip (mirrors the legacy getFileLabel). */
function fileLabel(ft: string): string {
  const f = ft.toLowerCase();
  if (f.includes('pdf')) return 'PDF';
  if (f.includes('doc') || f.includes('word')) return 'DOC';
  if (f.includes('sheet') || f.includes('xls') || f.includes('csv')) return 'XLS';
  if (f.includes('image') || f.includes('png') || f.includes('jpg')) return 'IMG';
  if (f.includes('video')) return 'VID';
  return 'FILE';
}

/* ─── Trigger + Sheet ──────────────────────────────────────────────────────── */

export function FairwayCreateAnnouncement({ players, documents }: FairwayCreateAnnouncementProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" leftIcon={<IconPlus size={16} />} onClick={() => setOpen(true)}>
        New Announcement
      </Button>
      <CreateSheet
        open={open}
        onOpenChange={setOpen}
        players={players}
        documents={documents}
      />
    </>
  );
}

function CreateSheet({
  open,
  onOpenChange,
  players,
  documents,
}: FairwayCreateAnnouncementProps & {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  // ── Form state (1:1 with the legacy flow) ─────────────────────────────────
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('normal');
  const [recipientPlayerIds, setRecipientPlayerIds] = useState<string[] | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [inlineTasks, setInlineTasks] = useState<InlineTask[]>([]);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');

  // Focus the title when the sheet opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => titleRef.current?.focus(), 180);
    return () => clearTimeout(t);
  }, [open]);

  // Reset everything when the sheet fully closes (so a re-open is clean).
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setTitle('');
      setBody('');
      setUrgency('normal');
      setRecipientPlayerIds(null);
      setSelectedDocumentIds([]);
      setInlineTasks([]);
      setRequiresAcknowledgement(false);
      setShowPlayerPicker(false);
      setShowDocPicker(false);
      setPlayerSearch('');
      setDocSearch('');
    }, 250);
    return () => clearTimeout(t);
  }, [open]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isAllTeam = recipientPlayerIds === null;
  const selectedDocs = documents.filter((d) => selectedDocumentIds.includes(d.id));
  const availableDocs = documents.filter((d) => !selectedDocumentIds.includes(d.id));
  const filteredAvailableDocs = availableDocs.filter(
    (d) => !docSearch || d.title.toLowerCase().includes(docSearch.toLowerCase()),
  );
  const filteredPlayers = players.filter((p) => {
    if (!playerSearch) return true;
    const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
    return name.includes(playerSearch.toLowerCase());
  });
  const recipientCount = isAllTeam ? players.length : recipientPlayerIds!.length;

  function handleClose() {
    if (loading) return;
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      fairwayToast.danger('Title is required');
      return;
    }
    if (!body.trim()) {
      fairwayToast.danger('Message is required');
      return;
    }

    const validTasks = inlineTasks.filter((t) => t.title.trim());
    if (inlineTasks.length > 0 && validTasks.length !== inlineTasks.length) {
      fairwayToast.danger('Please fill in all task titles or remove empty tasks');
      return;
    }
    if (recipientPlayerIds !== null && recipientPlayerIds.length === 0) {
      fairwayToast.danger('Please select at least one player or choose All Team');
      return;
    }

    setLoading(true);
    try {
      const result = await createEnrichedAnnouncement({
        title: title.trim(),
        body: body.trim(),
        urgency,
        requiresAcknowledgement,
        recipientPlayerIds,
        documentIds: selectedDocumentIds,
        inlineTasks: validTasks.map((t) => ({
          title: t.title.trim(),
          description: t.description?.trim(),
          dueDate: t.dueDate,
        })),
      });

      if (!result.success) {
        fairwayToast.danger(result.error || 'Failed to create announcement');
        setLoading(false);
        return;
      }

      fairwayToast.success('Announcement posted');
      onOpenChange(false);
      router.refresh();
    } catch {
      fairwayToast.danger('Failed to create announcement');
    } finally {
      setLoading(false);
    }
  }

  function togglePlayer(id: string) {
    const current = recipientPlayerIds || [];
    if (current.includes(id)) setRecipientPlayerIds(current.filter((p) => p !== id));
    else setRecipientPlayerIds([...current, id]);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
      side="bottom"
      title="New announcement"
      description="Share schedule changes, news, and updates with your team."
      dismissible={!loading}
      hideClose={loading}
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <Sheet.Body className="flex flex-col gap-6 pb-2">
          {/* ── Title + message ─────────────────────────────────────────────── */}
          <FormField label="Title" required>
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title"
              autoCapitalize="sentences"
              autoCorrect="on"
            />
          </FormField>

          <FormField label="Message" required>
            <TextArea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Write your message to the team…"
              autoCapitalize="sentences"
              autoCorrect="on"
            />
          </FormField>

          {/* ── Priority ────────────────────────────────────────────────────── */}
          <FormField label="Priority">
            <RadioGroup
              orientation="horizontal"
              value={urgency}
              onValueChange={(v) => setUrgency(v as Urgency)}
              options={URGENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </FormField>

          {/* ── Send to ─────────────────────────────────────────────────────── */}
          <FormField
            label="Send to"
            help={
              isAllTeam
                ? `All ${players.length} ${players.length === 1 ? 'player' : 'players'} on the team`
                : `${recipientCount} ${recipientCount === 1 ? 'player' : 'players'} selected`
            }
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={isAllTeam ? 'primary' : 'secondary'}
                  leftIcon={<IconUsers size={14} />}
                  onClick={() => {
                    setRecipientPlayerIds(null);
                    setShowPlayerPicker(false);
                    setPlayerSearch('');
                  }}
                >
                  All team
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!isAllTeam ? 'primary' : 'secondary'}
                  leftIcon={<IconUser size={14} />}
                  onClick={() => {
                    if (isAllTeam) setRecipientPlayerIds([]);
                    setShowPlayerPicker((s) => !s);
                  }}
                >
                  {`Select${!isAllTeam && recipientPlayerIds!.length > 0 ? ` (${recipientPlayerIds!.length})` : ''}`}
                </Button>
              </div>

              {showPlayerPicker && !isAllTeam && (
                <div className="overflow-hidden rounded-fw-md border border-border-subtle bg-surface">
                  <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
                    <IconSearch size={15} className="flex-shrink-0 text-text-tertiary" />
                    {/* eslint-disable-next-line helm/no-raw-input -- borderless inline search inside a custom bordered picker; the Fairway Input carries its own surface */}
                    <input
                      type="search"
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      placeholder="Search players…"
                      aria-label="Search players"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="w-full bg-transparent font-fw-sans text-body-sm text-text-primary outline-none placeholder:text-text-tertiary"
                    />
                    {(recipientPlayerIds?.length ?? 0) > 0 && (
                      <span className="flex-shrink-0 font-fw-sans text-caption tabular-nums text-text-tertiary">
                        {recipientPlayerIds!.length} selected
                      </span>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1.5">
                    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                      {filteredPlayers.map((player) => {
                        const isSel = (recipientPlayerIds || []).includes(player.id);
                        return (
                          <label
                            key={player.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-2.5 rounded-fw-sm px-2.5 py-2 transition-colors',
                              isSel ? 'bg-accent-50/60' : 'hover:bg-surface-sunken',
                            )}
                          >
                            <Checkbox checked={isSel} onCheckedChange={() => togglePlayer(player.id)} />
                            <span
                              className={cn(
                                'truncate font-fw-sans text-body-sm',
                                isSel ? 'font-medium text-accent-700' : 'text-text-secondary',
                              )}
                            >
                              {player.first_name || ''} {player.last_name || ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {filteredPlayers.length === 0 && (
                      <p className="py-3 text-center font-fw-sans text-body-sm text-text-tertiary">
                        No players found
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </FormField>

          {/* ── Attachments + acknowledgement + tasks ───────────────────────── */}
          <FormSection title="Options" description="Attachments, acknowledgement, and tasks.">
            <div className="flex flex-col gap-4">
              <Switch
                checked={requiresAcknowledgement}
                onCheckedChange={(v) => setRequiresAcknowledgement(!!v)}
                label="Require acknowledgement"
                description="Players must confirm they've read this announcement."
              />

              {/* Documents */}
              {documents.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                      Attachments
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      leftIcon={<IconPaperclip size={14} />}
                      onClick={() => setShowDocPicker((s) => !s)}
                    >
                      {selectedDocumentIds.length > 0
                        ? `${selectedDocumentIds.length} attached`
                        : 'Attach'}
                    </Button>
                  </div>

                  {selectedDocs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedDocs.map((doc) => (
                        <Chip
                          key={doc.id}
                          tone="neutral"
                          leadingIcon={<IconFile />}
                          onRemove={() =>
                            setSelectedDocumentIds((prev) => prev.filter((id) => id !== doc.id))
                          }
                          removeLabel={`Remove ${doc.title}`}
                        >
                          {doc.title}
                        </Chip>
                      ))}
                    </div>
                  )}

                  {showDocPicker && availableDocs.length > 0 && (
                    <div className="overflow-hidden rounded-fw-md border border-border-subtle bg-surface">
                      {availableDocs.length > 3 && (
                        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
                          <IconSearch size={15} className="flex-shrink-0 text-text-tertiary" />
                          {/* eslint-disable-next-line helm/no-raw-input -- borderless inline search inside a custom bordered picker; the Fairway Input carries its own surface */}
                          <input
                            type="search"
                            value={docSearch}
                            onChange={(e) => setDocSearch(e.target.value)}
                            placeholder="Search documents…"
                            aria-label="Search documents"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            className="w-full bg-transparent font-fw-sans text-body-sm text-text-primary outline-none placeholder:text-text-tertiary"
                          />
                        </div>
                      )}
                      <div className="max-h-48 overflow-y-auto p-1.5">
                        {filteredAvailableDocs.map((doc) => (
                          // eslint-disable-next-line helm/no-raw-button -- custom document-picker row (file badge + meta + add glyph); not a pill CTA
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => {
                              setSelectedDocumentIds((prev) => [...prev, doc.id]);
                              if (availableDocs.length <= 1) setShowDocPicker(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-fw-sm px-2.5 py-2 text-left transition-colors hover:bg-surface-sunken"
                          >
                            <Badge tone="neutral" size="sm">
                              {fileLabel(doc.file_type)}
                            </Badge>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
                                {doc.title}
                              </span>
                              <span className="block font-fw-sans text-caption text-text-tertiary tabular-nums">
                                {formatFileSize(doc.file_size)}
                              </span>
                            </span>
                            <IconPlus size={14} className="flex-shrink-0 text-text-tertiary" />
                          </button>
                        ))}
                        {filteredAvailableDocs.length === 0 && (
                          <p className="py-3 text-center font-fw-sans text-body-sm text-text-tertiary">
                            {docSearch ? 'No documents match' : 'All documents attached'}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Inline tasks */}
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                    Tasks
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    leftIcon={<IconClipboardList size={14} />}
                    onClick={() =>
                      setInlineTasks((prev) => [...prev, { id: crypto.randomUUID(), title: '' }])
                    }
                  >
                    {inlineTasks.length > 0 ? `Add task (${inlineTasks.length})` : 'Add task'}
                  </Button>
                </div>

                {inlineTasks.map((task, index) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-2.5 rounded-fw-md border border-border-subtle bg-surface-sunken p-3"
                  >
                    <span className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-fw-sm bg-surface font-fw-mono text-caption font-semibold tabular-nums text-text-tertiary">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {/* eslint-disable-next-line helm/no-raw-input -- borderless inline task field inside a sunken row; the Fairway Input carries its own surface */}
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) =>
                          setInlineTasks((prev) =>
                            prev.map((t, i) => (i === index ? { ...t, title: e.target.value } : t)),
                          )
                        }
                        placeholder="Task title…"
                        aria-label={`Task ${index + 1} title`}
                        autoCapitalize="sentences"
                        className="w-full bg-transparent font-fw-sans text-body-sm font-medium text-text-primary outline-none placeholder:text-text-tertiary"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {/* eslint-disable-next-line helm/no-raw-input -- borderless inline task field inside a sunken row; the Fairway Input carries its own surface */}
                        <input
                          type="text"
                          value={task.description || ''}
                          onChange={(e) =>
                            setInlineTasks((prev) =>
                              prev.map((t, i) =>
                                i === index ? { ...t, description: e.target.value || undefined } : t,
                              ),
                            )
                          }
                          placeholder="Description (optional)"
                          aria-label={`Task ${index + 1} description`}
                          autoCapitalize="sentences"
                          className="min-w-0 flex-1 bg-transparent font-fw-sans text-caption text-text-secondary outline-none placeholder:text-text-tertiary"
                        />
                        <div className="flex flex-shrink-0 items-center gap-1.5 text-text-tertiary">
                          <IconCalendar size={13} />
                          {/* eslint-disable-next-line helm/no-raw-input -- borderless inline date field inside a sunken task row; the Fairway Input carries its own surface */}
                          <input
                            type="date"
                            value={task.dueDate || ''}
                            onChange={(e) =>
                              setInlineTasks((prev) =>
                                prev.map((t, i) =>
                                  i === index ? { ...t, dueDate: e.target.value || undefined } : t,
                                ),
                              )
                            }
                            aria-label={`Task ${index + 1} due date`}
                            className="bg-transparent font-fw-sans text-caption text-text-secondary outline-none [width:7rem]"
                          />
                        </div>
                      </div>
                    </div>
                    <IconButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove task ${index + 1}`}
                      onClick={() => setInlineTasks((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <IconX size={14} />
                    </IconButton>
                  </div>
                ))}
              </div>
            </div>
          </FormSection>
        </Sheet.Body>

        {/* ── Footer: live summary + actions ──────────────────────────────────── */}
        <Sheet.Footer className="flex-row items-center justify-between">
          <span className="flex min-w-0 items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
            <IconUsers size={13} className="flex-shrink-0 text-accent-600" />
            <span className="truncate tabular-nums">
              {recipientCount} {recipientCount === 1 ? 'player' : 'players'}
              {selectedDocumentIds.length > 0 &&
                ` · ${selectedDocumentIds.length} doc${selectedDocumentIds.length !== 1 ? 's' : ''}`}
              {inlineTasks.length > 0 &&
                ` · ${inlineTasks.length} task${inlineTasks.length !== 1 ? 's' : ''}`}
              {requiresAcknowledgement && ' · ack'}
            </span>
          </span>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" busy={loading} leftIcon={<IconSend size={14} />}>
              Post
            </Button>
          </div>
        </Sheet.Footer>
      </form>
    </Sheet>
  );
}

export default FairwayCreateAnnouncement;
