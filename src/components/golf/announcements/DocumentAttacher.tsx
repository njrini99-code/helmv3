'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconFile, IconX, IconPlus, IconSearch } from '@/components/icons';

interface Document {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
}

interface DocumentAttacherProps {
  existingDocuments: Document[];
  selectedDocumentIds: string[];
  onChange: (documentIds: string[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string): string {
  if (fileType.includes('pdf')) return 'PDF';
  if (fileType.includes('doc') || fileType.includes('word')) return 'DOC';
  if (fileType.includes('sheet') || fileType.includes('xls') || fileType.includes('csv')) return 'XLS';
  if (fileType.includes('image') || fileType.includes('png') || fileType.includes('jpg')) return 'IMG';
  if (fileType.includes('video')) return 'VID';
  return 'FILE';
}

function getFileColor(fileType: string): { bg: string; text: string } {
  if (fileType.includes('pdf')) return { bg: 'bg-red-50', text: 'text-red-600' };
  if (fileType.includes('doc') || fileType.includes('word')) return { bg: 'bg-blue-50', text: 'text-blue-600' };
  if (fileType.includes('sheet') || fileType.includes('xls') || fileType.includes('csv')) return { bg: 'bg-primary-50', text: 'text-primary-600' };
  if (fileType.includes('image') || fileType.includes('png') || fileType.includes('jpg')) return { bg: 'bg-purple-50', text: 'text-purple-600' };
  return { bg: 'bg-warm-50', text: 'text-warm-600' };
}

export function DocumentAttacher({ existingDocuments, selectedDocumentIds, onChange }: DocumentAttacherProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const availableDocs = existingDocuments.filter(d => !selectedDocumentIds.includes(d.id));
  const selectedDocs = existingDocuments.filter(d => selectedDocumentIds.includes(d.id));

  const filteredDocs = availableDocs.filter(d => {
    if (!searchQuery) return true;
    return d.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  function addDocument(docId: string) {
    onChange([...selectedDocumentIds, docId]);
  }

  function removeDocument(docId: string) {
    onChange(selectedDocumentIds.filter(id => id !== docId));
  }

  return (
    <div>
      <label className="text-sm font-medium text-warm-700 block mb-2">
        Attachments
      </label>

      {/* Selected documents */}
      <AnimatePresence mode="popLayout">
        {selectedDocs.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-wrap gap-2 mb-3"
          >
            {selectedDocs.map((doc) => {
              const colors = getFileColor(doc.file_type);
              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  layout
                  className={cn(
                    'flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg border border-warm-200',
                    'bg-white shadow-sm'
                  )}
                >
                  <div className={cn('w-6 h-6 rounded flex items-center justify-center', colors.bg)}>
                    <span className={cn('text-[9px] font-bold', colors.text)}>
                      {getFileIcon(doc.file_type)}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-warm-700 max-w-[140px] truncate">
                    {doc.title}
                  </span>
                  <span className="text-xs text-warm-400">
                    {formatFileSize(doc.file_size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDocument(doc.id)}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-50 text-warm-400 hover:text-red-500 transition-colors"
                  >
                    <IconX size={12} />
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add document button/dropdown */}
      {existingDocuments.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed transition-all text-sm',
              isExpanded
                ? 'border-primary-300 bg-primary-50/50 text-primary-700'
                : 'border-warm-300 hover:border-warm-400 text-warm-500 hover:text-warm-700'
            )}
          >
            <IconPlus size={14} />
            <span>Attach Document</span>
            {availableDocs.length > 0 && (
              <span className="text-xs text-warm-400">({availableDocs.length} available)</span>
            )}
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
                className="overflow-hidden"
              >
                <div className="mt-2 border border-warm-200 rounded-xl overflow-hidden">
                  {availableDocs.length > 3 && (
                    <div className="px-3 py-2 border-b border-warm-100 flex items-center gap-2">
                      <IconSearch size={14} className="text-warm-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search documents..."
                        className="w-full text-sm text-warm-900 placeholder:text-warm-400 bg-transparent outline-none"
                      />
                    </div>
                  )}
                  <div className="max-h-40 overflow-y-auto p-1.5 space-y-0.5">
                    {filteredDocs.map((doc) => {
                      const colors = getFileColor(doc.file_type);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => {
                            addDocument(doc.id);
                            if (availableDocs.length <= 1) setIsExpanded(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-warm-50 active:bg-warm-100 text-left transition-colors"
                        >
                          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', colors.bg)}>
                            <span className={cn('text-xs font-bold', colors.text)}>
                              {getFileIcon(doc.file_type)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-warm-700 truncate">{doc.title}</p>
                            <p className="text-xs text-warm-400">{formatFileSize(doc.file_size)}</p>
                          </div>
                          <IconPlus size={14} className="text-warm-400 flex-shrink-0" />
                        </button>
                      );
                    })}
                    {filteredDocs.length === 0 && (
                      <p className="text-sm text-warm-400 text-center py-4">
                        {searchQuery ? 'No documents match' : 'All documents attached'}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-warm-200 text-sm text-warm-400">
          <IconFile size={14} />
          <span>No team documents available to attach</span>
        </div>
      )}
    </div>
  );
}
