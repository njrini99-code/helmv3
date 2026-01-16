'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import { IconFolder, IconDownload, IconTrash, IconUpload, IconX, IconSearch, IconEdit, IconClock, IconEye, IconLayers } from '@/components/icons';
import {
  uploadGolfDocument,
  createGolfDocument,
  deleteGolfDocument,
  updateGolfDocument,
  uploadNewVersion,
  getVersionHistory,
  revertToVersion,
  deleteVersion,
} from '@/app/golf/actions/documents';
import type { DocumentVersion } from '@/app/golf/actions/documents';
import { DocumentPreview } from '@/components/golf/documents/DocumentPreview';
import { VersionHistory } from '@/components/golf/documents/VersionHistory';
import { UploadNewVersionModal } from '@/components/golf/documents/UploadNewVersionModal';

interface Document {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  player_visible: boolean | null;
  created_at: string | null;
  uploaded_by: string | null;
  current_version_id?: string | null;
  version_count?: number | null;
  uploader?: {
    full_name: string | null;
  } | null;
}

interface DocumentsClientProps {
  documents: Document[];
  coachId: string;
  teamId: string;
  isCoach: boolean;
}

const CATEGORIES = ['Schedule', 'Rules', 'Forms', 'Training', 'Other'];

export function DocumentsClient({ documents: initialDocuments, coachId, teamId, isCoach }: DocumentsClientProps) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    category: '',
    player_visible: true,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    category: '',
    player_visible: true,
  });
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Preview modal state
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Version history modal state
  const [versionHistoryDocument, setVersionHistoryDocument] = useState<Document | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Upload new version modal state
  const [uploadVersionDocument, setUploadVersionDocument] = useState<Document | null>(null);
  const [showUploadVersionModal, setShowUploadVersionModal] = useState(false);

  // Filtered documents based on search and category
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = !searchQuery ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = !categoryFilter || doc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const formatFileSize = (bytes: number | null) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return '📎';
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('sheet') || fileType.includes('excel')) return '📊';
    if (fileType.includes('video')) return '🎥';
    return '📎';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadForm.title) {
        setUploadForm(prev => ({ ...prev, title: file.name }));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    if (!uploadForm.title.trim()) {
      setError('Please enter a title');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Upload file to storage
      const uploadResult = await uploadGolfDocument(selectedFile, teamId);

      if (!uploadResult.success) {
        setError(uploadResult.error || 'Failed to upload file');
        setUploading(false);
        return;
      }

      // Create document record
      const createResult = await createGolfDocument({
        team_id: teamId,
        title: uploadForm.title,
        description: uploadForm.description || undefined,
        file_url: uploadResult.file_url!,
        file_type: selectedFile.type,
        file_size: selectedFile.size,
        category: uploadForm.category || undefined,
        player_visible: uploadForm.player_visible,
        uploaded_by: coachId,
      });

      if (!createResult.success) {
        setError(createResult.error || 'Failed to create document');
        setUploading(false);
        return;
      }

      // Reset form and close modal
      setUploadForm({
        title: '',
        description: '',
        category: '',
        player_visible: true,
      });
      setSelectedFile(null);
      setShowUploadModal(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string, filePath: string) => {
    if (!confirm('Are you sure you want to delete this document? All versions will be deleted.')) return;

    const result = await deleteGolfDocument(documentId, filePath);

    if (result.success) {
      setDocuments(docs => docs.filter(d => d.id !== documentId));
      router.refresh();
    } else {
      alert(result.error || 'Failed to delete document');
    }
  };

  const openEditModal = (doc: Document) => {
    setEditingDocument(doc);
    setEditForm({
      title: doc.title,
      description: doc.description || '',
      category: doc.category || '',
      player_visible: doc.player_visible ?? true,
    });
    setEditError(null);
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!editingDocument) return;

    if (!editForm.title.trim()) {
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
        player_visible: editForm.player_visible,
      });

      if (!result.success) {
        setEditError(result.error || 'Failed to update document');
        setUpdating(false);
        return;
      }

      // Update local state
      setDocuments(docs =>
        docs.map(d =>
          d.id === editingDocument.id
            ? {
                ...d,
                title: editForm.title,
                description: editForm.description || null,
                category: editForm.category || null,
                player_visible: editForm.player_visible,
              }
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

  // Preview handlers
  const openPreview = (doc: Document) => {
    setPreviewDocument(doc);
    setShowPreview(true);
  };

  const closePreview = () => {
    setShowPreview(false);
    setPreviewDocument(null);
  };

  // Version history handlers
  const openVersionHistory = useCallback(async (doc: Document) => {
    setVersionHistoryDocument(doc);
    setLoadingVersions(true);
    setShowVersionHistory(true);

    const result = await getVersionHistory(doc.id);
    if (result.success && result.versions) {
      setVersions(result.versions);
    } else {
      setVersions([]);
    }
    setLoadingVersions(false);
  }, []);

  const closeVersionHistory = () => {
    setShowVersionHistory(false);
    setVersionHistoryDocument(null);
    setVersions([]);
  };

  const handleRevert = async (versionId: string) => {
    if (!versionHistoryDocument) return;

    const result = await revertToVersion(versionHistoryDocument.id, versionId, coachId);
    if (result.success) {
      // Refresh version history
      const historyResult = await getVersionHistory(versionHistoryDocument.id);
      if (historyResult.success && historyResult.versions) {
        setVersions(historyResult.versions);
      }
      router.refresh();
    } else {
      throw new Error(result.error || 'Failed to revert');
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!versionHistoryDocument) return;

    const result = await deleteVersion(versionHistoryDocument.id, versionId);
    if (result.success) {
      // Refresh version history
      const historyResult = await getVersionHistory(versionHistoryDocument.id);
      if (historyResult.success && historyResult.versions) {
        setVersions(historyResult.versions);
      }
      router.refresh();
    } else {
      throw new Error(result.error || 'Failed to delete version');
    }
  };

  const handlePreviewVersion = (version: DocumentVersion) => {
    if (!versionHistoryDocument) return;

    // Create a temporary document object for preview
    const versionDoc: Document = {
      ...versionHistoryDocument,
      file_url: version.file_url,
      file_size: version.file_size,
    };

    setPreviewDocument(versionDoc);
    setShowPreview(true);
  };

  // Upload new version handlers
  const openUploadVersionModal = (doc: Document) => {
    setUploadVersionDocument(doc);
    setShowUploadVersionModal(true);
  };

  const closeUploadVersionModal = () => {
    setShowUploadVersionModal(false);
    setUploadVersionDocument(null);
  };

  const handleUploadNewVersion = async (file: File, changeNotes: string) => {
    if (!uploadVersionDocument) return;

    const result = await uploadNewVersion(
      uploadVersionDocument.id,
      file,
      teamId,
      coachId,
      changeNotes
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to upload new version');
    }

    // Update local document state
    setDocuments(docs =>
      docs.map(d =>
        d.id === uploadVersionDocument.id
          ? {
              ...d,
              file_url: result.version?.file_url || d.file_url,
              file_size: result.version?.file_size || d.file_size,
              version_count: (d.version_count || 1) + 1,
              current_version_id: result.version?.id,
            }
          : d
      )
    );

    closeUploadVersionModal();
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
            <p className="text-slate-500 mt-1">Team files and resources</p>
          </div>
          {isCoach && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <IconUpload size={18} />
              Upload Document
            </button>
          )}
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <IconSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent text-slate-700 bg-white min-w-[160px]"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {documents.length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-12 text-center">
            <ShineEffect />
            <IconFolder size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No Documents Yet
            </h3>
            <p className="text-slate-500 mb-4">
              {isCoach ? 'Upload documents to share with your team' : 'Your team files and resources will appear here'}
            </p>
            {isCoach && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Upload First Document
              </button>
            )}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-12 text-center">
            <ShineEffect />
            <IconSearch size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No Matching Documents
            </h3>
            <p className="text-slate-500 mb-4">
              Try adjusting your search or filter criteria
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('');
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="relative glass-standard rounded-xl overflow-hidden p-6 hover:shadow-lg transition-all group cursor-pointer"
                onClick={() => openPreview(doc)}
              >
                <ShineEffect />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-4xl">{getFileIcon(doc.file_type)}</div>
                    <div className="flex items-center gap-1">
                      {/* Version badge */}
                      {doc.version_count && doc.version_count > 1 && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 flex items-center gap-1">
                          <IconLayers size={12} />
                          {doc.version_count}
                        </span>
                      )}
                      {isCoach && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openVersionHistory(doc);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-all"
                            title="Version history"
                          >
                            <IconClock size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(doc);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-all"
                            title="Edit document"
                          >
                            <IconEdit size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(doc.id, doc.file_url.split('/').slice(-2).join('/'));
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-all"
                            title="Delete document"
                          >
                            <IconTrash size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-900 mb-1 truncate">{doc.title}</h3>
                  {doc.description && (
                    <p className="text-sm text-slate-500 mb-3 line-clamp-2">{doc.description}</p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Unknown date'}</span>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    {doc.category && (
                      <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-50 text-green-700">
                        {doc.category}
                      </span>
                    )}
                    {isCoach && doc.player_visible === false && (
                      <span className="inline-block px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-600">
                        Coach only
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreview(doc);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors text-sm"
                    >
                      <IconEye size={16} />
                      Preview
                    </button>
                    <a
                      href={doc.file_url}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-center px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors text-sm"
                      title="Download"
                    >
                      <IconDownload size={16} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Upload Document</h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setError(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <IconX size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  File
                </label>
                <input
                  type="file"
                  accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*,text/plain,video/mp4,video/webm,video/quicktime"
                  onChange={handleFileSelect}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                />
                {selectedFile && (
                  <p className="text-sm text-slate-500 mt-2">
                    {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  placeholder="Document title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Category
                </label>
                <select
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                >
                  <option value="">No category</option>
                  <option value="Schedule">Schedule</option>
                  <option value="Rules">Rules</option>
                  <option value="Forms">Forms</option>
                  <option value="Training">Training</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="player_visible"
                  checked={uploadForm.player_visible}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, player_visible: e.target.checked }))}
                  className="rounded border-slate-300"
                />
                <label htmlFor="player_visible" className="text-sm text-slate-700">
                  Visible to players
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading || !selectedFile}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingDocument && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Edit Document</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingDocument(null);
                  setEditError(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <IconX size={20} />
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {editError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  placeholder="Document title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Category
                </label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                >
                  <option value="">No category</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_player_visible"
                  checked={editForm.player_visible}
                  onChange={(e) => setEditForm(prev => ({ ...prev, player_visible: e.target.checked }))}
                  className="rounded border-slate-300"
                />
                <label htmlFor="edit_player_visible" className="text-sm text-slate-700">
                  Visible to players
                </label>
              </div>

              {/* Upload new version shortcut */}
              {isCoach && (
                <div className="pt-2 border-t border-slate-200">
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      openUploadVersionModal(editingDocument);
                    }}
                    className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 font-medium"
                  >
                    <IconUpload size={16} />
                    Upload new version of this file
                  </button>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingDocument(null);
                    setEditError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={updating}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDocument && (
        <DocumentPreview
          open={showPreview}
          onClose={closePreview}
          document={previewDocument}
          onShowVersionHistory={isCoach ? () => {
            closePreview();
            openVersionHistory(previewDocument);
          } : undefined}
          onUploadNewVersion={isCoach ? () => {
            closePreview();
            openUploadVersionModal(previewDocument);
          } : undefined}
          isCoach={isCoach}
          versionCount={previewDocument.version_count}
        />
      )}

      {/* Version History Modal */}
      {versionHistoryDocument && (
        <VersionHistory
          open={showVersionHistory}
          onClose={closeVersionHistory}
          documentTitle={versionHistoryDocument.title}
          versions={versions}
          currentVersionId={versionHistoryDocument.current_version_id || null}
          isCoach={isCoach}
          onRevert={handleRevert}
          onDelete={handleDeleteVersion}
          onPreviewVersion={handlePreviewVersion}
        />
      )}

      {/* Upload New Version Modal */}
      {uploadVersionDocument && (
        <UploadNewVersionModal
          open={showUploadVersionModal}
          onClose={closeUploadVersionModal}
          documentTitle={uploadVersionDocument.title}
          currentFileType={uploadVersionDocument.file_type}
          onUpload={handleUploadNewVersion}
        />
      )}
    </div>
  );
}
