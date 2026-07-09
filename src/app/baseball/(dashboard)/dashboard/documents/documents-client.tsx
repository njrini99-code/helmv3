'use client';

import { useMemo, useRef, useState } from 'react';
import { DocumentPreview } from '@/components/baseball/documents/DocumentPreview';
import { UploadNewVersionModal } from '@/components/baseball/documents/UploadNewVersionModal';
import { EditDocumentModal, type EditDocumentSaveData } from '@/components/baseball/documents/EditDocumentModal';
import { MoveToFolderModal, type MoveToFolderSaveData } from '@/components/baseball/documents/MoveToFolderModal';
import {
  DocumentVersionHistoryModal,
  type DocumentVersionRevertPatch,
} from '@/components/baseball/documents/DocumentVersionHistoryModal';
import type { BaseballDocument } from '@/app/baseball/actions/documents';
import {
  createBaseballDocument,
  deleteBaseballDocument,
  updateBaseballDocument,
  uploadBaseballDocument,
  uploadNewVersion,
} from '@/app/baseball/actions/documents';
import { useToast } from '@/components/ui/sonner';
import { DocumentsFairway } from '@/components/baseball/documents/DocumentsFairway';
import { fairwayScope } from '@/lib/redesign/flag';

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

// Category options available for the upload-time picker / edit modal.
// Excludes the 'all' pseudo-category used only by the filter tabs.
const DOCUMENT_UPLOAD_CATEGORIES = CATEGORIES.filter((c) => c.value !== 'all');

export function DocumentsClient({ documents: initialDocuments, coachId, teamId, isCoach }: DocumentsClientProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [previewDoc, setPreviewDoc] = useState<BaseballDocument | null>(null);
  const [versionDoc, setVersionDoc] = useState<BaseballDocument | null>(null);
  const [editingDoc, setEditingDoc] = useState<BaseballDocument | null>(null);
  const [historyDoc, setHistoryDoc] = useState<BaseballDocument | null>(null);
  const [movingDoc, setMovingDoc] = useState<BaseballDocument | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  // Upload-time picker state — replaces the previously hardcoded
  // category: 'general' / is_player_visible: true on every upload.
  const [uploadCategory, setUploadCategory] = useState('general');
  const [uploadIsPlayerVisible, setUploadIsPlayerVisible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const filtered = documents.filter(doc => {
    const matchesSearch = !search || doc.title.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || doc.category === category;
    return matchesSearch && matchesCategory;
  });

  const existingFolders = useMemo(() => {
    const set = new Set<string>();
    for (const doc of documents) {
      if (doc.folder) set.add(doc.folder);
    }
    return Array.from(set).sort();
  }, [documents]);

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
        category: uploadCategory,
        is_player_visible: uploadIsPlayerVisible,
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
          version_count: result.version?.version_number ?? ((d.version_count || 1) + 1),
        }
      : d
    ));
    showToast('New version uploaded', 'success');
  }

  function openEditModal(doc: BaseballDocument) {
    setEditingDoc(doc);
  }

  async function handleSaveEdit(data: EditDocumentSaveData) {
    const result = await updateBaseballDocument({
      id: data.id,
      title: data.title,
      description: data.description,
      category: data.category,
      is_player_visible: data.is_player_visible,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to save changes');
    }

    // Patch only the edited metadata fields — never replace the whole
    // document with the server row. `updateBaseballDocumentAction` returns
    // the raw DB row, whose file_url is a signed URL persisted at
    // upload/version time (no re-signing on update); a full-object replace
    // would clobber the fresh signed URL already held in local state
    // (from initial load's withFreshDocumentUrls / an upload / a version
    // action) with a value that's likely already expired.
    const updated = result.data;
    setDocuments(prev => prev.map(d => (d.id === data.id
      ? {
          ...d,
          title: updated.title,
          description: updated.description,
          category: updated.category,
          is_player_visible: updated.is_player_visible,
        }
      : d
    )));
    showToast('Document updated', 'success');
    setEditingDoc(null);
  }

  function openVersionHistory(doc: BaseballDocument) {
    setHistoryDoc(doc);
  }

  function handleDocumentReverted(patch: DocumentVersionRevertPatch) {
    setDocuments(prev => prev.map(d => (d.id === patch.id
      ? {
          ...d,
          version_count: patch.version_count,
          file_type: patch.file_type,
          file_size: patch.file_size,
          file_url: patch.file_url,
        }
      : d
    )));
    showToast(`Reverted to version ${patch.reverted_to_version_number}`, 'success');
  }

  function openMoveModal(doc: BaseballDocument) {
    setMovingDoc(doc);
  }

  async function handleSaveMove(data: MoveToFolderSaveData) {
    const result = await updateBaseballDocument({ id: data.id, folder: data.folder });

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to move document');
    }

    // Patch only the moved field for the same reason as handleSaveEdit above:
    // never replace the whole document with the server's un-re-signed row.
    const moved = result.data;
    setDocuments(prev => prev.map(d => (d.id === data.id ? { ...d, folder: moved.folder } : d)));
    showToast(data.folder ? `Moved to "${data.folder}"` : 'Removed from folder', 'success');
    setMovingDoc(null);
  }

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <DocumentsFairway
        filtered={filtered}
        totalCount={documents.length}
        isCoach={isCoach}
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        isUploadingDocument={isUploadingDocument}
        onUpload={openUploadPicker}
        uploadCategory={uploadCategory}
        onUploadCategoryChange={setUploadCategory}
        uploadIsPlayerVisible={uploadIsPlayerVisible}
        onUploadVisibilityChange={setUploadIsPlayerVisible}
        activeDropdown={activeDropdown}
        setActiveDropdown={setActiveDropdown}
        onPreview={(d) => setPreviewDoc(d)}
        onUploadVersion={isCoach ? (d) => setVersionDoc(d) : undefined}
        onDelete={isCoach ? handleDelete : undefined}
        onEdit={isCoach ? openEditModal : undefined}
        onViewHistory={isCoach ? openVersionHistory : undefined}
        onMoveToFolder={isCoach ? openMoveModal : undefined}
        fileInputSlot={
          isCoach ? (

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelected}
              className="hidden"
              accept={UPLOAD_ACCEPT}
            />
          ) : null
        }
        previewSlot={
          <DocumentPreview
            document={previewDoc}
            open={!!previewDoc}
            onOpenChange={(open) => {
              if (!open) setPreviewDoc(null);
            }}
          />
        }
        versionSlot={
          versionDoc && isCoach ? (
            <UploadNewVersionModal
              open={!!versionDoc}
              onClose={() => setVersionDoc(null)}
              documentTitle={versionDoc.title}
              currentFileType={versionDoc.file_type || null}
              onUpload={handleUploadNewVersion}
            />
          ) : null
        }
        editSlot={
          isCoach ? (
            <EditDocumentModal
              open={!!editingDoc}
              document={editingDoc}
              categories={DOCUMENT_UPLOAD_CATEGORIES}
              onClose={() => setEditingDoc(null)}
              onSave={handleSaveEdit}
            />
          ) : null
        }
        historySlot={
          isCoach ? (
            <DocumentVersionHistoryModal
              open={!!historyDoc}
              document={historyDoc}
              onClose={() => setHistoryDoc(null)}
              onReverted={handleDocumentReverted}
            />
          ) : null
        }
        moveSlot={
          isCoach ? (
            <MoveToFolderModal
              open={!!movingDoc}
              document={movingDoc}
              folders={existingFolders}
              onClose={() => setMovingDoc(null)}
              onMove={handleSaveMove}
            />
          ) : null
        }
      />
    </div>
  );
}
