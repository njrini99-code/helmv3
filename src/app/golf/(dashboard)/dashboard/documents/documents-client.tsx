'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconFolder, IconFolderPlus, IconDownload, IconTrash, IconUpload, IconX,
  IconSearch, IconEdit, IconClock, IconEye, IconLayers, IconPlus,
  IconFile, IconFileText, IconImage, IconVideo, IconFileSpreadsheet,
  IconCheck, IconMoreVertical, IconArrowLeft, IconChevronDown,
} from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';

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
import { useToast } from '@/components/ui/sonner';
import { DocumentPreview } from '@/components/golf/documents/DocumentPreview';
import { VersionHistory } from '@/components/golf/documents/VersionHistory';
import { UploadNewVersionModal } from '@/components/golf/documents/UploadNewVersionModal';

interface Document {
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

interface DocumentsClientProps {
  documents: Document[];
  coachId: string;
  teamId: string;
  isCoach: boolean;
}

const CATEGORIES = ['Schedule', 'Rules', 'Forms', 'Training', 'Other'];

// ─── File Type Helpers ───────────────────────────────────────────────

function getFileIcon(fileType: string | null, size = 24) {
  if (!fileType) return <IconFile size={size} className="text-warm-400" />;
  if (fileType === 'application/pdf') return <IconFileText size={size} className="text-red-500" />;
  if (fileType.startsWith('image/')) return <IconImage size={size} className="text-blue-500" />;
  if (fileType.includes('word') || fileType.includes('document')) return <IconFileText size={size} className="text-blue-600" />;
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType === 'text/csv') return <IconFileSpreadsheet size={size} className="text-primary-500" />;
  if (fileType.startsWith('video/')) return <IconVideo size={size} className="text-purple-500" />;
  if (fileType.startsWith('text/')) return <IconFileText size={size} className="text-warm-500" />;
  return <IconFile size={size} className="text-warm-400" />;
}

function getFileTypeLabel(fileType: string | null) {
  if (!fileType) return 'File';
  if (fileType === 'application/pdf') return 'PDF';
  if (fileType.startsWith('image/')) return 'Image';
  if (fileType.includes('word') || fileType.includes('document')) return 'Document';
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType === 'text/csv') return 'Spreadsheet';
  if (fileType.startsWith('video/')) return 'Video';
  if (fileType.startsWith('text/')) return 'Text';
  return 'File';
}

function getFileTypeColor(fileType: string | null) {
  if (!fileType) return 'bg-warm-100 text-warm-500';
  if (fileType === 'application/pdf') return 'bg-red-50 text-red-600';
  if (fileType.startsWith('image/')) return 'bg-blue-50 text-blue-600';
  if (fileType.includes('word') || fileType.includes('document')) return 'bg-blue-50 text-blue-700';
  if (fileType.includes('sheet') || fileType.includes('excel')) return 'bg-primary-50 text-primary-600';
  if (fileType.startsWith('video/')) return 'bg-purple-50 text-purple-600';
  return 'bg-warm-50 text-warm-500';
}

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Pending upload file type ────────────────────────────────────────

interface PendingFile {
  file: File;
  title: string;
  id: string;
}

// ─── Main Component ──────────────────────────────────────────────────

