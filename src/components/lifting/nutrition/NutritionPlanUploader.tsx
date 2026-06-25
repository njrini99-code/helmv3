'use client';

// =============================================================================
// src/components/lifting/nutrition/NutritionPlanUploader.tsx
//
// Helm Lifting Lab — coach nutrition plan upload form.
//
// Supports three plan types:
//   document — file upload (PDF, image, doc, spreadsheet ≤ 20 MB)
//   link     — external URL
//   note     — free-text body
//
// Coach can title the plan, set visibility, and optionally publish immediately.
// File is read as base64 on the client before being sent to the server action.
// Premium California-modern design: cream bg, Helm green accents, glass card.
// =============================================================================

import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/select';
import {
  IconFileText,
  IconLink,
  IconNote,
  IconUpload,
  IconX,
  IconCheck,
} from '@/components/icons';
import { uploadNutritionPlan } from '@/app/lifting/actions/nutrition';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanType = 'document' | 'link' | 'note';
type Visibility = 'athlete_and_performance_staff' | 'performance_staff' | 'head_coach_only';

interface Props {
  orgId: string;
  /** Called with the newly-created plan id on success. */
  onSuccess?: (planId: string) => void;
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

const PLAN_TYPE_OPTIONS: Array<{ value: PlanType; label: string; icon: React.ReactNode; hint: string }> = [
  {
    value: 'document',
    label: 'Upload file',
    icon: <IconFileText size={16} />,
    hint: 'PDF, image, doc, spreadsheet — up to 20 MB',
  },
  {
    value: 'link',
    label: 'External link',
    icon: <IconLink size={16} />,
    hint: 'Google Docs, Notion, Dropbox, etc.',
  },
  {
    value: 'note',
    label: 'Quick note',
    icon: <IconNote size={16} />,
    hint: 'Write a plan directly — no file needed',
  },
];

const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string }> = [
  { value: 'athlete_and_performance_staff', label: 'Athletes + performance staff' },
  { value: 'performance_staff', label: 'Performance staff only' },
  { value: 'head_coach_only', label: 'Head coach only' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix: "data:<mime>;base64,"
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Failed to read file as base64.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('File read failed.'));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Sub-component: type pill button
// ---------------------------------------------------------------------------

function TypePill({
  option,
  selected,
  onSelect,
}: {
  option: (typeof PLAN_TYPE_OPTIONS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={[
        'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border transition-all duration-150',
        selected
          ? 'border-primary-400 bg-primary-50 text-primary-700 shadow-sm'
          : 'border-warm-200 bg-white text-warm-600 hover:border-warm-300 hover:bg-warm-50',
      ].join(' ')}
      aria-pressed={selected}
    >
      {option.icon}
      {option.label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: file drop zone
// ---------------------------------------------------------------------------

function FileDropZone({
  file,
  onChange,
  onClear,
}: {
  file: File | null;
  onChange: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error(`File too large — maximum is ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    onChange(f);
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
        <IconFileText size={18} className="shrink-0 text-primary-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-warm-900">{file.name}</p>
          <p className="text-xs text-warm-400">{formatBytes(file.size)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          className="shrink-0 rounded-lg p-1 text-warm-400 transition-colors hover:bg-cream-50 hover:text-warm-600"
          aria-label="Remove file"
        >
          <IconX size={14} />
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={[
          'w-full rounded-xl border-2 border-dashed px-6 py-8 transition-all duration-150',
          'flex flex-col items-center gap-2 text-center',
          dragging
            ? 'border-primary-400 bg-primary-50'
            : 'border-warm-200 bg-warm-50/50 hover:border-primary-300 hover:bg-primary-50/40',
        ].join(' ')}
      >
        <span className={dragging ? 'text-primary-500' : 'text-warm-300'}>
          <IconUpload size={24} />
        </span>
        <span className="text-sm font-medium text-warm-600">
          {dragging ? 'Drop to upload' : 'Choose a file or drag it here'}
        </span>
        <span className="text-xs text-warm-400">PDF, image, doc, spreadsheet — up to 20 MB</span>
      </Button>
      <Input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.txt"
        onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
        tabIndex={-1}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NutritionPlanUploader({ orgId, onSuccess, onCancel }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [planType, setPlanType] = useState<PlanType>('document');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('athlete_and_performance_staff');
  const [publish, setPublish] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  // Computed validity
  const isValid =
    title.trim().length > 0 &&
    (planType === 'document'
      ? file !== null
      : planType === 'link'
      ? externalUrl.trim().length > 0
      : noteBody.trim().length > 0);

  function handleTypeChange(next: PlanType) {
    setPlanType(next);
    setFile(null);
    setExternalUrl('');
    setNoteBody('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || isPending) return;

    startTransition(async () => {
      try {
        let fileBase64: string | null = null;
        if (planType === 'document' && file) {
          fileBase64 = await readFileAsBase64(file);
        }

        const result = await uploadNutritionPlan({
          orgId,
          title: title.trim(),
          description: description.trim() || null,
          planType,
          fileBase64,
          fileName: file?.name ?? null,
          fileType: file?.type ?? null,
          fileSizeBytes: file?.size ?? null,
          externalUrl: planType === 'link' ? externalUrl.trim() : null,
          noteBody: planType === 'note' ? noteBody.trim() : null,
          visibility,
          publish,
        });

        if (!result.success) {
          toast.error(result.error ?? 'Failed to upload nutrition plan.');
          return;
        }

        toast.success(publish ? 'Nutrition plan published.' : 'Draft saved.');
        if (result.planId) onSuccess?.(result.planId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        toast.error(msg);
      }
    });
  }

  return (
    <Card variant="raised" noPadding className="overflow-hidden">
      <form onSubmit={handleSubmit} noValidate>
        {/* Header */}
        <div className="border-b border-warm-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-warm-900">Upload nutrition plan</h2>
          <p className="mt-0.5 text-sm text-warm-500">
            Athletes will see this in their performance profile.
          </p>
        </div>

        <div className="space-y-6 p-6">
          {/* Plan type toggle */}
          <div className="space-y-2">
            <p className="block text-xs font-semibold uppercase tracking-wide text-warm-500">
              Type
            </p>
            <div className="flex flex-wrap gap-2">
              {PLAN_TYPE_OPTIONS.map((opt) => (
                <TypePill
                  key={opt.value}
                  option={opt}
                  selected={planType === opt.value}
                  onSelect={() => handleTypeChange(opt.value)}
                />
              ))}
            </div>
            <p className="text-xs text-warm-400">
              {PLAN_TYPE_OPTIONS.find((o) => o.value === planType)?.hint}
            </p>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="np-title" className="block text-sm font-medium text-warm-700">
              Title <span className="text-red-400">*</span>
            </label>
            <Input
              id="np-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pre-season weight gain protocol"
              maxLength={200}
              autoComplete="off"
              className="text-sm"
            />
          </div>

          {/* Type-specific input */}
          <AnimatePresence mode="wait" initial={false}>
            {planType === 'document' && (
              <motion.div
                key="document"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-1.5"
              >
                <p className="block text-sm font-medium text-warm-700">
                  File <span className="text-red-400">*</span>
                </p>
                <FileDropZone
                  file={file}
                  onChange={setFile}
                  onClear={() => setFile(null)}
                />
              </motion.div>
            )}

            {planType === 'link' && (
              <motion.div
                key="link"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-1.5"
              >
                <label htmlFor="np-url" className="block text-sm font-medium text-warm-700">
                  URL <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm-400">
                    <IconLink size={15} />
                  </span>
                  <Input
                    id="np-url"
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://docs.google.com/…"
                    className="pl-8 text-sm"
                    autoComplete="off"
                  />
                </div>
              </motion.div>
            )}

            {planType === 'note' && (
              <motion.div
                key="note"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-1.5"
              >
                <label htmlFor="np-note" className="block text-sm font-medium text-warm-700">
                  Plan details <span className="text-red-400">*</span>
                </label>
                <Textarea
                  id="np-note"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Write the nutrition plan directly here — macros, meal timing, guidelines…"
                  rows={6}
                  maxLength={5000}
                  className="resize-y min-h-[120px] text-sm"
                />
                <p className="text-xs text-warm-400 text-right">
                  {noteBody.length}/5000
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Optional description (document + link) */}
          {planType !== 'note' && (
            <div className="space-y-1.5">
              <label htmlFor="np-desc" className="block text-sm font-medium text-warm-700">
                Description <span className="text-warm-400 font-normal">(optional)</span>
              </label>
              <Textarea
                id="np-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary for athletes…"
                rows={3}
                maxLength={1000}
                className="resize-y min-h-[80px] text-sm"
              />
            </div>
          )}

          {/* Visibility */}
          <div className="space-y-1.5">
            <label htmlFor="np-visibility" className="block text-sm font-medium text-warm-700">
              Visibility
            </label>
            <NativeSelect
              id="np-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              options={VISIBILITY_OPTIONS}
            />
          </div>

          {/* Publish toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <span
              role="switch"
              aria-checked={publish}
              tabIndex={0}
              onClick={() => setPublish((p) => !p)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setPublish((p) => !p); }}
              className={[
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent',
                'transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                publish ? 'bg-primary-500' : 'bg-warm-200',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                  publish ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')}
              />
            </span>
            <span className="text-sm text-warm-700">
              {publish ? 'Publish immediately' : 'Save as draft'}
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-warm-100 bg-warm-50/50 px-6 py-4">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isPending}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={!isValid || isPending}
            className="min-w-[120px]"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Saving…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <IconCheck size={14} />
                {publish ? 'Publish plan' : 'Save draft'}
              </span>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
