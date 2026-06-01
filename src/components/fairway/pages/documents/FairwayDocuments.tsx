'use client';

/**
 * ============================================================================
 * Fairway · pages/documents · FairwayDocuments  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the SHARED coach+player /golf/dashboard/documents
 * route — the team's files / resources surface. It re-skins the legacy
 * DocumentsClient onto the warm-matte Fairway design system WITHOUT changing
 * any data or logic: the server page fetches the SAME golf_documents list
 * (players are pre-filtered to is_public=true server-side) and passes it
 * straight through with the resolved role.
 *
 * ── EVERY data point + interaction is preserved (presentation rebuild) ──────
 *   • Document grid: title · file-type icon/Chip · size · relative date,
 *     description, category Chip, folder Chip, version badge, "Coach only" pill.
 *   • Upload (coach): hidden file input + multi-file pending list + per-file
 *     title edit + category/folder/visibility + progress bar. Reuses the legacy
 *     uploadGolfDocument + createGolfDocument actions VERBATIM.
 *   • Folders (coach): create, navigate-into, move-to-folder, "view unfiled".
 *   • Search · category filter pills · sort (newest/oldest/name/size).
 *   • Preview (everyone) → legacy DocumentPreview (its own preview logic reused).
 *   • Version history / upload-new-version / edit details / delete-with-confirm
 *     (coach) → reuse VersionHistory + UploadNewVersionModal + the unchanged
 *     deleteGolfDocument / updateGolfDocument actions. NO destructive writes.
 *   • Drag & drop to upload (coach). Download via `<a download>` (preserved).
 *
 * ── ROLE FORK ───────────────────────────────────────────────────────────────
 *   Coaches get the full toolbar (upload, new folder), per-card actions menu,
 *   and edit/delete/move/version flows. Players get a read+preview+download
 *   surface only (they only ever receive public documents from the server).
 *
 * Tokens / primitives ONLY (cream-not-white, Fraunces masthead): bg-canvas/
 * surface/surface-sunken, text-text-*, border-border-*, accent-* (helm green),
 * fw-warning/danger/success, rounded-card/fw-md, shadow-flat/soft, font-fw-*,
 * tabular-nums. NO glass / blur / warm-* / primary-* / surface-matte. Toasts via
 * fairwayToast only. Honest emptiness (em-dash; EmptyState when empty).
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * documents/page.tsx (by DIRECT PATH). Renders inside a `.fairway-ds` scope on a
 * `bg-canvas` page.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Folder } from 'lucide-react';

import {
  IconFolder,
  IconFolderPlus,
  IconUpload,
  IconDownload,
  IconEye,
  IconClock,
  IconEdit,
  IconTrash,
  IconLayers,
  IconArrowLeft,
  IconSearch,
  IconX,
  IconPlus,
  IconFile,
  IconFileText,
  IconImage,
  IconVideo,
  IconFileSpreadsheet,
  IconMoreVertical,
} from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import {
  uploadGolfDocument,
  createGolfDocument,
  deleteGolfDocument,
  updateGolfDocument,
  uploadNewVersion,
  getVersionHistory,
} from '@/app/golf/actions/documents';
import type { DocumentVersion, GolfDocument } from '@/lib/types/golf';
import { DocumentPreview } from '@/components/golf/documents/DocumentPreview';
import { VersionHistory } from '@/components/golf/documents/VersionHistory';
import { UploadNewVersionModal } from '@/components/golf/documents/UploadNewVersionModal';

import {
  ViewHeader,
  Surface,
  Button,
  IconButton,
  Chip,
  StatusPill,
  EmptyState,
  InlineNotice,
  FilterPill,
  Switch,
  Select,
  Input,
  TextArea,
  ModalShell,
  fairwayToast,
} from '@/components/fairway';

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the page resolves role + fetches the SAME golf_documents list and
 * passes it straight through (players already filtered to public server-side).
 * ────────────────────────────────────────────────────────────────────────── */
export interface FairwayDocument {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  is_public: boolean | null;
  created_at: string | null;
  uploaded_by: string | null;
  current_version_id?: string | null;
  version_count?: number | null;
  folder?: string | null;
}

export interface FairwayDocumentsProps {
  documents: FairwayDocument[];
  coachId: string;
  teamId: string;
  isCoach: boolean;
}

const CATEGORIES = ['Schedule', 'Rules', 'Forms', 'Training', 'Other'] as const;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'size', label: 'Largest first' },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['value'];

const UPLOAD_ACCEPT =
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*,text/plain,video/mp4,video/webm';

/* ───────────────────────────────────────────────────────────────────────────
 * File-type → Fairway iconography + label + Chip tone (token tones only).
 * ────────────────────────────────────────────────────────────────────────── */
type FwTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

function fileIcon(fileType: string | null, size = 20) {
  if (!fileType) return <IconFile size={size} />;
  if (fileType === 'application/pdf') return <IconFileText size={size} />;
  if (fileType.startsWith('image/')) return <IconImage size={size} />;
  if (fileType.includes('word') || fileType.includes('document')) return <IconFileText size={size} />;
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType === 'text/csv')
    return <IconFileSpreadsheet size={size} />;
  if (fileType.startsWith('video/')) return <IconVideo size={size} />;
  if (fileType.startsWith('text/')) return <IconFileText size={size} />;
  return <IconFile size={size} />;
}

