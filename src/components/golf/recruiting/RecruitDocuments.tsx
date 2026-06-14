'use client';

/**
 * RecruitDocuments — per-recruit document shelf for the legacy Recruiting HQ drawer.
 *
 * Edit-mode only (uploads need a saved recruit id). Coach-only material: notes,
 * schedules, transcripts, film. Files live in the private `recruit-documents`
 * bucket; downloads use short-lived signed URLs (getRecruitDocumentUrl).
 * Fairway parity component: FairwayRecruitDocuments.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { FileText, Download, Trash2, Paperclip, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { openExternalUrl } from '@/lib/utils/capacitor';
import {
  getRecruitDocuments,
  uploadRecruitDocument,
  deleteRecruitDocument,
  getRecruitDocumentUrl,
  type RecruitDocument,
} from '@/app/golf/actions/recruit-documents';
import {
  RECRUIT_DOC_CATEGORIES,
  type RecruitDocCategory,
} from '@/app/golf/actions/recruit-documents-categories';

const CATEGORY_LABEL: Record<RecruitDocCategory, string> = {
  note: 'Note',
  schedule: 'Schedule',
  transcript: 'Transcript',
  film: 'Film',
  other: 'Other',
};

const CATEGORY_CHIP: Record<RecruitDocCategory, string> = {
  note: 'bg-warm-100 text-warm-600',
  schedule: 'bg-sky-50 text-sky-700',
  transcript: 'bg-primary-50 text-primary-700',
  film: 'bg-amber-50 text-amber-700',
  other: 'bg-warm-100 text-warm-600',
};

const ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.gif,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

const INPUT_CLASS = cn(
  'w-full px-3 py-2 rounded-xl bg-warm-50 border-0 text-sm text-warm-900',
  'placeholder:text-warm-400 transition-colors',
  'focus:bg-white focus:ring-2 focus:ring-primary-100 focus:outline-none',
  'disabled:opacity-60 disabled:cursor-not-allowed',
);

export function RecruitDocuments({ recruitId }: { recruitId: string }) {
  const [docs, setDocs] = useState<RecruitDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RecruitDocCategory>('note');
  const [uploading, setUploading] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getRecruitDocuments(recruitId);
    if (res.success) {
      setDocs(res.data ?? []);
      setLoadError(null);
    } else {
      setLoadError(res.error ?? 'Could not load documents');
    }
    setLoading(false);
  }, [recruitId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setPendingFile(file);
    setTitle(stripExt(file.name));
    setCategory('note');
    e.target.value = '';
  };

  const cancelStaged = () => {
    setPendingFile(null);
    setTitle('');
    setCategory('note');
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const res = await uploadRecruitDocument(recruitId, pendingFile, { title, category });
      if (!res.success) throw new Error(res.error);
      toast.success('Uploaded', `${title || pendingFile.name} was added.`);
      cancelStaged();
      await load();
    } catch (err) {
      toast.error('Upload failed', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: RecruitDocument) => {
    setBusyId(doc.id);
    try {
      const res = await getRecruitDocumentUrl(doc.id);
      if (!res.success || !res.data) throw new Error(res.error);
      // Capacitor-safe: in-app browser on native iOS, new tab on web.
      await openExternalUrl(res.data.url);
    } catch (err) {
      toast.error('Could not open', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc: RecruitDocument) => {
    setBusyId(doc.id);
    try {
      const res = await deleteRecruitDocument(doc.id);
      if (!res.success) throw new Error(res.error);
      toast.success('Removed', `${doc.title} was deleted.`);
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      toast.error('Delete failed', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="border-t border-warm-200/60 pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80 text-warm-500">
          <Paperclip className="w-3.5 h-3.5" />
          Documents
          {!loading && docs.length > 0 ? (
            <span className="tabular-nums text-warm-400">{docs.length}</span>
          ) : null}
        </span>
        {!pendingFile ? (
          <Button
            variant="secondary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Add document
          </Button>
        ) : null}
        {/* Native file input — the UI Input primitive has no file variant. */}
        {/* eslint-disable-next-line helm/no-raw-input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={onPickFile}
        />
      </div>

      {/* Staged upload form */}
      {pendingFile ? (
        <div className="mb-4 rounded-xl border border-warm-200/70 bg-warm-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 shrink-0 text-primary-600" />
            <span className="min-w-0 flex-1 truncate text-sm text-warm-700">{pendingFile.name}</span>
            <span className="tabular-nums text-xs text-warm-500">{formatSize(pendingFile.size)}</span>
          </div>

          <label className="block">
            <span className="block text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80 text-warm-500 mb-1.5">
              Title
            </span>
            {/* Raw input for visual parity with the sibling fields in the legacy
                RecruitFormSheet drawer (shared INPUT_CLASS look). */}
            {/* eslint-disable-next-line helm/no-raw-input */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={uploading}
              placeholder="Fall 2026 tournament schedule"
              className={INPUT_CLASS}
            />
          </label>

          <div>
            <span className="block text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80 text-warm-500 mb-1.5">
              Category
            </span>
            <div className="flex flex-wrap gap-2">
              {RECRUIT_DOC_CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <Button
                    key={c}
                    variant="ghost"
                    type="button"
                    onClick={() => setCategory(c)}
                    disabled={uploading}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg ring-1 ring-inset transition-colors',
                      active
                        ? 'bg-primary-600 text-white ring-primary-600'
                        : 'bg-cream-50 text-warm-600 ring-warm-200 hover:bg-warm-50',
                    )}
                  >
                    {CATEGORY_LABEL[c]}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              type="button"
              onClick={cancelStaged}
              disabled={uploading}
              className="px-3 py-1.5 text-xs font-medium text-warm-600 hover:text-warm-900"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* List */}
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-warm-100 skeleton-shimmer" />
          ))}
        </div>
      ) : loadError ? (
        <p className="text-sm text-rose-600">{loadError}</p>
      ) : docs.length === 0 && !pendingFile ? (
        <p className="text-sm text-warm-500">
          No documents yet. Upload notes, schedules, transcripts, or film for this prospect.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => {
            const cat = (CATEGORY_LABEL[doc.category as RecruitDocCategory] ? doc.category : 'other') as RecruitDocCategory;
            const confirming = confirmDeleteId === doc.id;
            const rowBusy = busyId === doc.id;
            return (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-xl border border-warm-200/70 bg-cream-50 px-3 py-2.5"
              >
                <FileText className="w-5 h-5 shrink-0 text-warm-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-warm-900">{doc.title}</span>
                    <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-eyebrow font-medium', CATEGORY_CHIP[cat])}>
                      {CATEGORY_LABEL[cat]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-warm-500">
                    {[formatSize(doc.file_size), formatDate(doc.created_at)].filter(Boolean).join(' · ')}
                  </p>
                </div>

                {confirming ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => handleDelete(doc)}
                      disabled={rowBusy}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {rowBusy ? '…' : 'Confirm'}
                    </Button>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={rowBusy}
                      className="px-2 py-1 text-xs text-warm-500 hover:text-warm-900"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => handleDownload(doc)}
                      disabled={rowBusy}
                      aria-label={`Download ${doc.title}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg text-warm-600 hover:bg-warm-100"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => setConfirmDeleteId(doc.id)}
                      disabled={rowBusy}
                      aria-label={`Delete ${doc.title}`}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default RecruitDocuments;
