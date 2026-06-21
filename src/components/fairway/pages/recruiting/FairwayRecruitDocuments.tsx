'use client';

/**
 * Fairway · Recruiting · FairwayRecruitDocuments — per-recruit document shelf.
 *
 * Lives inside the recruit edit drawer (edit mode only — uploads need a saved
 * recruit id). Coaches upload notes / schedules / transcripts / film and they're
 * organized per prospect. Files are coach-only (golf_recruit_documents has no
 * player RLS) and live in the private `recruit-documents` bucket; downloads go
 * through short-lived signed URLs via getRecruitDocumentUrl.
 */

import * as React from 'react';
import { FileText, Download, Trash2, Paperclip, UploadCloud } from 'lucide-react';

import { Button } from '@/components/fairway/controls/button';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import type { FwStatusTone } from '@/components/fairway/controls';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Input } from '@/components/fairway/forms/Input';
import { FormField } from '@/components/fairway/forms/FormField';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { openExternalUrl, isNativeApp } from '@/lib/utils/capacitor';
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

const CATEGORY_META: Record<RecruitDocCategory, { label: string; tone: FwStatusTone }> = {
  note: { label: 'Note', tone: 'neutral' },
  schedule: { label: 'Schedule', tone: 'info' },
  transcript: { label: 'Transcript', tone: 'accent' },
  film: { label: 'Film', tone: 'warning' },
  other: { label: 'Other', tone: 'neutral' },
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

function categoryMeta(category: string) {
  return CATEGORY_META[(category as RecruitDocCategory)] ?? CATEGORY_META.other;
}

export function FairwayRecruitDocuments({ recruitId }: { recruitId: string }) {
  const [docs, setDocs] = React.useState<RecruitDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Add-document staging
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<RecruitDocCategory>('note');
  const [uploading, setUploading] = React.useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
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

  React.useEffect(() => {
    void load();
  }, [load]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setPendingFile(file);
    setTitle(stripExt(file.name));
    setCategory('note');
    // allow re-picking the same file later
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
      fairwayToast.success('Uploaded', { description: `${title || pendingFile.name} was added.` });
      cancelStaged();
      await load();
    } catch (err) {
      fairwayToast.error('Upload failed', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: RecruitDocument) => {
    setBusyId(doc.id);
    try {
      const res = await getRecruitDocumentUrl(doc.id);
      if (!res.success || !res.data) throw new Error(res.error);
      if (isNativeApp()) {
        // Native iOS: in-app browser (SFSafariViewController) is not subject to
        // the web popup blocker, so opening after the await is fine.
        await openExternalUrl(res.data.url);
      } else {
        // Web: the signed URL resolves AFTER an await, so window.open('_blank')
        // is outside the user-gesture window and Safari pop-up-blocks it. An
        // anchor download is a same-page navigation that survives the await.
        const link = window.document.createElement('a');
        link.href = res.data.url;
        link.download = res.data.fileName ?? doc.title;
        link.rel = 'noopener';
        link.click();
      }
    } catch (err) {
      fairwayToast.error('Could not open', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc: RecruitDocument) => {
    setBusyId(doc.id);
    try {
      const res = await deleteRecruitDocument(doc.id);
      if (!res.success) throw new Error(res.error);
      fairwayToast.success('Removed', { description: `${doc.title} was deleted.` });
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      fairwayToast.error('Delete failed', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="border-t border-border-subtle pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-text-tertiary" />
          <h3 className="font-fw-sans text-body-sm font-semibold text-text-secondary">
            Documents
          </h3>
          {!loading && docs.length > 0 ? (
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {docs.length}
            </span>
          ) : null}
        </div>
        {!pendingFile ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<UploadCloud className="h-4 w-4" />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Add document
          </Button>
        ) : null}
        {/* Native file input — the Fairway/UI Input primitive has no file variant. */}
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
        <Surface elevation="border" padding="md" className="mb-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-accent-700" />
            <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-secondary">
              {pendingFile.name}
            </span>
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {formatSize(pendingFile.size)}
            </span>
          </div>

          <FormField label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={uploading}
              placeholder="Fall 2026 tournament schedule"
            />
          </FormField>

          <FormField label="Category" className="mt-3">
            <div className="flex flex-wrap gap-2">
              {RECRUIT_DOC_CATEGORIES.map((c) => (
                <FilterPill
                  key={c}
                  size="sm"
                  selected={category === c}
                  onClick={() => setCategory(c)}
                  disabled={uploading}
                >
                  {CATEGORY_META[c].label}
                </FilterPill>
              ))}
            </div>
          </FormField>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelStaged} disabled={uploading}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              busy={uploading}
              onClick={handleUpload}
              leftIcon={<UploadCloud className="h-4 w-4" />}
            >
              Upload
            </Button>
          </div>
        </Surface>
      ) : null}

      {/* List */}
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-tint" />
          ))}
        </div>
      ) : loadError ? (
        <p className="font-fw-sans text-body-sm text-fw-danger">{loadError}</p>
      ) : docs.length === 0 && !pendingFile ? (
        <p className="font-fw-sans text-body-sm text-text-tertiary">
          No documents yet. Upload notes, schedules, transcripts, or film for this prospect.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => {
            const meta = categoryMeta(doc.category);
            const confirming = confirmDeleteId === doc.id;
            const rowBusy = busyId === doc.id;
            return (
              <li key={doc.id}>
                <Surface elevation="border" padding="sm" className="flex items-center gap-3">
                  <FileText className="h-5 w-5 shrink-0 text-text-tertiary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                        {doc.title}
                      </span>
                      <StatusPill tone={meta.tone} size="sm" className="shrink-0">
                        {meta.label}
                      </StatusPill>
                    </div>
                    <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
                      {[formatSize(doc.file_size), formatDate(doc.created_at)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  {confirming ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        busy={rowBusy}
                        onClick={() => handleDelete(doc)}
                      >
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={rowBusy}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        busy={rowBusy}
                        onClick={() => handleDownload(doc)}
                        leftIcon={<Download className="h-4 w-4" />}
                        aria-label={`Download ${doc.title}`}
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(doc.id)}
                        disabled={rowBusy}
                        aria-label={`Delete ${doc.title}`}
                        className="text-fw-danger hover:bg-fw-danger-bg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </Surface>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default FairwayRecruitDocuments;
