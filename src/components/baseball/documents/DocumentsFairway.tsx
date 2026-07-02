'use client';

/**
 * ============================================================================
 * DocumentsFairway — Fairway (warm-premium) presentation of the baseball
 * Documents page. Phase B leaf migration, Wave 2 · documents. Flag-gated
 * behind `isRedesignEnabled()` — see the client fork.
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Receives the SAME computed state + handlers the client
 * owns (filtered docs, search/category state, upload state, and the card
 * callbacks) and migrates the CHROME — header + upload, search, category tabs,
 * empty state — to `@/components/fairway` primitives.
 *
 * The document cards are rendered from the reused `DocumentCard` (which owns
 * its own menu + actions); the hidden file input, preview modal, and
 * new-version modal are passed in as slots so their refs/state stay with the
 * client. No data path (upload/create/delete/version actions) is touched here.
 * ========================================================================== */

import type { ComponentProps, ReactNode } from 'react';
import { Upload, FileText } from 'lucide-react';
import {
  ViewHeader,
  SearchField,
  Segmented,
  Button,
  EmptyState,
  Select,
  Switch,
} from '@/components/fairway';
import { DocumentCard } from './DocumentCard';
import type { BaseballDocument } from '@/app/baseball/actions/documents';

type CardProps = ComponentProps<typeof DocumentCard>;

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

export interface DocumentsFairwayProps {
  filtered: BaseballDocument[];
  totalCount: number;
  isCoach: boolean;
  search: string;
  onSearchChange: (s: string) => void;
  category: string;
  onCategoryChange: (c: string) => void;
  isUploadingDocument: boolean;
  onUpload: () => void;
  /** Category applied to the next upload (coach-only picker, replaces the old hardcoded 'general'). */
  uploadCategory: string;
  onUploadCategoryChange: (c: string) => void;
  /** Player-visibility applied to the next upload (coach-only picker, replaces the old hardcoded true). */
  uploadIsPlayerVisible: boolean;
  onUploadVisibilityChange: (v: boolean) => void;
  activeDropdown: CardProps['activeDropdown'];
  setActiveDropdown: CardProps['setActiveDropdown'];
  onPreview: CardProps['onPreview'];
  onUploadVersion: CardProps['onUploadVersion'];
  onDelete: CardProps['onDelete'];
  onEdit: CardProps['onEdit'];
  onViewHistory: CardProps['onViewHistory'];
  onMoveToFolder: CardProps['onMoveToFolder'];
  fileInputSlot: ReactNode;
  previewSlot: ReactNode;
  versionSlot: ReactNode;
  editSlot: ReactNode;
  historySlot: ReactNode;
  moveSlot: ReactNode;
}

export function DocumentsFairway({
  filtered,
  totalCount,
  isCoach,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  isUploadingDocument,
  onUpload,
  uploadCategory,
  onUploadCategoryChange,
  uploadIsPlayerVisible,
  onUploadVisibilityChange,
  activeDropdown,
  setActiveDropdown,
  onPreview,
  onUploadVersion,
  onDelete,
  onEdit,
  onViewHistory,
  onMoveToFolder,
  fileInputSlot,
  previewSlot,
  versionSlot,
  editSlot,
  historySlot,
  moveSlot,
}: DocumentsFairwayProps) {
  const uploadCategoryOptions = CATEGORIES.filter((c) => c.value !== 'all');
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      {fileInputSlot}

      <ViewHeader
        title="Documents"
        description={isCoach ? 'Share playbooks, plans, and team files' : 'Team documents and resources'}
        primaryAction={
          isCoach ? (
            <Button
              variant="primary"
              size="sm"
              busy={isUploadingDocument}
              leftIcon={<Upload className="h-4 w-4" />}
              onClick={onUpload}
            >
              Upload
            </Button>
          ) : undefined
        }
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:max-w-xs sm:flex-1">
          <SearchField
            size="sm"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onClear={() => onSearchChange('')}
            placeholder="Search documents"
            aria-label="Search documents"
          />
        </div>
        <div className="-mx-4 max-w-full overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Segmented
            size="sm"
            aria-label="Filter by category"
            value={category}
            onValueChange={onCategoryChange}
            options={CATEGORIES}
          />
        </div>
      </div>

      {isCoach && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-text-secondary">
          <div className="flex items-center gap-2">
            <span className="text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
              Next upload
            </span>
            <Select
              size="sm"
              value={uploadCategory}
              onValueChange={(value) => {
                if (value) onUploadCategoryChange(value);
              }}
              options={uploadCategoryOptions}
              aria-label="Category for the next upload"
              className="min-w-[9rem]"
            />
          </div>
          <Switch
            checked={uploadIsPlayerVisible}
            onCheckedChange={onUploadVisibilityChange}
            label="Visible to players"
          />
        </div>
      )}

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={totalCount === 0 ? 'No documents' : 'No results'}
            description={
              totalCount === 0
                ? isCoach
                  ? 'Upload playbooks, practice plans, waivers, and other team documents.'
                  : 'No documents have been shared yet. Check back later.'
                : 'Try adjusting your search or filters.'
            }
            action={
              totalCount === 0 && isCoach ? (
                <Button
                  variant="primary"
                  size="sm"
                  busy={isUploadingDocument}
                  leftIcon={<Upload className="h-4 w-4" />}
                  onClick={onUpload}
                >
                  Upload document
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                isCoach={isCoach}
                activeDropdown={activeDropdown}
                setActiveDropdown={setActiveDropdown}
                onPreview={onPreview}
                onUploadVersion={onUploadVersion}
                onDelete={onDelete}
                onEdit={onEdit}
                onViewHistory={onViewHistory}
                onMoveToFolder={onMoveToFolder}
              />
            ))}
          </div>
        )}
      </div>

      {previewSlot}
      {versionSlot}
      {editSlot}
      {historySlot}
      {moveSlot}
    </div>
  );
}

export default DocumentsFairway;