function fileTypeLabel(fileType: string | null): string {
  if (!fileType) return 'File';
  if (fileType === 'application/pdf') return 'PDF';
  if (fileType.startsWith('image/')) return 'Image';
  if (fileType.includes('word') || fileType.includes('document')) return 'Document';
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType === 'text/csv') return 'Spreadsheet';
  if (fileType.startsWith('video/')) return 'Video';
  if (fileType.startsWith('text/')) return 'Text';
  return 'File';
}

// File-type chips use the restrained Fairway palette: accent (helm green) for
// the "primary" doc kinds, neutral for the rest. Color is never the only
// channel — the icon + label carry the meaning too.
function fileTypeTone(fileType: string | null): FwTone {
  if (!fileType) return 'neutral';
  if (fileType === 'application/pdf') return 'accent';
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType === 'text/csv') return 'success';
  return 'neutral';
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── pending-upload row shape (mirrors the legacy PendingFile) ─────────────── */
interface PendingFile {
  file: File;
  title: string;
  id: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */
export function FairwayDocuments({
  documents: initialDocuments,
  coachId,
  teamId,
  isCoach,
}: FairwayDocumentsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState(initialDocuments);
  // Keep local state in sync after router.refresh() re-runs the server fetch.
  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  // ── Upload state ──────────────────────────────────────────────────────────
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploadIsPublic, setUploadIsPublic] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ── Folder state ────────────────────────────────────────────────────────--
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [manualFolders, setManualFolders] = useState<string[]>([]);

  useEffect(() => {
    if (!showNewFolderModal) return;
    const frame = window.requestAnimationFrame(() => {
      newFolderInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showNewFolderModal]);

  // ── Search / filter / sort ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('newest');

  // ── Edit state ──────────────────────────────────────────────────────────--
  const [editingDocument, setEditingDocument] = useState<FairwayDocument | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    category: '',
    is_public: true,
    folder: '',
  });
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── Preview / version-history / new-version state ───────────────────────--
  const [previewDocument, setPreviewDocument] = useState<FairwayDocument | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [versionHistoryDocument, setVersionHistoryDocument] = useState<FairwayDocument | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [uploadVersionDocument, setUploadVersionDocument] = useState<FairwayDocument | null>(null);
  const [showUploadVersionModal, setShowUploadVersionModal] = useState(false);

  // ── Move-to-folder + delete-confirm ─────────────────────────────────────--
  const [movingDocument, setMovingDocument] = useState<FairwayDocument | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState('');
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<FairwayDocument | null>(null);

