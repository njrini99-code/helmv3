'use client';

import { useState, useRef } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IconX, IconUpload, IconFileText, IconSparkles } from '@/components/icons';
import { parseScheduleText, type ParsedClass } from '@/lib/utils/schedule-parser';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

type PdfJsTextItem = { str: string; transform?: number[] };
type PdfJsPage = { getTextContent: () => Promise<{ items: PdfJsTextItem[] }> };
type PdfJsDocument = { numPages: number; getPage: (page: number) => Promise<PdfJsPage> };
type PdfJsLib = {
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

interface UploadScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParsed: (classes: ParsedClass[]) => void;
}

// Distinct sentinel so the caller can tell a CDN/library *load* failure apart
// from a *parse* failure and show the right message (P225). A load failure is
// recoverable by switching to TXT/paste; a parse failure usually means a
// scanned/image-only PDF.
const PDFJS_LOAD_ERROR = 'pdfjs-load-failed';

// Load PDF.js from CDN (avoids Vercel native dependency issues). The runtime
// pdfjs-dist in node_modules is a transitive *dev* dependency on a different
// major (5.x) with an incompatible ESM API, so we pin the 3.x CDN build that
// matches this code — but with a Subresource Integrity (SRI) hash so a
// tampered/poisoned CDN response is rejected by the browser instead of
// executed. (P225) Hashes are the official cdnjs SRI for pdf.js 3.11.174.
const loadPdfJs = async (): Promise<PdfJsLib> => {
  const PDFJS_VERSION = '3.11.174';
  const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
  // sha512 SRI from https://api.cdnjs.com/libraries/pdf.js/3.11.174?fields=sri
  const PDFJS_MAIN_SRI =
    'sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==';

  // Check if already loaded
  const pdfWindow = window as Window & { pdfjsLib?: PdfJsLib };
  if (pdfWindow.pdfjsLib) {
    return pdfWindow.pdfjsLib;
  }

  // Load the main library with SRI + CORS (required for the browser to verify
  // the integrity hash on a cross-origin script).
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${PDFJS_CDN}/pdf.min.js`;
      script.integrity = PDFJS_MAIN_SRI;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      // Fires for network failure, CSP/offline block, AND SRI mismatch.
      script.onerror = () => reject(new Error(PDFJS_LOAD_ERROR));
      document.head.appendChild(script);
    });
  } catch {
    throw new Error(PDFJS_LOAD_ERROR);
  }

  const pdfjsLib = pdfWindow.pdfjsLib;
  if (!pdfjsLib) {
    throw new Error(PDFJS_LOAD_ERROR);
  }
  // Type assertion needed because TypeScript can't infer the type after dynamic script load
  const typedPdfjsLib = pdfjsLib as PdfJsLib;
  typedPdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;

  return typedPdfjsLib;
};

export function UploadScheduleModal({ isOpen, onClose, onParsed }: UploadScheduleModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Group text items by Y position to preserve rows
        const items = textContent.items as PdfJsTextItem[];

        if (items.length === 0) {
          continue;
        }

        // Sort by Y position (descending - PDF coordinates start from bottom)
        // then by X position (ascending - left to right)
        const sortedItems = [...items].sort((a, b) => {
          const aY = a.transform?.[5] ?? 0;
          const bY = b.transform?.[5] ?? 0;
          const yDiff = bY - aY; // Y is index 5
          if (Math.abs(yDiff) > 5) return yDiff; // Different row (5px threshold)
          const aX = a.transform?.[4] ?? 0;
          const bX = b.transform?.[4] ?? 0;
          return aX - bX; // Same row, sort by X
        });

        // Group items into rows based on Y position
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let lastY = sortedItems[0]?.transform?.[5] ?? 0;

        for (const item of sortedItems) {
          const y = item.transform?.[5] ?? 0;
          // If Y changed significantly, start a new row
          if (Math.abs(y - lastY) > 5) {
            if (currentRow.length > 0) {
              rows.push(currentRow);
            }
            currentRow = [];
            lastY = y;
          }
          if (item.str?.trim()) {
            currentRow.push(item.str.trim());
          }
        }
        // Don't forget last row
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }

        // Join each row with tabs (to separate columns), rows with newlines
        const pageText = rows.map(row => row.join('\t')).join('\n');
        fullText += pageText + '\n';
      }

      return fullText;
    } catch (err) {
      // Distinguish a library *load* failure (CDN blocked by CSP/offline/
      // ad-block, or an SRI mismatch) from an actual *parse* failure, so the
      // player gets an actionable message instead of one catch-all. (P225)
      if (err instanceof Error && err.message === PDFJS_LOAD_ERROR) {
        throw new Error(
          'PDF import is unavailable right now (the PDF reader could not be loaded — this can happen offline or on a restricted network). Please use a TXT file or paste your schedule text instead.',
        );
      }
      throw new Error('Failed to read this PDF. It may be a scanned/image-only file. Try using TXT or paste text instead.');
    }
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setError('');

    try {
      let text = '';

      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        text = await file.text();
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or TXT file.');
      }

      const classes = parseScheduleText(text);

      if (classes.length === 0) {
        setError('No classes found in the file. Try pasting your schedule text instead.');
        setLoading(false);
        return;
      }

      onParsed(classes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file. Try pasting your schedule text instead.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      await processFile(files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      await processFile(files[0]);
    }
  };

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) {
      setError('Please paste your schedule text');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const classes = parseScheduleText(pastedText);
      
      if (classes.length === 0) {
        setError('No classes found. Make sure to include course codes like "BUAD 123"');
        setLoading(false);
        return;
      }
      
      onParsed(classes);
    } catch {
      setError('Failed to parse schedule. Please check the format.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        className="sm:max-w-xl sm:mx-auto sm:rounded-3xl p-0 overflow-hidden"
        aria-labelledby="upload-schedule-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center">
              <IconSparkles size={20} className="text-accent-700" />
            </div>
            <div>
              <DrawerTitle id="upload-schedule-title" className="text-body-lg font-medium text-text-primary tracking-[-0.012em]">
                Import Schedule
              </DrawerTitle>
              <p className="text-sm text-text-tertiary">Upload or paste your class schedule</p>
            </div>
          </div>
          <IconButton variant="default"
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-text-tertiary hover:text-text-secondary hover:bg-surface-sunken active:bg-surface-sunken rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
          >
            <IconX size={20} />
          </IconButton>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {/* Toggle */}
          <div className="flex gap-2 mb-6">
            <Button variant="primary"
              onClick={() => setPasteMode(false)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                !pasteMode
                  ? 'bg-accent-500 text-text-on-accent'
                  : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken/80'
              }`}
            >
              Upload File
            </Button>
            <Button variant="primary"
              onClick={() => setPasteMode(true)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                pasteMode
                  ? 'bg-accent-500 text-text-on-accent'
                  : 'bg-surface-sunken text-text-secondary hover:bg-surface-sunken/80'
              }`}
            >
              Paste Text
            </Button>
          </div>

          {!pasteMode ? (
            /* Upload Area — keyboard-operable dropzone (P224). role="button" +
               tabIndex + Enter/Space handler + a visible focus ring make it a
               real, focusable control so keyboard-only users can open the file
               picker. Drag/drop stays on the same surface. */
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload a PDF or TXT schedule file. Press Enter or Space to browse files, or drop a file here."
              aria-disabled={loading || undefined}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`
                border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface
                ${dragActive
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-border-subtle hover:border-border-strong hover:bg-surface-sunken active:bg-surface-sunken'
                }
              `}
            >
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className="w-16 h-16 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto mb-4">
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-accent-500 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-accent-500 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-accent-500 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                  </span>
                ) : (
                  <IconUpload size={28} className="text-text-tertiary" />
                )}
              </div>

              <p className="text-text-primary font-medium mb-1">
                {loading ? 'Processing...' : 'Drop your PDF or TXT file here'}
              </p>
              <p className="text-sm text-text-tertiary mb-4">
                or click to browse files
              </p>

              <div className="flex items-center justify-center gap-4 text-xs text-text-tertiary">
                <span className="flex items-center gap-1">
                  <IconFileText size={14} />
                  PDF & TXT supported
                </span>
              </div>
            </div>
          ) : (
            /* Paste Area */
            <div>
              <Textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`Paste your schedule here...\n\nExample format:\nBUAD 123 - Business Fundamentals\nMWF 9:30AM - 10:45AM\nHAL 101\nProf. Smith\n\nMATH 201 - Calculus II\nTTh 1:00PM - 2:15PM\nSCI 205`}
                rows={10}
                aria-label="Paste schedule text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full px-4 py-3 border border-border-subtle rounded-xl text-base lg:text-sm bg-surface text-text-primary focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 resize-none font-mono"
              />
              
              <Button
                onClick={handlePasteSubmit}
                isLoading={loading}
                className="w-full mt-4 gap-2"
              >
                <IconSparkles size={18} />
                Parse Schedule
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-fw-danger-bg border border-fw-danger/30 text-fw-danger px-4 py-3 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}

          {/* Tips */}
          <div className="mt-6 p-4 bg-surface-sunken rounded-xl">
            <p className="text-sm font-medium text-text-secondary mb-2">Tips for best results:</p>
            <ul className="text-xs text-text-tertiary space-y-1">
              <li>• Export your schedule from your university portal as PDF or TXT</li>
              <li>• Include course codes like "BUAD 123" or "MATH201"</li>
              <li>• Days can be formatted as MWF, TTh, MW, etc.</li>
              <li>• Times like "9:30AM - 10:45AM" work best</li>
              <li>• Paste Text option works great for most schedules</li>
            </ul>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
