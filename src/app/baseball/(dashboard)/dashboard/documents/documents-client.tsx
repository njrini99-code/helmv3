'use client';

import { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconFile, IconUpload, IconSearch } from '@/components/icons';
import { DocumentCard } from '@/components/baseball/documents/DocumentCard';
import { DocumentPreview } from '@/components/baseball/documents/DocumentPreview';
import { UploadNewVersionModal } from '@/components/baseball/documents/UploadNewVersionModal';
import type { BaseballDocument } from '@/app/baseball/actions/documents';
import {
  createBaseballDocument,
  deleteBaseballDocument,
  uploadBaseballDocument,
  uploadNewVersion,
} from '@/app/baseball/actions/documents';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

const UPLOAD_ACCEPT =
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*,text/plain,video/mp4,video/webm,video/quicktime';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'rules', label: 'Rules' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'scouting', label: 'Scouting' },
  { value: 'academic', label: 'Academic' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'media', label: 'Media' },
];

interface DocumentsClientProps {
  documents: BaseballDocument[];
  coachId: string;
  teamId: string;
  isCoach: boolean;
}

export function DocumentsClient({ documents: initialDocuments, coachId, teamId, isCoach }: DocumentsClientProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [previewDoc, setPreviewDoc] = useState<BaseballDocument | null>(null);
  const [versionDoc, setVersionDoc] = useState<BaseballDocument | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const filtered = documents.filter(doc => {
    const matchesSearch = !search || doc.title.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || doc.category === category;
    return matchesSearch && matchesCategory;
  });

  async function handleDelete(doc: BaseballDocument) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;

    const result = await deleteBaseballDocument(doc.id);
    if (result.success) {
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      showToast('Document deleted', 'success');
    } else {
      showToast(result.error || 'Failed to delete', 'error');
    }
  }

  function openUploadPicker() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again still fires onChange
    e.target.value = '';
    if (!file) return;

    setIsUploadingDocument(true);
    try {
      const uploadResult = await uploadBaseballDocument(file, teamId);
      if (!uploadResult.success || !uploadResult.file_url) {
        showToast(uploadResult.error || 'Failed to upload file', 'error');
        return;
      }

      const createResult = await createBaseballDocument({
        team_id: teamId,
        title: file.name.replace(/\.[^/.]+$/, '') || file.name,
        file_url: uploadResult.file_url,
        storage_path: uploadResult.storage_path,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        category: 'general',
        is_player_visible: true,
        uploaded_by: coachId,
      });

      if (!createResult.success || !createResult.data) {
        showToast(createResult.error || 'Failed to save document', 'error');
        return;
      }

      setDocuments(prev => [createResult.data as BaseballDocument, ...prev]);
      showToast('Document uploaded', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to upload document', 'error');
    } finally {
      setIsUploadingDocument(false);
    }
  }

  async function handleUploadNewVersion(file: File, changeNotes: string) {
    if (!versionDoc) return;

    const result = await uploadNewVersion(versionDoc.id, file, teamId, coachId, changeNotes);
    if (!result.success) {
      throw new Error(result.error || 'Failed to upload new version');
    }

    setDocuments(prev => prev.map(d => d.id === versionDoc.id
      ? {
          ...d,
          file_url: result.version?.file_url || d.file_url,
          file_type: result.version?.mime_type || d.file_type,
          file_size: result.version?.file_size ?? d.file_size,
          version_count: (d.version_count || 1) + 1,
        }
      : d
    ));
    showToast('New version uploaded', 'success');
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Hidden file input driving both the header and empty-state upload triggers */}
      {isCoach && (
        // eslint-disable-next-line helm/no-raw-input -- hidden native file picker (no design-system equivalent)
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelected}
          className="hidden"
          accept={UPLOAD_ACCEPT}
        />
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-warm-200 rounded-lg placeholder:text-warm-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <Button variant="primary"
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap',
                category === cat.value
                  ? 'bg-primary-100 text-primary-700 border-primary-200'
                  : 'bg-white text-warm-600 border-warm-200 hover:border-warm-300'
              )}
            >
              {cat.label}
            </Button>
          ))}
        </div>
        {isCoach && (
          <Button
            variant="primary"
            onClick={openUploadPicker}
            isLoading={isUploadingDocument}
            leftIcon={<IconUpload size={16} />}
            className="whitespace-nowrap flex-shrink-0"
          >
            Upload
          </Button>
        )}
      </div>

      {/* Documents Grid */}
      {filtered.length === 0 ? (
        <Card variant="glass">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconFile size={28} className="text-warm-400" />
            </div>
            <h3 className="text-lg font-semibold text-warm-900 mb-2">
              {documents.length === 0 ? 'No Documents' : 'No Results'}
            </h3>
            <p className="text-warm-500 mb-6 max-w-sm mx-auto">
              {documents.length === 0
                ? isCoach
                  ? 'Upload playbooks, practice plans, waivers, and other team documents.'
                  : 'No documents have been shared yet. Check back later.'
                : 'Try adjusting your search or filters.'}
            </p>
            {documents.length === 0 && isCoach && (
              <Button
                onClick={openUploadPicker}
                isLoading={isUploadingDocument}
                leftIcon={<IconUpload size={16} />}
              >
                Upload Document
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(doc => (
            <DocumentCard
              key={doc.id}
              document={doc}
              isCoach={isCoach}
              activeDropdown={activeDropdown}
              setActiveDropdown={setActiveDropdown}
              onPreview={(d) => setPreviewDoc(d)}
              onUploadVersion={isCoach ? (d) => setVersionDoc(d) : undefined}
              onDelete={isCoach ? handleDelete : undefined}
            />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      <DocumentPreview
        document={previewDoc}
        open={!!previewDoc}
        onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
      />

      {/* Upload New Version Modal */}
      {versionDoc && isCoach && (
        <UploadNewVersionModal
          open={!!versionDoc}
          onClose={() => setVersionDoc(null)}
          documentTitle={versionDoc.title}
          currentFileType={versionDoc.file_type || null}
          onUpload={handleUploadNewVersion}
        />
      )}
    </div>
  );
}