  // ── Derived values (predicates identical to the legacy page) ────────────--
  const folders = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => {
      if (d.folder) set.add(d.folder);
    });
    manualFolders.forEach((f) => set.add(f));
    return Array.from(set).sort();
  }, [documents, manualFolders]);

  const filteredDocuments = useMemo(() => {
    const filtered = documents.filter((doc) => {
      const matchesSearch =
        !searchQuery ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.description != null && doc.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = !categoryFilter || doc.category === categoryFilter;
      const matchesFolder =
        currentFolder === null
          ? true
          : currentFolder === ''
            ? !doc.folder
            : doc.folder === currentFolder;
      return matchesSearch && matchesCategory && matchesFolder;
    });
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return (b.created_at || '').localeCompare(a.created_at || '');
        case 'oldest':
          return (a.created_at || '').localeCompare(b.created_at || '');
        case 'name':
          return a.title.localeCompare(b.title);
        case 'size':
          return (b.file_size || 0) - (a.file_size || 0);
        default:
          return 0;
      }
    });
  }, [documents, searchQuery, categoryFilter, currentFolder, sortBy]);

  const inFolder = currentFolder !== null && currentFolder !== '';

  // ── Drag & drop (coach only) ────────────────────────────────────────────--
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setPendingFiles((prev) => [
        ...prev,
        ...files.map((file) => ({ file, title: file.name.replace(/\.[^/.]+$/, ''), id: crypto.randomUUID() })),
      ]);
      setShowUploadModal(true);
    }
  }, []);

  // ── File selection ──────────────────────────────────────────────────────--
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingFiles((prev) => [
        ...prev,
        ...files.map((file) => ({ file, title: file.name.replace(/\.[^/.]+$/, ''), id: crypto.randomUUID() })),
      ]);
      setShowUploadModal(true);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const removePendingFile = (id: string) => setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  const updatePendingTitle = (id: string, title: string) =>
    setPendingFiles((prev) => prev.map((f) => (f.id === id ? { ...f, title } : f)));

  const closeUploadModal = () => {
    if (uploading) return;
    setShowUploadModal(false);
    setPendingFiles([]);
    setUploadError(null);
  };

  // ── Upload (multi-file) — reuses uploadGolfDocument + createGolfDocument ──--
  const handleUpload = async () => {
    if (pendingFiles.length === 0) {
      setUploadError('Please select at least one file.');
      return;
    }
    if (pendingFiles.some((f) => !f.title.trim())) {
      setUploadError('All files must have a title.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const pf = pendingFiles[i]!;
        setUploadProgress(Math.round((i / pendingFiles.length) * 100));

        const uploadResult = await uploadGolfDocument(pf.file, teamId);
        if (!uploadResult.success) {
          setUploadError(`Failed to upload "${pf.title}": ${uploadResult.error}`);
          setUploading(false);
          return;
        }

        const folderValue = uploadFolder || (inFolder && currentFolder ? currentFolder : undefined);
        const createResult = await createGolfDocument({
          team_id: teamId,
          title: pf.title,
          file_url: uploadResult.file_url!,
          file_type: pf.file.type,
          file_size: pf.file.size,
          category: uploadCategory || undefined,
          player_visible: uploadIsPublic,
          uploaded_by: coachId,
          folder: folderValue,
        });
        if (!createResult.success) {
          setUploadError(`Failed to create record for "${pf.title}": ${createResult.error}`);
          setUploading(false);
          return;
        }
      }

      setUploadProgress(100);
      const count = pendingFiles.length;
      setPendingFiles([]);
      setUploadCategory('');
      setUploadFolder('');
      setUploadIsPublic(true);
      setShowUploadModal(false);
      fairwayToast.success(`${count} file${count !== 1 ? 's' : ''} uploaded`);
      router.refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'An error occurred during upload.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ── Folder creation (local; persisted when a doc lands in it) ────────────--
  const handleCreateFolder = () => {
    const folderName = newFolderName.trim();
    if (!folderName) return;
    if (folders.includes(folderName)) return;
    setManualFolders((prev) => [...prev, folderName]);
    setCurrentFolder(folderName);
    setUploadFolder(folderName);
    setNewFolderName('');
    setShowNewFolderModal(false);
  };

  // ── Move to folder — reuses updateGolfDocument (no destructive write) ────--
  const openMoveModal = (doc: FairwayDocument) => {
    setMovingDocument(doc);
    setMoveTargetFolder(doc.folder || '');
  };
  const handleMoveToFolder = async () => {
    if (!movingDocument) return;
    const target = movingDocument;
    const newFolder = moveTargetFolder || null;
    setMovingDocument(null);
    const result = await updateGolfDocument({ id: target.id, folder: newFolder });
    if (result.success) {
      setDocuments((docs) => docs.map((d) => (d.id === target.id ? { ...d, folder: newFolder } : d)));
      fairwayToast.success('Document moved');
      router.refresh();
    } else {
      fairwayToast.error(result.error || 'Failed to move document');
    }
  };

  // ── Delete — reuses deleteGolfDocument verbatim ──────────────────────────--
  const handleDeleteConfirmed = async () => {
    if (!deleteConfirmDoc) return;
    const docId = deleteConfirmDoc.id;
    setDeleteConfirmDoc(null);
    const result = await deleteGolfDocument(docId);
    if (result.success) {
      setDocuments((docs) => docs.filter((d) => d.id !== docId));
      fairwayToast.success('Document deleted');
      router.refresh();
    } else {
      fairwayToast.error(result.error || 'Failed to delete');
    }
  };

  // ── Edit details — reuses updateGolfDocument verbatim ────────────────────--
  const openEditModal = (doc: FairwayDocument) => {
    setEditingDocument(doc);
    setEditForm({
      title: doc.title,
      description: doc.description || '',
      category: doc.category || '',
      is_public: doc.is_public ?? true,
      folder: doc.folder || '',
    });
    setEditError(null);
  };
  const handleUpdate = async () => {
    if (!editingDocument || !editForm.title.trim()) {
      setEditError('Please enter a title.');
      return;
    }
    setUpdating(true);
    setEditError(null);
    try {
      const result = await updateGolfDocument({
        id: editingDocument.id,
        title: editForm.title,
        description: editForm.description || undefined,
        category: editForm.category || undefined,
        player_visible: editForm.is_public,
        folder: editForm.folder || null,
      });
      if (!result.success) {
        setEditError(result.error || 'Failed to update.');
        return;
      }
      const id = editingDocument.id;
      setDocuments((docs) =>
        docs.map((d) =>
          d.id === id
            ? {
                ...d,
                title: editForm.title,
                description: editForm.description || null,
                category: editForm.category || null,
                is_public: editForm.is_public,
                folder: editForm.folder || null,
              }
            : d,
        ),
      );
      setEditingDocument(null);
      fairwayToast.success('Document updated');
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setUpdating(false);
    }
  };

  // ── Preview / version history (preview logic reused from legacy components) ─
  const openPreview = (doc: FairwayDocument) => {
    setPreviewDocument(doc);
    setShowPreview(true);
  };
  const closePreview = () => {
    setShowPreview(false);
    setPreviewDocument(null);
  };

  const openVersionHistory = useCallback(async (doc: FairwayDocument) => {
    setVersionHistoryDocument(doc);
    setShowVersionHistory(true);
    const result = await getVersionHistory(doc.id);
    setVersions(result.success && result.versions ? result.versions : []);
  }, []);
  const closeVersionHistory = () => {
    setShowVersionHistory(false);
    setVersionHistoryDocument(null);
    setVersions([]);
  };
  const handlePreviewVersion = (version: DocumentVersion) => {
    if (!versionHistoryDocument || !version.file_url) return;
    setPreviewDocument({ ...versionHistoryDocument, file_url: version.file_url, file_size: version.file_size });
    setShowPreview(true);
  };

  const openUploadVersionModal = (doc: FairwayDocument) => {
    setUploadVersionDocument(doc);
    setShowUploadVersionModal(true);
  };
  const handleUploadNewVersion = async (file: File, changeNotes: string) => {
    if (!uploadVersionDocument) return;
    const target = uploadVersionDocument;
    const result = await uploadNewVersion(target.id, file, teamId, coachId, changeNotes);
    if (!result.success) throw new Error(result.error || 'Failed to upload new version');
    setDocuments((docs) =>
      docs.map((d) =>
        d.id === target.id
          ? {
              ...d,
              file_url: result.version?.file_url || d.file_url,
              file_size: result.version?.file_size ?? d.file_size,
              version_count: (d.version_count || 1) + 1,
            }
          : d,
      ),
    );
    setShowUploadVersionModal(false);
    setUploadVersionDocument(null);
    fairwayToast.success('New version uploaded');
    router.refresh();
  };

  // Folder <Select> options (shared by upload / edit / move).
  const folderSelectOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = folders.map((f) => ({ value: f, label: f }));
    if (inFolder && currentFolder && !folders.includes(currentFolder)) {
      opts.push({ value: currentFolder, label: `${currentFolder} (new)` });
    }
    return opts;
  }, [folders, inFolder, currentFolder]);

  const totalCount = documents.length;
  const folderCount = folders.length;

  // ── ONE coach-only primary action (upload) ───────────────────────────────--
  const uploadCta = isCoach ? (
    <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
      <IconUpload size={16} />
      <span>Upload</span>
    </Button>
  ) : undefined;

  // Honest count meta — rendered only when there's something to count.
  const meta =
    totalCount > 0 ? (
      <>
        <span className="tabular-nums">
          {totalCount} file{totalCount !== 1 ? 's' : ''}
        </span>
        {folderCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {folderCount} folder{folderCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </>
    ) : undefined;

  return (
    <div
      role="region"
      aria-label="Team documents"
      className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6 md:py-8 pb-24"
      onDragOver={isCoach ? handleDragOver : undefined}
      onDragLeave={isCoach ? handleDragLeave : undefined}
      onDrop={isCoach ? handleDrop : undefined}
    >
      {/* ── Drag overlay (coach only) ──────────────────────────────────────── */}
      {isDragOver && isCoach && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-canvas/70">
          <div className="rounded-card border-2 border-dashed border-accent-400 bg-surface px-12 py-10 text-center shadow-soft">
            <IconUpload size={40} className="mx-auto mb-3 text-accent-600" />
            <p className="font-fw-display text-h3 font-medium text-text-primary">Drop files to upload</p>
            <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">Release to add files</p>
          </div>
        </div>
      )}

      {/* ── ONE MASTHEAD ─────────────────────────────────────────────────────── */}
      <ViewHeader
        eyebrow={inFolder ? `Documents · ${currentFolder}` : 'Documents'}
        title={inFolder ? (currentFolder as string) : 'Team documents.'}
        description={
          isCoach
            ? 'Plans, releases, and forms — all in one place. Upload files and organize them into folders for your team.'
            : 'Plans, releases, and forms your coach shares with the team show up here.'
        }
        meta={meta}
        primaryAction={uploadCta}
        secondaryActions={
          isCoach && !inFolder ? (
            <Button variant="secondary" onClick={() => setShowNewFolderModal(true)}>
              <IconFolderPlus size={16} />
              <span className="hidden sm:inline">New folder</span>
            </Button>
          ) : undefined
        }
      />

      {/* Back-nav out of a folder. */}
      {inFolder && (
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCurrentFolder(null);
              setSearchQuery('');
              setCategoryFilter('');
            }}
          >
            <IconArrowLeft size={15} />
            <span>All documents</span>
          </Button>
        </div>
      )}

      {/* Hidden multi-file input (coach). */}
      <Input
        ref={fileInputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        onChange={handleFilesSelected}
        className="hidden"
      />

      {/* ── Folder grid (root level only) ──────────────────────────────────── */}
      {currentFolder === null && folders.length > 0 && (
        <section className="mt-8 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <SectionHeading>Folders</SectionHeading>
            <Button variant="ghost" size="sm" onClick={() => setCurrentFolder('')}>
              View unfiled
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {folders.map((folder) => {
              const count = documents.filter((d) => d.folder === folder).length;
              return (
                <Surface
                  key={folder}
                  as="button"
                  interactive
                  elevation="border"
                  padding="sm"
                  className="group flex w-full items-center gap-3 text-left"
                  onClick={() => {
                    setCurrentFolder(folder);
                    setSearchQuery('');
                    setCategoryFilter('');
                  }}
                >
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-fw-md bg-accent-50 text-accent-700">
                    <IconFolder size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
                      {folder}
                    </span>
                    <span className="block font-fw-sans text-caption text-text-tertiary tabular-nums">
                      {count} file{count !== 1 ? 's' : ''}
                    </span>
                  </span>
                </Surface>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Search / filter / sort toolbar ─────────────────────────────────── */}
      {documents.length > 0 && (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={inFolder ? `Search in ${currentFolder}…` : 'Search documents…'}
              enterKeyHint="search"
              autoComplete="off"
              aria-label="Search documents"
              className={cn(
                'h-11 w-full rounded-fw-md border border-border-subtle bg-surface-sunken pl-9 pr-9',
                'font-fw-sans text-body-sm text-text-primary placeholder:text-text-tertiary',
                'outline-none transition-[border-color,box-shadow] [transition-duration:var(--fw-dur-fast)]',
                'hover:border-border-strong focus-visible:border-border-focus focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
              )}
            />
            {searchQuery && (
              <IconButton
                aria-label="Clear search"
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2"
              >
                <IconX size={15} />
              </IconButton>
            )}
          </div>

          {/* Category filter pills (only those with results in scope) */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {CATEGORIES.map((cat) => {
              const count = documents.filter(
                (d) =>
                  d.category === cat &&
                  (currentFolder === null
                    ? true
                    : currentFolder === ''
                      ? !d.folder
                      : d.folder === currentFolder),
              ).length;
              if (count === 0) return null;
              return (
                <FilterPill
                  key={cat}
                  size="sm"
                  selected={categoryFilter === cat}
                  count={count}
                  onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                >
                  {cat}
                </FilterPill>
              );
            })}
          </div>

          {/* Sort */}
          <div className="w-full flex-shrink-0 sm:w-[150px]">
            <Select
              size="sm"
              value={sortBy}
              onValueChange={(v: string | null) => {
                void triggerHaptic('light');
                if (v) setSortBy(v as SortKey);
              }}
              options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              aria-label="Sort documents"
            />
          </div>
        </div>
      )}

      {/* ── Section header for files at root when folders exist ────────────── */}
      {currentFolder === null && folders.length > 0 && documents.length > 0 && (
        <div className="mt-6 px-1">
          <SectionHeading>
            {searchQuery || categoryFilter
              ? `${filteredDocuments.length} result${filteredDocuments.length !== 1 ? 's' : ''}`
              : 'All files'}
          </SectionHeading>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {documents.length === 0 && currentFolder === null ? (
        // FULL-EMPTY — no documents at all.
        <div className="mt-8">
          <Surface elevation="shadow" padding="lg">
            <EmptyState
              icon={Folder}
              title="No documents yet"
              description={
                isCoach
                  ? 'Upload documents to share with your team. Drag & drop files anywhere, or click upload.'
                  : 'Your team files and resources will appear here once your coach shares them.'
              }
              action={
                isCoach ? (
                  <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                    <IconUpload size={16} />
                    <span>Upload first document</span>
                  </Button>
                ) : undefined
              }
            />
          </Surface>
        </div>
      ) : filteredDocuments.length === 0 ? (
        // SCOPED-EMPTY — empty folder, or filters/search returned nothing.
        <div className="mt-8">
          <Surface elevation="border" padding="lg">
            {inFolder && !searchQuery && !categoryFilter ? (
              <EmptyState
                variant="subtle"
                icon={Folder}
                title="This folder is empty"
                description={
                  isCoach
                    ? 'Upload files to get started, or drag & drop them here.'
                    : 'No files have been added to this folder yet.'
                }
                action={
                  isCoach ? (
                    <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                      <IconUpload size={16} />
                      <span>Upload to {currentFolder}</span>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                variant="search"
                title="No matching documents"
                description="Try adjusting your search or filters."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchQuery('');
                      setCategoryFilter('');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )}
          </Surface>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredDocuments.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              isCoach={isCoach}
              currentFolder={currentFolder}
              onPreview={() => openPreview(doc)}
              onVersionHistory={() => openVersionHistory(doc)}
              onUploadVersion={() => openUploadVersionModal(doc)}
              onEdit={() => openEditModal(doc)}
              onMove={() => openMoveModal(doc)}
              onDelete={() => setDeleteConfirmDoc(doc)}
            />
          ))}
        </div>
      )}

      {/* ════════════════════ OVERLAYS ════════════════════ */}

      {/* ── New folder (coach) ─────────────────────────────────────────────── */}
      <ModalShell
        open={showNewFolderModal}
        onOpenChange={(o) => {
          if (!o) {
            setShowNewFolderModal(false);
            setNewFolderName('');
          }
        }}
        size="sm"
        title="Create folder"
        description="Group related documents together. Folders save once a file lands in them."
      >
        <ModalShell.Body className="flex flex-col gap-2">
          <label htmlFor="new-folder-name" className="font-fw-sans text-body-sm font-medium text-text-primary">
            Folder name
          </label>
          <Input
            id="new-folder-name"
            ref={newFolderInputRef}
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderName.trim() && !folders.includes(newFolderName.trim())) {
                handleCreateFolder();
              }
            }}
            placeholder="e.g. Practice Plans"
            autoComplete="off"
            className={cn(
              'h-11 w-full rounded-fw-md border border-border-subtle bg-surface-sunken px-3',
              'font-fw-sans text-body text-text-primary placeholder:text-text-tertiary',
              'outline-none transition-[border-color,box-shadow] [transition-duration:var(--fw-dur-fast)]',
              'hover:border-border-strong focus-visible:border-border-focus focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
            )}
          />
          {newFolderName.trim() && folders.includes(newFolderName.trim()) && (
            <p className="font-fw-sans text-caption text-fw-warning">A folder with this name already exists.</p>
          )}
        </ModalShell.Body>
        <ModalShell.Footer>
          <Button
            variant="ghost"
            onClick={() => {
              setShowNewFolderModal(false);
              setNewFolderName('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim() || folders.includes(newFolderName.trim())}
          >
            Create folder
          </Button>
        </ModalShell.Footer>
      </ModalShell>

      {/* ── Upload (coach) ─────────────────────────────────────────────────── */}
      <ModalShell
        open={showUploadModal}
        onOpenChange={(o) => {
          if (!o) closeUploadModal();
        }}
        size="xl"
        title="Upload documents"
        description={`${pendingFiles.length} file${pendingFiles.length !== 1 ? 's' : ''} selected`}
        hideClose={uploading}
      >
        <ModalShell.Body className="flex flex-col gap-5">
          {uploadError && (
            <InlineNotice tone="danger" title="Couldn't upload">
              {uploadError}
            </InlineNotice>
          )}

          {/* Add-more drop zone */}
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex min-h-0 w-full flex-col items-center justify-center gap-1 rounded-fw-md border-2 border-dashed border-border-subtle',
              'bg-surface-sunken px-6 py-6 text-center transition-colors',
              'hover:border-accent-400 hover:bg-accent-50/40',
              'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
            )}
          >
            <span className="flex flex-col items-center justify-center gap-1">
              <IconPlus size={22} className="text-text-tertiary" />
              <span className="font-fw-sans text-body-sm font-medium text-text-secondary">Add more files</span>
              <span className="font-fw-sans text-caption text-text-tertiary">Click or drag & drop</span>
            </span>
          </Button>

          {/* Pending files list */}
          {pendingFiles.length > 0 && (
            <div className="flex flex-col gap-2">
              {pendingFiles.map((pf) => (
                <div key={pf.id} className="flex items-center gap-3 rounded-fw-md bg-surface-sunken p-3">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-fw-md bg-surface text-text-secondary">
                    {fileIcon(pf.file.type, 16)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Input
                      type="text"
                      value={pf.title}
                      onChange={(e) => updatePendingTitle(pf.id, e.target.value)}
                      placeholder="Document title"
                      aria-label={`Title for ${pf.file.name}`}
                      className={cn(
                        '!min-h-0 w-full !rounded-none !border-0 !border-b !border-transparent !bg-transparent !px-0 !py-0.5',
                        'font-fw-sans text-body-sm font-medium text-text-primary placeholder:text-text-tertiary',
                        'outline-none focus:!border-accent-500 focus-visible:!border-accent-500 focus-visible:!ring-0 focus-visible:!ring-offset-0',
                      )}
                    />
                    <p className="mt-0.5 truncate font-fw-sans text-caption text-text-tertiary">
                      {pf.file.name} · <span className="tabular-nums">{formatFileSize(pf.file.size)}</span>
                    </p>
                  </div>
                  <IconButton
                    aria-label={`Remove ${pf.title}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => removePendingFile(pf.id)}
                  >
                    <IconX size={15} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}

          {/* Shared settings */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="font-fw-sans text-body-sm font-medium text-text-primary">Category</span>
              <Select
                placeholder="None"
                value={uploadCategory}
                onValueChange={(v: string | null) => setUploadCategory(v ?? '')}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                aria-label="Upload category"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-fw-sans text-body-sm font-medium text-text-primary">Folder</span>
              <Select
                placeholder="No folder"
                value={uploadFolder}
                onValueChange={(v: string | null) => setUploadFolder(v ?? '')}
                options={folderSelectOptions}
                aria-label="Upload folder"
              />
            </div>
          </div>

          <Switch
            checked={uploadIsPublic}
            onCheckedChange={(v) => setUploadIsPublic(v)}
            label="Visible to players"
            description="Off keeps the file coach-only."
          />

          {/* Progress */}
          {uploading && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between font-fw-sans text-caption text-text-tertiary">
                <span>Uploading…</span>
                <span className="tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-accent-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </ModalShell.Body>
        <ModalShell.Footer>
          <Button variant="ghost" onClick={closeUploadModal} disabled={uploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            busy={uploading}
            disabled={pendingFiles.length === 0}
          >
            {uploading
              ? `Uploading… ${uploadProgress}%`
              : `Upload ${pendingFiles.length} file${pendingFiles.length !== 1 ? 's' : ''}`}
          </Button>
        </ModalShell.Footer>
      </ModalShell>

      {/* ── Edit details (coach) ───────────────────────────────────────────── */}
      <ModalShell
        open={!!editingDocument}
        onOpenChange={(o) => {
          if (!o) setEditingDocument(null);
        }}
        size="lg"
        title="Edit document"
      >
        <ModalShell.Body className="flex flex-col gap-4">
          {editError && (
            <InlineNotice tone="danger" title="Couldn't save">
              {editError}
            </InlineNotice>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-document-title" className="font-fw-sans text-body-sm font-medium text-text-primary">
              Title <span className="text-accent-600">*</span>
            </label>
            <Input
              id="edit-document-title"
              type="text"
              value={editForm.title}
              onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
              className={cn(
                'h-11 w-full rounded-fw-md border border-border-subtle bg-surface-sunken px-3',
                'font-fw-sans text-body text-text-primary placeholder:text-text-tertiary',
                'outline-none transition-[border-color,box-shadow] [transition-duration:var(--fw-dur-fast)]',
                'hover:border-border-strong focus-visible:border-border-focus focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-document-description" className="font-fw-sans text-body-sm font-medium text-text-primary">
              Description
            </label>
            <TextArea
              id="edit-document-description"
              value={editForm.description}
              onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="Optional description"
              className={cn(
                'w-full rounded-fw-md border border-border-subtle bg-surface-sunken px-3 py-2.5',
                'font-fw-sans text-body-sm leading-relaxed text-text-primary placeholder:text-text-tertiary',
                'resize-y outline-none transition-[border-color,box-shadow] [transition-duration:var(--fw-dur-fast)]',
                'hover:border-border-strong focus-visible:border-border-focus focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="font-fw-sans text-body-sm font-medium text-text-primary">Category</span>
              <Select
                placeholder="No category"
                value={editForm.category}
                onValueChange={(v: string | null) => setEditForm((p) => ({ ...p, category: v ?? '' }))}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                aria-label="Edit category"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-fw-sans text-body-sm font-medium text-text-primary">Folder</span>
              <Select
                placeholder="No folder"
                value={editForm.folder}
                onValueChange={(v: string | null) => setEditForm((p) => ({ ...p, folder: v ?? '' }))}
                options={folderSelectOptions}
                aria-label="Edit folder"
              />
            </div>
          </div>

          <Switch
            checked={editForm.is_public}
            onCheckedChange={(v) => setEditForm((p) => ({ ...p, is_public: v }))}
            label="Visible to players"
            description="Off keeps the file coach-only."
          />

          {editingDocument && (
            <div className="border-t border-border-subtle pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const doc = editingDocument;
                  setEditingDocument(null);
                  if (doc) openUploadVersionModal(doc);
                }}
              >
                <IconUpload size={14} />
                <span>Upload new version of this file</span>
              </Button>
            </div>
          )}
        </ModalShell.Body>
        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setEditingDocument(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleUpdate} busy={updating}>
            Save changes
          </Button>
        </ModalShell.Footer>
      </ModalShell>

      {/* ── Move to folder (coach) ─────────────────────────────────────────── */}
      <ModalShell
        open={!!movingDocument}
        onOpenChange={(o) => {
          if (!o) setMovingDocument(null);
        }}
        size="sm"
        title="Move to folder"
        description={movingDocument ? `Moving “${movingDocument.title}”` : undefined}
      >
        <ModalShell.Body className="flex flex-col gap-1.5">
          <span className="font-fw-sans text-body-sm font-medium text-text-primary">Destination folder</span>
          <Select
            placeholder="No folder (unfiled)"
            value={moveTargetFolder}
            onValueChange={(v: string | null) => setMoveTargetFolder(v ?? '')}
            options={folderSelectOptions}
            aria-label="Destination folder"
          />
        </ModalShell.Body>
        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setMovingDocument(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleMoveToFolder}>
            Move
          </Button>
        </ModalShell.Footer>
      </ModalShell>

      {/* ── Delete confirm (coach) ─────────────────────────────────────────── */}
      <ModalShell
        open={!!deleteConfirmDoc}
        onOpenChange={(o) => {
          if (!o) setDeleteConfirmDoc(null);
        }}
        size="sm"
        title={deleteConfirmDoc ? `Delete “${deleteConfirmDoc.title}”?` : 'Delete document?'}
        description="All versions will be permanently removed. This action cannot be undone."
      >
        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setDeleteConfirmDoc(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirmed}>
            Delete
          </Button>
        </ModalShell.Footer>
      </ModalShell>

      {/* ── Document preview (everyone) — legacy preview component reused ───── */}
      {previewDocument && (
        <DocumentPreview
          open={showPreview}
          onOpenChange={(o) => {
            if (!o) closePreview();
          }}
          golfDocument={previewDocument as unknown as GolfDocument}
        />
      )}

      {/* ── Version history (coach) — legacy component reused ──────────────── */}
      <ModalShell
        open={showVersionHistory && !!versionHistoryDocument}
        onOpenChange={(o) => {
          if (!o) closeVersionHistory();
        }}
        size="xl"
        title="Version history"
      >
        <ModalShell.Body>
          {versionHistoryDocument && (
            <VersionHistory
              document={versionHistoryDocument as GolfDocument}
              versions={versions}
              onPreviewVersion={handlePreviewVersion}
              onReverted={() => {
                if (versionHistoryDocument) void openVersionHistory(versionHistoryDocument);
              }}
            />
          )}
        </ModalShell.Body>
      </ModalShell>

      {/* ── Upload new version (coach) — legacy modal reused ───────────────── */}
      {uploadVersionDocument && (
        <UploadNewVersionModal
          open={showUploadVersionModal}
          onClose={() => {
            setShowUploadVersionModal(false);
            setUploadVersionDocument(null);
          }}
          documentTitle={uploadVersionDocument.title}
          currentFileType={uploadVersionDocument.file_type}
          onUpload={handleUploadNewVersion}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * SectionHeading — quiet uppercase overline (matches the qualifiers sections).
 * ────────────────────────────────────────────────────────────────────────── */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
      {children}
    </h2>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * DocumentCard — one matte file card. Click anywhere previews; coach gets the
 * per-card actions menu; everyone gets quiet preview + download affordances.
 * Preserves: file-type icon/Chip, title, description, category Chip, folder
 * Chip (when out of that folder), version badge, "Coach only" pill, size, date.
 * ────────────────────────────────────────────────────────────────────────── */
interface DocumentCardProps {
  doc: FairwayDocument;
  isCoach: boolean;
  currentFolder: string | null;
  onPreview: () => void;
  onVersionHistory: () => void;
  onUploadVersion: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}

function DocumentCard({
  doc,
  isCoach,
  currentFolder,
  onPreview,
  onVersionHistory,
  onUploadVersion,
  onEdit,
  onMove,
  onDelete,
}: DocumentCardProps) {
  const tone = fileTypeTone(doc.file_type);
  const showFolderChip = !!doc.folder && currentFolder !== doc.folder;
  const versionCount = doc.version_count ?? 0;

  return (
    <Surface
      elevation="border"
      padding="none"
      interactive
      onClick={onPreview}
      className="group flex flex-col"
    >
      <div className="flex flex-col gap-4 p-5">
        {/* Top row: icon + version badge + actions */}
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-fw-md bg-surface-sunken text-text-secondary">
            {fileIcon(doc.file_type, 20)}
          </span>

          <div className="flex items-center gap-1.5">
            {versionCount > 1 && (
              <Chip size="sm" tone="neutral" leadingIcon={<IconLayers size={11} />}>
                <span className="tabular-nums">v{versionCount}</span>
              </Chip>
            )}
            {isCoach && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    aria-label="Document actions"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void triggerHaptic('light');
                    }}
                  >
                    <IconMoreVertical size={16} />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem
                    onSelect={() => {
                      void triggerHaptic('light');
                      onPreview();
                    }}
                    className="gap-3"
                  >
                    <IconEye size={18} className="text-text-tertiary" /> Preview
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void triggerHaptic('light');
                      onVersionHistory();
                    }}
                    className="gap-3"
                  >
                    <IconClock size={18} className="text-text-tertiary" /> Version history
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void triggerHaptic('light');
                      onUploadVersion();
                    }}
                    className="gap-3"
                  >
                    <IconUpload size={18} className="text-text-tertiary" /> Upload new version
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void triggerHaptic('light');
                      onEdit();
                    }}
                    className="gap-3"
                  >
                    <IconEdit size={18} className="text-text-tertiary" /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void triggerHaptic('light');
                      onMove();
                    }}
                    className="gap-3"
                  >
                    <IconFolder size={18} className="text-text-tertiary" /> Move to folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      void triggerHaptic('light');
                      onDelete();
                    }}
                    className="gap-3 text-fw-danger data-[highlighted]:bg-fw-danger-bg data-[highlighted]:text-fw-danger"
                  >
                    <IconTrash size={18} /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Title */}
        <div className="min-w-0">
          <h3 className="truncate font-fw-sans text-body-lg font-medium leading-tight text-text-primary transition-colors [transition-duration:180ms] group-hover:text-accent-700 motion-reduce:transition-none">
            {doc.title}
          </h3>
          {doc.description && (
            <p className="mt-1 line-clamp-2 font-fw-sans text-body-sm leading-relaxed text-text-tertiary">
              {doc.description}
            </p>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip size="sm" tone={tone} leadingIcon={fileIcon(doc.file_type, 12)}>
            {fileTypeLabel(doc.file_type)}
          </Chip>
          {doc.category && (
            <Chip size="sm" tone="accent" variant="outline">
              {doc.category}
            </Chip>
          )}
          {showFolderChip && (
            <Chip size="sm" tone="neutral" leadingIcon={<IconFolder size={11} />}>
              {doc.folder}
            </Chip>
          )}
          {isCoach && doc.is_public === false && (
            <StatusPill size="sm" tone="warning" dot={false}>
              Coach only
            </StatusPill>
          )}
        </div>
      </div>

      {/* Footer: size · date + quiet preview/download affordances */}
      <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3">
        <div className="flex items-center gap-3 font-fw-sans text-caption text-text-tertiary">
          <span className="tabular-nums">{formatFileSize(doc.file_size)}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{timeAgo(doc.created_at)}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:opacity-100">
          <IconButton
            aria-label="Preview"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
          >
            <IconEye size={15} />
          </IconButton>
          <a
            href={doc.file_url}
            download
            onClick={(e) => e.stopPropagation()}
            aria-label={`Download ${doc.title}`}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary',
              'transition-colors hover:bg-surface-sunken hover:text-text-primary',
              'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
            )}
            title="Download"
          >
            <IconDownload size={15} />
          </a>
        </div>
      </div>
    </Surface>
  );
}

export default FairwayDocuments;