export function DocumentsClient({ documents: initialDocuments, coachId, teamId, isCoach }: DocumentsClientProps) {
  const router = useRouter();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState(initialDocuments);

  // Sync local state when server data updates (e.g. after router.refresh())
  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploadIsPublic, setUploadIsPublic] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Folder state
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [manualFolders, setManualFolders] = useState<string[]>([]);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'size'>('newest');

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '', is_public: true, folder: '' });
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Preview modal state
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Version history modal state
  const [versionHistoryDocument, setVersionHistoryDocument] = useState<Document | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [, setLoadingVersions] = useState(false);

  // Upload new version modal state
  const [uploadVersionDocument, setUploadVersionDocument] = useState<Document | null>(null);
  const [showUploadVersionModal, setShowUploadVersionModal] = useState(false);

  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<Document | null>(null);
  const { showToast } = useToast();

  // ─── Computed values ─────────────────────────────────────────────

  const folders = useMemo(() => {
    const folderSet = new Set<string>();
    documents.forEach(doc => {
      if (doc.folder) folderSet.add(doc.folder);
    });
    manualFolders.forEach(f => folderSet.add(f));
    return Array.from(folderSet).sort();
  }, [documents, manualFolders]);

  const filteredDocuments = useMemo(() => {
    const filtered = documents.filter((doc) => {
      const matchesSearch = !searchQuery ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = !categoryFilter || doc.category === categoryFilter;
      const matchesFolder = currentFolder === null
        ? true // show all when no folder selected
        : currentFolder === ''
          ? !doc.folder // "root" folder - show docs without folder
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

  // ─── Drag and Drop ───────────────────────────────────────────────

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
      const newPending: PendingFile[] = files.map(file => ({
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        id: crypto.randomUUID(),
      }));
      setPendingFiles(prev => [...prev, ...newPending]);
      setShowUploadModal(true);
    }
  }, []);

  // ─── File Selection ──────────────────────────────────────────────

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const newPending: PendingFile[] = files.map(file => ({
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        id: crypto.randomUUID(),
      }));
      setPendingFiles(prev => [...prev, ...newPending]);
      if (!showUploadModal) setShowUploadModal(true);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  };

  const updatePendingTitle = (id: string, title: string) => {
    setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, title } : f));
  };

  // ─── Upload Handler (Multi-file) ────────────────────────────────

  const handleUpload = async () => {
    if (pendingFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    const untitled = pendingFiles.find(f => !f.title.trim());
    if (untitled) {
      setError('All files must have a title');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const pf = pendingFiles[i]!;
        setUploadProgress(Math.round((i / pendingFiles.length) * 100));

        // Upload file to storage
        const uploadResult = await uploadGolfDocument(pf.file, teamId);
        if (!uploadResult.success) {
          setError(`Failed to upload "${pf.title}": ${uploadResult.error}`);
          setUploading(false);
          return;
        }

        // Create document record
        const folderValue = uploadFolder || (currentFolder && currentFolder !== '' ? currentFolder : undefined);
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
          setError(`Failed to create record for "${pf.title}": ${createResult.error}`);
          setUploading(false);
          return;
        }
      }

      setUploadProgress(100);

      // Reset everything
      setPendingFiles([]);
      setUploadCategory('');
      setUploadFolder('');
      setUploadIsPublic(true);
      setShowUploadModal(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during upload');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ─── Folder Creation ─────────────────────────────────────────────

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const folderName = newFolderName.trim();
    if (!folders.includes(folderName)) {
      setManualFolders(prev => [...prev, folderName]);
    }
    setCurrentFolder(folderName);
    setUploadFolder(folderName);
    setNewFolderName('');
    setShowNewFolderInput(false);
  };

  // ─── Move Document to Folder ─────────────────────────────────────
  const [movingDocument, setMovingDocument] = useState<Document | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetFolder, setMoveTargetFolder] = useState('');

  const openMoveModal = (doc: Document) => {
    setMovingDocument(doc);
    setMoveTargetFolder(doc.folder || '');
    setShowMoveModal(true);
  };

  const handleMoveToFolder = async () => {
    if (!movingDocument) return;
    const newFolder = moveTargetFolder || null;
    const result = await updateGolfDocument({ id: movingDocument.id, folder: newFolder });
    if (result.success) {
      setDocuments(docs =>
        docs.map(d => d.id === movingDocument.id ? { ...d, folder: newFolder } : d)
      );
      router.refresh();
    }
    setShowMoveModal(false);
    setMovingDocument(null);
  };

  // ─── Document Actions ────────────────────────────────────────────

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirmDoc) return;
    const docId = deleteConfirmDoc.id;
    setDeleteConfirmDoc(null);
    const result = await deleteGolfDocument(docId);
    if (result.success) {
      setDocuments(docs => docs.filter(d => d.id !== docId));
      router.refresh();
    } else {
      showToast(result.error || 'Failed to delete', 'error');
    }
  };

  const openEditModal = (doc: Document) => {
    setEditingDocument(doc);
    setEditForm({
      title: doc.title,
      description: doc.description || '',
      category: doc.category || '',
      is_public: doc.is_public ?? true,
      folder: doc.folder || '',
    });
    setEditError(null);
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!editingDocument || !editForm.title.trim()) {
      setEditError('Please enter a title');
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
        setEditError(result.error || 'Failed to update');
        return;
      }
      setDocuments(docs =>
        docs.map(d => d.id === editingDocument.id
          ? { ...d, title: editForm.title, description: editForm.description || null, category: editForm.category || null, is_public: editForm.is_public, folder: editForm.folder || null }
          : d
        )
      );
      setShowEditModal(false);
      setEditingDocument(null);
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setUpdating(false);
    }
  };

  // Preview / Version history handlers
  const openPreview = (doc: Document) => { setPreviewDocument(doc); setShowPreview(true); };
  const closePreview = () => { setShowPreview(false); setPreviewDocument(null); };

  const openVersionHistory = useCallback(async (doc: Document) => {
    setVersionHistoryDocument(doc);
    setLoadingVersions(true);
    setShowVersionHistory(true);
    const result = await getVersionHistory(doc.id);
    setVersions(result.success && result.versions ? result.versions : []);
    setLoadingVersions(false);
  }, []);

  const closeVersionHistory = () => { setShowVersionHistory(false); setVersionHistoryDocument(null); setVersions([]); };

  const handlePreviewVersion = (version: DocumentVersion) => {
    if (!versionHistoryDocument || !version.file_url) return;
    setPreviewDocument({ ...versionHistoryDocument, file_url: version.file_url, file_size: version.file_size });
    setShowPreview(true);
  };

  const openUploadVersionModal = (doc: Document) => {
    setUploadVersionDocument(doc);
    setShowUploadVersionModal(true);
  };

  const handleUploadNewVersion = async (file: File, changeNotes: string) => {
    if (!uploadVersionDocument) return;
    const result = await uploadNewVersion(uploadVersionDocument.id, file, teamId, coachId, changeNotes);
    if (!result.success) throw new Error(result.error || 'Failed to upload new version');
    setDocuments(docs =>
      docs.map(d => d.id === uploadVersionDocument.id
        ? { ...d, file_url: result.version?.file_url || d.file_url, file_size: result.version?.file_size || d.file_size, version_count: (d.version_count || 1) + 1 }
        : d
      )
    );
    setShowUploadVersionModal(false);
    setUploadVersionDocument(null);
    router.refresh();
  };

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div
      className="min-h-full bg-transparent"
      onDragOver={isCoach ? handleDragOver : undefined}
      onDragLeave={isCoach ? handleDragLeave : undefined}
      onDrop={isCoach ? handleDrop : undefined}
    >
      {/* Global drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-40 bg-primary-600/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-cream-50/92 backdrop-blur-xl rounded-3xl p-12 shadow-2xl border-2 border-dashed border-primary-400">
            <IconUpload size={48} className="mx-auto text-primary-600 mb-4" />
            <p className="text-[20px] font-medium text-warm-900 tracking-[-0.015em]">Drop files to upload</p>
            <p className="text-sm text-warm-500 mt-1">Release to add files</p>
          </div>
        </div>
      )}

      {/* Header */}
      <LargeTitleHeader
        title={currentFolder !== null && currentFolder !== '' ? currentFolder : 'Documents'}
        subtitle={
          currentFolder !== null && currentFolder !== ''
            ? `${filteredDocuments.length} file${filteredDocuments.length !== 1 ? 's' : ''}`
            : `${documents.length} file${documents.length !== 1 ? 's' : ''}${folders.length > 0 ? ` across ${folders.length} folder${folders.length !== 1 ? 's' : ''}` : ''}`
        }
        belowContent={
          currentFolder !== null && currentFolder !== '' ? (
            <button
              onClick={() => { setCurrentFolder(null); setSearchQuery(''); setCategoryFilter(''); }}
              className="flex items-center gap-1.5 text-sm text-warm-500 hover:text-warm-700 transition-colors"
            >
              <IconArrowLeft size={14} />
              All Documents
            </button>
          ) : undefined
        }
      >
        {isCoach && (
          <>
            {!currentFolder && (
              <button
                onClick={() => setShowNewFolderInput(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-warm-600 bg-white border border-warm-200 rounded-lg hover:bg-warm-50 active:bg-warm-100 transition-colors"
              >
                <IconFolderPlus size={16} />
                <span className="hidden sm:inline">New Folder</span>
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors text-sm"
            >
              <IconUpload size={16} />
              <span className="hidden sm:inline">Upload</span>
            </button>
          </>
        )}
      </LargeTitleHeader>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Editorial hero band — frames the document grid beneath the sticky
            title header. Skipped while inside a sub-folder so the back-nav
            controls stay close to the file list. */}
        {currentFolder === null && (
          <Reveal>
            <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
              <PageHeader
                eyebrow="Documents"
                eyebrowAccent="primary"
                title="Team documents."
                subtitle={
                  documents.length === 0
                    ? 'Plans, releases, and forms — all in one place.'
                    : `${documents.length} file${documents.length === 1 ? '' : 's'} shared${
                        folders.length > 0 ? ` across ${folders.length} folder${folders.length === 1 ? '' : 's'}` : ''
                      }.`
                }
              />
            </div>
          </Reveal>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*,text/plain,video/mp4,video/webm"
          onChange={handleFilesSelected}
          className="hidden"
        />

        {/* Create Folder Modal */}
        {showNewFolderInput && (
          <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                    <IconFolderPlus size={16} className="text-primary-600" />
                  </div>
                  <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Create Folder</h2>
                </div>
                <button
                  onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
                  className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
                >
                  <IconX size={18} />
                </button>
              </div>
              <div className="px-6 py-5">
                <label className="block text-xs font-medium text-warm-600 mb-1.5">Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && newFolderName.trim() && handleCreateFolder()}
                  placeholder="e.g. Practice Plans"
                  enterKeyHint="done"
                  autoComplete="off"
                  className="w-full px-3 py-2.5 text-sm border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600/20 focus:border-primary-500"
                  autoFocus
                />
                {newFolderName.trim() && folders.includes(newFolderName.trim()) && (
                  <p className="text-xs text-amber-600 mt-1.5">A folder with this name already exists</p>
                )}
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-warm-100 bg-warm-50/50">
                <button
                  onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
                  className="flex-1 px-4 py-2.5 border border-warm-200 rounded-lg font-medium text-warm-700 hover:bg-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || folders.includes(newFolderName.trim())}
                  className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Create Folder
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Folder Grid — only show at root level */}
        {currentFolder === null && folders.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80">Folders</h2>
              <button
                onClick={() => setCurrentFolder('')}
                className="text-xs text-warm-500 hover:text-warm-700 transition-colors"
              >
                View unfiled
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {folders.map((folder) => {
                const count = documents.filter(d => d.folder === folder).length;
                return (
                  <button
                    key={folder}
                    onClick={() => { setCurrentFolder(folder); setSearchQuery(''); setCategoryFilter(''); }}
                    className="group/folder flex items-center gap-3 p-3.5 bg-cream-100/75 backdrop-blur-sm border border-warm-200/35 rounded-xl hover:bg-white hover:shadow-sm hover:border-warm-300/60 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0 group-hover/folder:bg-primary-100 transition-colors">
                      <IconFolder size={18} className="text-primary-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-warm-900 truncate">{folder}</p>
                      <p className="text-xs text-warm-400">{count} file{count !== 1 ? 's' : ''}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        {documents.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
            {/* Search */}
            <div className="relative flex-1">
              <IconSearch size={16} className="absolute left-3 top-1/2 -tranwarm-y-1/2 text-warm-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={currentFolder && currentFolder !== '' ? `Search in ${currentFolder}...` : 'Search documents...'}
                enterKeyHint="search"
                autoComplete="off"
                className="w-full pl-9 pr-9 py-2 rounded-lg border border-warm-200/35 focus:ring-2 focus:ring-primary-600/20 focus:border-primary-500 text-sm text-warm-900 placeholder:text-warm-400 bg-cream-100/68 backdrop-blur-sm transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -tranwarm-y-1/2 text-warm-400 hover:text-warm-600"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>

            {/* Category pills — compact inline */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {CATEGORIES.map((cat) => {
                const count = (currentFolder !== null
                  ? documents.filter(d => d.category === cat && (currentFolder === '' ? !d.folder : d.folder === currentFolder))
                  : documents.filter(d => d.category === cat)
                ).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                      categoryFilter === cat
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-cream-100/82 text-warm-600 border border-warm-200 hover:bg-white hover:border-warm-300'
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
              {categoryFilter && (
                <button
                  onClick={() => setCategoryFilter('')}
                  className="p-1 rounded-md text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
                  title="Clear filter"
                >
                  <IconX size={12} />
                </button>
              )}
            </div>

            {/* Sort dropdown */}
            <div className="flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={() => { void triggerHaptic('light'); }}
                    className="flex items-center gap-1.5 h-11 px-3 text-xs font-medium text-warm-700 bg-cream-100/75 backdrop-blur-sm border border-warm-200/35 rounded-xl hover:bg-cream-50/92 hover:border-warm-300 active:scale-95 transition-[color,background-color,transform] duration-150 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    {sortBy === 'newest' ? 'Newest' : sortBy === 'oldest' ? 'Oldest' : sortBy === 'name' ? 'Name' : 'Size'}
                    <IconChevronDown size={12} className="transition-transform data-[state=open]:rotate-180" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {([['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'Name A-Z'], ['size', 'Largest first']] as const).map(([value, label]) => (
                    <DropdownMenuItem
                      key={value}
                      selected={sortBy === value}
                      onSelect={() => { void triggerHaptic('light'); setSortBy(value); }}
                      className="gap-2"
                    >
                      {sortBy === value ? <IconCheck size={14} className="text-primary-600" /> : <span className="w-[14px]" />}
                      <span>{label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* Section header for files at root level */}
        {currentFolder === null && folders.length > 0 && documents.length > 0 && (
          <h2 className="text-[11px] font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-3">
            {searchQuery || categoryFilter ? `${filteredDocuments.length} result${filteredDocuments.length !== 1 ? 's' : ''}` : 'All Files'}
          </h2>
        )}

        {/* Content */}
        {documents.length === 0 && currentFolder === null ? (
          <div
            className="relative surface-matte rounded-3xl overflow-clip p-8 md:p-16 text-center"
            onDragOver={isCoach ? handleDragOver : undefined}
            onDrop={isCoach ? handleDrop : undefined}
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-6">
                <IconFolder size={28} className="text-warm-400" />
              </div>
              <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">No Documents Yet</h3>
              <p className="text-sm text-warm-500 mb-6 max-w-sm mx-auto">
                {isCoach
                  ? 'Upload documents to share with your team. Drag & drop files or click upload.'
                  : 'Your team files and resources will appear here.'}
              </p>
              {isCoach && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
                >
                  <IconUpload size={16} />
                  Upload First Document
                </button>
              )}
            </div>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div
            className="relative surface-matte rounded-3xl overflow-clip p-8 md:p-12 text-center"
            onDragOver={isCoach ? handleDragOver : undefined}
            onDrop={isCoach ? handleDrop : undefined}
          >
            <div className="relative">
              {currentFolder && currentFolder !== '' && !searchQuery && !categoryFilter ? (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-5">
                    <IconFolder size={24} className="text-primary-400" />
                  </div>
                  <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">This folder is empty</h3>
                  <p className="text-sm text-warm-500 mb-5 max-w-xs mx-auto">
                    Upload files to get started or drag & drop them here.
                  </p>
                  {isCoach && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors text-sm"
                    >
                      <IconUpload size={16} />
                      Upload to {currentFolder}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <IconSearch size={36} className="mx-auto text-warm-300 mb-4" />
                  <h3 className="text-lg font-medium text-warm-900 mb-2">No Matching Documents</h3>
                  <p className="text-sm text-warm-500 mb-4">Try adjusting your search or filters</p>
                  <button
                    onClick={() => { setSearchQuery(''); setCategoryFilter(''); }}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="group relative surface-matte rounded-3xl overflow-clip hover:shadow-md hover:bg-cream-100/82 transition-colors duration-200 cursor-pointer active:scale-[0.98]"
                onClick={() => openPreview(doc)}
              >
                {/* Color accent bar */}
                <div className={`h-1 w-full ${
                  doc.file_type === 'application/pdf' ? 'bg-red-400'
                  : doc.file_type?.startsWith('image/') ? 'bg-blue-400'
                  : doc.file_type?.includes('word') ? 'bg-blue-500'
                  : doc.file_type?.includes('sheet') ? 'bg-primary-400'
                  : doc.file_type?.startsWith('video/') ? 'bg-purple-400'
                  : 'bg-warm-300'
                }`} />

                <div className="p-5">
                  {/* Top row: icon + actions */}
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${getFileTypeColor(doc.file_type)}`}>
                      {getFileIcon(doc.file_type, 20)}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Version badge */}
                      {doc.version_count && doc.version_count > 1 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-warm-100 text-warm-600 flex items-center gap-0.5">
                          <IconLayers size={10} />
                          v{doc.version_count}
                        </span>
                      )}

                      {isCoach && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void triggerHaptic('light');
                              }}
                              className="w-11 h-11 flex items-center justify-center rounded-xl text-warm-400 hover:text-warm-700 hover:bg-warm-100/60 active:bg-warm-200/60 active:scale-95 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-[color,background-color,transform,opacity] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                              aria-label="Document actions"
                            >
                              <IconMoreVertical size={16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-56"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenuItem
                              onSelect={() => { void triggerHaptic('light'); openPreview(doc); }}
                              className="gap-3"
                            >
                              <IconEye size={18} className="text-warm-500" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => { void triggerHaptic('light'); openVersionHistory(doc); }}
                              className="gap-3"
                            >
                              <IconClock size={18} className="text-warm-500" /> Version History
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => { void triggerHaptic('light'); openUploadVersionModal(doc); }}
                              className="gap-3"
                            >
                              <IconUpload size={18} className="text-warm-500" /> Upload New Version
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => { void triggerHaptic('light'); openEditModal(doc); }}
                              className="gap-3"
                            >
                              <IconEdit size={18} className="text-warm-500" /> Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => { void triggerHaptic('light'); openMoveModal(doc); }}
                              className="gap-3"
                            >
                              <IconFolder size={18} className="text-warm-500" /> Move to Folder
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => { void triggerHaptic('light'); setDeleteConfirmDoc(doc); }}
                              className="gap-3 hover:bg-red-500/8 data-[highlighted]:bg-red-500/8"
                              style={{ color: '#FF3B30' }}
                            >
                              <IconTrash size={18} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="font-medium text-warm-900 mb-1 truncate text-[15px] leading-tight">
                    {doc.title}
                  </h3>

                  {/* Description */}
                  {doc.description && (
                    <p className="text-xs text-warm-500 mb-3 line-clamp-2 leading-relaxed">{doc.description}</p>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${getFileTypeColor(doc.file_type)}`}>
                      {getFileTypeLabel(doc.file_type)}
                    </span>
                    {doc.category && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-primary-50 text-primary-700">
                        {doc.category}
                      </span>
                    )}
                    {doc.folder && currentFolder !== doc.folder && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium rounded-md bg-warm-100 text-warm-600">
                        <IconFolder size={9} /> {doc.folder}
                      </span>
                    )}
                    {isCoach && doc.is_public === false && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-amber-50 text-amber-700">
                        Coach only
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-warm-100">
                    <div className="flex items-center gap-3 text-xs text-warm-400">
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>{timeAgo(doc.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); openPreview(doc); }}
                        className="p-1.5 rounded-lg hover:bg-primary-50 active:bg-primary-100 text-primary-600 transition-colors"
                        title="Preview"
                      >
                        <IconEye size={14} />
                      </button>
                      <a
                        href={doc.file_url}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg hover:bg-warm-100 active:bg-warm-200 text-warm-500 transition-colors"
                        title="Download"
                      >
                        <IconDownload size={14} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Upload Modal (Multi-file) ────────────────────────────── */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
              <div>
                <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Upload Documents</h2>
                <p className="text-sm text-warm-500">{pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} selected</p>
              </div>
              <button
                onClick={() => { setShowUploadModal(false); setPendingFiles([]); setError(null); }}
                className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="px-6 py-4 max-h-[70vh] overflow-y-auto space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Drop zone / Add more files */}
              <div
                className="border-2 border-dashed border-warm-200 rounded-xl p-6 text-center hover:border-primary-400 hover:bg-primary-50/30 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconPlus size={24} className="mx-auto text-warm-400 mb-2" />
                <p className="text-sm font-medium text-warm-600">Add more files</p>
                <p className="text-xs text-warm-400 mt-0.5">Click or drag & drop</p>
              </div>

              {/* Pending files list */}
              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  {pendingFiles.map((pf) => (
                    <div
                      key={pf.id}
                      className="flex items-center gap-3 p-3 bg-warm-50 rounded-xl"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${getFileTypeColor(pf.file.type)}`}>
                        {getFileIcon(pf.file.type, 16)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={pf.title}
                          onChange={(e) => updatePendingTitle(pf.id, e.target.value)}
                          className="w-full bg-transparent text-sm font-medium text-warm-900 border-b border-transparent focus:border-primary-500 focus:outline-none px-0 py-0.5"
                          placeholder="Document title"
                        />
                        <p className="text-xs text-warm-400 mt-0.5">
                          {pf.file.name} &middot; {formatFileSize(pf.file.size)}
                        </p>
                      </div>
                      <button
                        onClick={() => removePendingFile(pf.id)}
                        className="p-1 text-warm-400 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Shared settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-warm-600 mb-1.5">Category</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600/20 focus:border-primary-500 bg-white"
                  >
                    <option value="">None</option>
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-warm-600 mb-1.5">Folder</label>
                  <select
                    value={uploadFolder}
                    onChange={(e) => setUploadFolder(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600/20 focus:border-primary-500 bg-white"
                  >
                    <option value="">No folder</option>
                    {folders.map(f => <option key={f} value={f}>{f}</option>)}
                    {currentFolder && currentFolder !== '' && !folders.includes(currentFolder) && (
                      <option value={currentFolder}>{currentFolder} (new)</option>
                    )}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${uploadIsPublic ? 'bg-primary-600 border-primary-600' : 'border-warm-300 hover:border-warm-400'}`}>
                  {uploadIsPublic && <IconCheck size={12} className="text-white" />}
                </div>
                <span className="text-sm text-warm-700">Visible to players</span>
              </label>

              {/* Progress bar */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-warm-500">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-600 rounded-full transition-[width] duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-warm-100 bg-warm-50/50">
              <button
                onClick={() => { setShowUploadModal(false); setPendingFiles([]); setError(null); }}
                className="flex-1 px-4 py-2.5 border border-warm-200 rounded-lg font-medium text-warm-700 hover:bg-white transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => { setUploadIsPublic(!uploadIsPublic); }}
                className="hidden"
              />
              <button
                onClick={handleUpload}
                disabled={uploading || pendingFiles.length === 0}
                className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {uploading ? `Uploading... ${uploadProgress}%` : `Upload ${pendingFiles.length} File${pendingFiles.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Modal ───────────────────────────────────────────── */}
      {showEditModal && editingDocument && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
              <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Edit Document</h2>
              <button onClick={() => { setShowEditModal(false); setEditingDocument(null); }} className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors">
                <IconX size={18} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{editError}</div>
              )}

              <div>
                <label className="block text-xs font-medium text-warm-600 mb-1.5">Title *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 text-base md:text-sm border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600/20 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-warm-600 mb-1.5">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600/20 focus:border-primary-500"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-warm-600 mb-1.5">Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600/20 focus:border-primary-500 bg-white"
                  >
                    <option value="">No category</option>
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-warm-600 mb-1.5">Folder</label>
                  <select
                    value={editForm.folder}
                    onChange={(e) => setEditForm(prev => ({ ...prev, folder: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600/20 focus:border-primary-500 bg-white"
                  >
                    <option value="">No folder</option>
                    {folders.map(f => <option key={f} value={f}>{f}</option>)}
                    {currentFolder && currentFolder !== '' && !folders.includes(currentFolder) && (
                      <option value={currentFolder}>{currentFolder} (new)</option>
                    )}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => setEditForm(prev => ({ ...prev, is_public: !prev.is_public }))}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer ${editForm.is_public ? 'bg-primary-600 border-primary-600' : 'border-warm-300 hover:border-warm-400'}`}
                >
                  {editForm.is_public && <IconCheck size={12} className="text-white" />}
                </div>
                <span className="text-sm text-warm-700">Visible to players</span>
              </label>

              {isCoach && (
                <div className="pt-3 border-t border-warm-100">
                  <button
                    onClick={() => { setShowEditModal(false); openUploadVersionModal(editingDocument); }}
                    className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <IconUpload size={14} />
                    Upload new version of this file
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-warm-100 bg-warm-50/50">
              <button
                onClick={() => { setShowEditModal(false); setEditingDocument(null); }}
                className="flex-1 px-4 py-2.5 border border-warm-200 rounded-lg font-medium text-warm-700 hover:bg-white transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
              >
                {updating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ──────────────────────────── */}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 bg-warm-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-cream-50/92 backdrop-blur-xl rounded-2xl max-w-sm w-full shadow-2xl border border-warm-200/45 overflow-clip">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <IconTrash size={22} className="text-red-600" />
              </div>
              <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">Delete &ldquo;{deleteConfirmDoc.title}&rdquo;?</h3>
              <p className="text-sm text-warm-500">All versions will be permanently removed. This action cannot be undone.</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setDeleteConfirmDoc(null)}
                className="flex-1 px-4 py-2.5 border border-warm-200 rounded-xl font-medium text-warm-700 hover:bg-warm-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirmed}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Document Preview ─────────────────────────────────────── */}
      {previewDocument && (
        <DocumentPreview
          open={showPreview}
          onOpenChange={(open) => { if (!open) closePreview(); }}
          golfDocument={previewDocument as unknown as GolfDocument}
        />
      )}

      {/* ─── Version History ──────────────────────────────────────── */}
      {showVersionHistory && versionHistoryDocument && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
              <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Version History</h2>
              <button onClick={closeVersionHistory} aria-label="Close" className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors">
                <IconX size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <VersionHistory
                document={versionHistoryDocument as GolfDocument}
                versions={versions}
                onPreviewVersion={handlePreviewVersion}
                onReverted={() => { if (versionHistoryDocument) openVersionHistory(versionHistoryDocument); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Upload New Version ───────────────────────────────────── */}
      {uploadVersionDocument && (
        <UploadNewVersionModal
          open={showUploadVersionModal}
          onClose={() => { setShowUploadVersionModal(false); setUploadVersionDocument(null); }}
          documentTitle={uploadVersionDocument.title}
          currentFileType={uploadVersionDocument.file_type}
          onUpload={handleUploadNewVersion}
        />
      )}

      {/* ─── Move to Folder Modal ──────────────────────────────────── */}
      {showMoveModal && movingDocument && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
              <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Move to Folder</h2>
              <button
                onClick={() => { setShowMoveModal(false); setMovingDocument(null); }}
                className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors"
              >
                <IconX size={18} />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-warm-500 mb-3">
                Moving &ldquo;{movingDocument.title}&rdquo;
              </p>
              <label className="block text-xs font-medium text-warm-600 mb-1.5">Destination Folder</label>
              <select
                value={moveTargetFolder}
                onChange={(e) => setMoveTargetFolder(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-600/20 focus:border-primary-500 bg-white"
              >
                <option value="">No folder (unfiled)</option>
                {folders.map(f => <option key={f} value={f}>{f}</option>)}
                {currentFolder && currentFolder !== '' && !folders.includes(currentFolder) && (
                  <option value={currentFolder}>{currentFolder} (new)</option>
                )}
              </select>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-warm-100 bg-warm-50/50">
              <button
                onClick={() => { setShowMoveModal(false); setMovingDocument(null); }}
                className="flex-1 px-4 py-2.5 border border-warm-200 rounded-lg font-medium text-warm-700 hover:bg-white transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveToFolder}
                className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
