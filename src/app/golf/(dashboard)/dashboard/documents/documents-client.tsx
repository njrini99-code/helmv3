'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import { IconFolder, IconFile, IconDownload, IconTrash, IconUpload, IconX } from '@/components/icons';
import { uploadGolfDocument, createGolfDocument, deleteGolfDocument } from '@/app/golf/actions/documents';

interface Document {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string;
  file_size: number;
  category: string | null;
  player_visible: boolean | null;
  created_at: string | null;
  uploaded_by: string;
  uploader?: {
    full_name: string;
  } | null;
}

interface DocumentsClientProps {
  documents: Document[];
  coachId: string;
  teamId: string;
  isCoach: boolean;
}

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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
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
    if (!confirm('Are you sure you want to delete this document?')) return;

    const result = await deleteGolfDocument(documentId, filePath);

    if (result.success) {
      setDocuments(docs => docs.filter(d => d.id !== documentId));
      router.refresh();
    } else {
      alert(result.error || 'Failed to delete document');
    }
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="relative glass-standard rounded-xl overflow-hidden p-6 hover:shadow-lg transition-all group"
              >
                <ShineEffect />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-4xl">{getFileIcon(doc.file_type)}</div>
                    {isCoach && (
                      <button
                        onClick={() => handleDelete(doc.id, doc.file_url.split('/').slice(-2).join('/'))}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-all"
                      >
                        <IconTrash size={16} />
                      </button>
                    )}
                  </div>

                  <h3 className="font-semibold text-slate-900 mb-1 truncate">{doc.title}</h3>
                  {doc.description && (
                    <p className="text-sm text-slate-500 mb-3 line-clamp-2">{doc.description}</p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Unknown date'}</span>
                  </div>

                  {doc.category && (
                    <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-50 text-green-700 mb-3">
                      {doc.category}
                    </span>
                  )}

                  <a
                    href={doc.file_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors text-sm"
                  >
                    <IconDownload size={16} />
                    Download
                  </a>
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
    </div>
  );
}
