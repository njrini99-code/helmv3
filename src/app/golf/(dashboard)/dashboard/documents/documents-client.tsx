'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconFolder, IconFolderPlus, IconDownload, IconTrash, IconUpload, IconX,
  IconSearch, IconEdit, IconClock, IconEye, IconLayers, IconPlus,
  IconFile, IconFileText, IconImage, IconVideo, IconFileSpreadsheet,
  IconCheck, IconMoreVertical,
} from '@/components/icons';
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
  if (!fileType) return <IconFile size={size} className="text-slate-400" />;
  if (fileType === 'application/pdf') return <IconFileText size={size} className="text-red-500" />;
  if (fileType.startsWith('image/')) return <IconImage size={size} className="text-blue-500" />;
  if (fileType.includes('word') || fileType.includes('document')) return <IconFileText size={size} className="text-blue-600" />;
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType === 'text/csv') return <IconFileSpreadsheet size={size} className="text-emerald-500" />;
  if (fileType.startsWith('video/')) return <IconVideo size={size} className="text-purple-500" />;
  if (fileType.startsWith('text/')) return <IconFileText size={size} className="text-slate-500" />;
  return <IconFile size={size} className="text-slate-400" />;
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
  if (!fileType) return 'bg-slate-100 text-slate-500';
  if (fileType === 'application/pdf') return 'bg-red-50 text-red-600';
  if (fileType.startsWith('image/')) return 'bg-blue-50 text-blue-600';
  if (fileType.includes('word') || fileType.includes('document')) return 'bg-blue-50 text-blue-700';
  if (fileType.includes('sheet') || fileType.includes('excel')) return 'bg-emerald-50 text-emerald-600';
  if (fileType.startsWith('video/')) return 'bg-purple-50 text-purple-600';
  return 'bg-slate-50 text-slate-500';
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

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '', is_public: true });
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

  // Active dropdown
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // ─── Computed values ─────────────────────────────────────────────

  const folders = useMemo(() => {
    const folderSet = new Set<string>();
    documents.forEach(doc => {
      if (doc.folder) folderSet.add(doc.folder);
    });
    return Array.from(folderSet).sort();
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
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
  }, [documents, searchQuery, categoryFilter, currentFolder]);

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
    // We just set the current folder — the folder is created when a document is uploaded into it
    setCurrentFolder(newFolderName.trim());
    setNewFolderName('');
    setShowNewFolderInput(false);
  };

  // ─── Document Actions ────────────────────────────────────────────

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Delete "${doc.title}"? All versions will be removed.`)) return;
    const result = await deleteGolfDocument(doc.id);
    if (result.success) {
      setDocuments(docs => docs.filter(d => d.id !== doc.id));
      router.refresh();
    } else {
      alert(result.error || 'Failed to delete');
    }
  };

  const openEditModal = (doc: Document) => {
    setEditingDocument(doc);
    setEditForm({
      title: doc.title,
      description: doc.description || '',
      category: doc.category || '',
      is_public: doc.is_public ?? true,
    });
    setEditError(null);
    setShowEditModal(true);
    setActiveDropdown(null);
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
      });
      if (!result.success) {
        setEditError(result.error || 'Failed to update');
        return;
      }
      setDocuments(docs =>
        docs.map(d => d.id === editingDocument.id
          ? { ...d, title: editForm.title, description: editForm.description || null, category: editForm.category || null, is_public: editForm.is_public }
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
    setActiveDropdown(null);
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
    setActiveDropdown(null);
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
        <div className="fixed inset-0 z-40 bg-green-600/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-12 shadow-2xl border-2 border-dashed border-green-400">
            <IconUpload size={48} className="mx-auto text-green-600 mb-4" />
            <p className="text-xl font-semibold text-slate-900">Drop files to upload</p>
            <p className="text-sm text-slate-500 mt-1">Release to add files</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
            <p className="text-slate-500 mt-1">
              {documents.length} file{documents.length !== 1 ? 's' : ''} {folders.length > 0 ? `across ${folders.length} folder${folders.length !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
          {isCoach && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewFolderInput(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <IconFolderPlus size={16} />
                New Folder
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*,text/plain,video/mp4,video/webm"
                onChange={handleFilesSelected}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                <IconUpload size={16} />
                Upload Files
              </button>
            </div>
          )}
        </div>

        {/* New Folder Input */}
        {showNewFolderInput && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm">
            <IconFolder size={20} className="text-green-600 flex-shrink-0" />
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Folder name..."
              className="flex-1 px-3 py-2 bg-transparent border-b border-slate-200 focus:border-green-500 focus:outline-none text-slate-900 placeholder:text-slate-400"
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
              className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>
        )}

        {/* Folder Navigation */}
        {(folders.length > 0 || currentFolder !== null) && (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setCurrentFolder(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                currentFolder === null
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
              }`}
            >
              All Files
            </button>
            <button
              onClick={() => setCurrentFolder('')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                currentFolder === ''
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
              }`}
            >
              <IconFolder size={12} />
              Unfiled
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                onClick={() => setCurrentFolder(currentFolder === folder ? null : folder)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  currentFolder === folder
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
                }`}
              >
                <IconFolder size={12} />
                {folder}
                <span className="text-[10px] opacity-60">
                  ({documents.filter(d => d.folder === folder).length})
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Category Quick Filters & Search */}
        {documents.length > 0 && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
              <button
                onClick={() => setCategoryFilter('')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  !categoryFilter
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                All ({documents.length})
              </button>
              {CATEGORIES.map((cat) => {
                const count = documents.filter(d => d.category === cat).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      categoryFilter === cat
                        ? 'bg-green-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <IconSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200/60 focus:ring-2 focus:ring-green-600/20 focus:border-green-500 text-slate-900 placeholder:text-slate-400 bg-white/60 backdrop-blur-sm transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <IconX size={16} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {documents.length === 0 ? (
          <div
            className="relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-hidden p-16 text-center"
            onDragOver={isCoach ? handleDragOver : undefined}
            onDrop={isCoach ? handleDrop : undefined}
          >
            <ShineEffect />
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
                <IconFolder size={28} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Documents Yet</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                {isCoach
                  ? 'Upload documents to share with your team. Drag & drop files or click upload.'
                  : 'Your team files and resources will appear here.'}
              </p>
              {isCoach && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
                >
                  <IconUpload size={16} />
                  Upload First Document
                </button>
              )}
            </div>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-hidden p-12 text-center">
            <ShineEffect />
            <div className="relative">
              <IconSearch size={36} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No Matching Documents</h3>
              <p className="text-sm text-slate-500 mb-4">Try adjusting your search or filters</p>
              <button
                onClick={() => { setSearchQuery(''); setCategoryFilter(''); setCurrentFolder(null); }}
                className="text-sm text-green-600 hover:text-green-700 font-medium"
              >
                Clear all filters
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="group relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-hidden hover:shadow-md hover:bg-white/80 transition-all duration-200 cursor-pointer"
                onClick={() => openPreview(doc)}
              >
                {/* Color accent bar */}
                <div className={`h-1 w-full ${
                  doc.file_type === 'application/pdf' ? 'bg-red-400'
                  : doc.file_type?.startsWith('image/') ? 'bg-blue-400'
                  : doc.file_type?.includes('word') ? 'bg-blue-500'
                  : doc.file_type?.includes('sheet') ? 'bg-emerald-400'
                  : doc.file_type?.startsWith('video/') ? 'bg-purple-400'
                  : 'bg-slate-300'
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
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-100 text-slate-600 flex items-center gap-0.5">
                          <IconLayers size={10} />
                          v{doc.version_count}
                        </span>
                      )}

                      {isCoach && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === doc.id ? null : doc.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <IconMoreVertical size={14} />
                          </button>

                          {activeDropdown === doc.id && (
                            <>
                              <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setActiveDropdown(null); }} />
                              <div className="absolute right-0 top-8 z-40 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openPreview(doc); setActiveDropdown(null); }}
                                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <IconEye size={14} /> Preview
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openVersionHistory(doc); }}
                                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <IconClock size={14} /> Version History
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openUploadVersionModal(doc); }}
                                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <IconUpload size={14} /> Upload New Version
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditModal(doc); }}
                                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <IconEdit size={14} /> Edit Details
                                </button>
                                <div className="my-1 h-px bg-slate-100" />
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(doc); setActiveDropdown(null); }}
                                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <IconTrash size={14} /> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="font-semibold text-slate-900 mb-1 truncate text-[15px] leading-tight">
                    {doc.title}
                  </h3>

                  {/* Description */}
                  {doc.description && (
                    <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">{doc.description}</p>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md ${getFileTypeColor(doc.file_type)}`}>
                      {getFileTypeLabel(doc.file_type)}
                    </span>
                    {doc.category && (
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md bg-green-50 text-green-700">
                        {doc.category}
                      </span>
                    )}
                    {doc.folder && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 text-slate-600">
                        <IconFolder size={9} /> {doc.folder}
                      </span>
                    )}
                    {isCoach && doc.is_public === false && (
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-50 text-amber-700">
                        Coach only
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>{timeAgo(doc.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => { e.stopPropagation(); openPreview(doc); }}
                        className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                        title="Preview"
                      >
                        <IconEye size={14} />
                      </button>
                      <a
                        href={doc.file_url}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Upload Documents</h2>
                <p className="text-sm text-slate-500">{pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} selected</p>
              </div>
              <button
                onClick={() => { setShowUploadModal(false); setPendingFiles([]); setError(null); }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
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
                className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-green-400 hover:bg-green-50/30 transition-all cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconPlus size={24} className="mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-600">Add more files</p>
                <p className="text-xs text-slate-400 mt-0.5">Click or drag & drop</p>
              </div>

              {/* Pending files list */}
              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  {pendingFiles.map((pf) => (
                    <div
                      key={pf.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${getFileTypeColor(pf.file.type)}`}>
                        {getFileIcon(pf.file.type, 16)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={pf.title}
                          onChange={(e) => updatePendingTitle(pf.id, e.target.value)}
                          className="w-full bg-transparent text-sm font-medium text-slate-900 border-b border-transparent focus:border-green-500 focus:outline-none px-0 py-0.5"
                          placeholder="Document title"
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {pf.file.name} &middot; {formatFileSize(pf.file.size)}
                        </p>
                      </div>
                      <button
                        onClick={() => removePendingFile(pf.id)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
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
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Category</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600/20 focus:border-green-500 bg-white"
                  >
                    <option value="">None</option>
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Folder</label>
                  <select
                    value={uploadFolder}
                    onChange={(e) => setUploadFolder(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600/20 focus:border-green-500 bg-white"
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
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${uploadIsPublic ? 'bg-green-600 border-green-600' : 'border-slate-300 hover:border-slate-400'}`}>
                  {uploadIsPublic && <IconCheck size={12} className="text-white" />}
                </div>
                <span className="text-sm text-slate-700">Visible to players</span>
              </label>

              {/* Progress bar */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => { setShowUploadModal(false); setPendingFiles([]); setError(null); }}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-white transition-colors text-sm"
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
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {uploading ? `Uploading... ${uploadProgress}%` : `Upload ${pendingFiles.length} File${pendingFiles.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Modal ───────────────────────────────────────────── */}
      {showEditModal && editingDocument && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">Edit Document</h2>
              <button onClick={() => { setShowEditModal(false); setEditingDocument(null); }} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <IconX size={18} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{editError}</div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Title *</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600/20 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600/20 focus:border-green-500"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Category</label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600/20 focus:border-green-500 bg-white"
                >
                  <option value="">No category</option>
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => setEditForm(prev => ({ ...prev, is_public: !prev.is_public }))}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${editForm.is_public ? 'bg-green-600 border-green-600' : 'border-slate-300 hover:border-slate-400'}`}
                >
                  {editForm.is_public && <IconCheck size={12} className="text-white" />}
                </div>
                <span className="text-sm text-slate-700">Visible to players</span>
              </label>

              {isCoach && (
                <div className="pt-3 border-t border-slate-100">
                  <button
                    onClick={() => { setShowEditModal(false); openUploadVersionModal(editingDocument); }}
                    className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 font-medium"
                  >
                    <IconUpload size={14} />
                    Upload new version of this file
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => { setShowEditModal(false); setEditingDocument(null); }}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-white transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
              >
                {updating ? 'Saving...' : 'Save Changes'}
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">Version History</h2>
              <button onClick={closeVersionHistory} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
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
    </div>
  );
}
