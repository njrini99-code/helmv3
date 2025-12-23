'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { IconX, IconUpload, IconFileText, IconSparkles } from '@/components/icons';
import { parseScheduleText, type ParsedClass } from '@/lib/utils/schedule-parser';

interface UploadScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParsed: (classes: ParsedClass[]) => void;
}

// Load PDF.js from CDN (avoids Vercel native dependency issues)
const loadPdfJs = async () => {
  const PDFJS_VERSION = '3.11.174';
  const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
  
  // Check if already loaded
  if ((window as any).pdfjsLib) {
    return (window as any).pdfjsLib;
  }
  
  // Load the main library
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${PDFJS_CDN}/pdf.min.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });
  
  const pdfjsLib = (window as any).pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
  
  return pdfjsLib;
};

export function UploadScheduleModal({ isOpen, onClose, onParsed }: UploadScheduleModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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
      console.log('[PDF] Starting extraction for:', file.name, 'size:', file.size);
      
      const pdfjsLib = await loadPdfJs();
      console.log('[PDF] PDF.js library loaded');
      
      const arrayBuffer = await file.arrayBuffer();
      console.log('[PDF] ArrayBuffer created, size:', arrayBuffer.byteLength);
      
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      console.log('[PDF] Document loaded, pages:', pdf.numPages);
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        console.log('[PDF] Page', i, '- items:', textContent.items.length);
        
        // Group text items by Y position to preserve rows
        const items = textContent.items as Array<{ str: string; transform: number[] }>;
        
        if (items.length === 0) {
          console.log('[PDF] Page', i, 'has no items, skipping');
          continue;
        }
        
        // Debug: log first few items
        console.log('[PDF] Sample items:', items.slice(0, 3).map(it => ({ str: it.str, x: it.transform?.[4], y: it.transform?.[5] })));
        
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
        
        console.log('[PDF] Page', i, '- rows extracted:', rows.length);

        // Join each row with tabs (to separate columns), rows with newlines
        const pageText = rows.map(row => row.join('\t')).join('\n');
        fullText += pageText + '\n';
      }

      console.log('[PDF] === EXTRACTED TEXT START ===');
      console.log(fullText);
      console.log('[PDF] === EXTRACTED TEXT END ===');
      
      return fullText;
    } catch (err) {
      console.error('[PDF] Extraction error:', err);
      throw new Error('Failed to extract text from PDF. Try using TXT or paste text instead.');
    }
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setError('');
    console.log('[Process] Starting to process file:', file.name, file.type);

    try {
      let text = '';

      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        console.log('[Process] Detected PDF file');
        text = await extractTextFromPDF(file);
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        console.log('[Process] Detected TXT file');
        text = await file.text();
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or TXT file.');
      }
      
      console.log('[Process] Extracted text length:', text.length);
      console.log('[Process] Calling parseScheduleText...');
      
      const classes = parseScheduleText(text);
      
      console.log('[Process] Parsed classes:', classes.length);
      console.log('[Process] Classes:', JSON.stringify(classes, null, 2));
      
      if (classes.length === 0) {
        setError('No classes found in the file. Try pasting your schedule text instead.');
        setLoading(false);
        return;
      }
      
      onParsed(classes);
    } catch (err: any) {
      console.error('[Process] Error:', err);
      setError(err.message || 'Failed to process file. Try pasting your schedule text instead.');
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
    } catch (err) {
      setError('Failed to parse schedule. Please check the format.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <IconSparkles size={20} className="text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import Schedule</h2>
              <p className="text-sm text-slate-500">Upload or paste your class schedule</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {/* Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setPasteMode(false)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                !pasteMode 
                  ? 'bg-green-600 text-white' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Upload File
            </button>
            <button
              onClick={() => setPasteMode(true)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                pasteMode 
                  ? 'bg-green-600 text-white' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Paste Text
            </button>
          </div>

          {!pasteMode ? (
            /* Upload Area */
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${dragActive 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                {loading ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
                ) : (
                  <IconUpload size={28} className="text-slate-400" />
                )}
              </div>

              <p className="text-slate-900 font-medium mb-1">
                {loading ? 'Processing...' : 'Drop your PDF or TXT file here'}
              </p>
              <p className="text-sm text-slate-500 mb-4">
                or click to browse files
              </p>

              <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <IconFileText size={14} />
                  PDF & TXT supported
                </span>
              </div>
            </div>
          ) : (
            /* Paste Area */
            <div>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`Paste your schedule here...\n\nExample format:\nBUAD 123 - Business Fundamentals\nMWF 9:30AM - 10:45AM\nHAL 101\nProf. Smith\n\nMATH 201 - Calculus II\nTTh 1:00PM - 2:15PM\nSCI 205`}
                rows={10}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 resize-none font-mono"
              />
              
              <Button
                onClick={handlePasteSubmit}
                loading={loading}
                className="w-full mt-4 gap-2"
              >
                <IconSparkles size={18} />
                Parse Schedule
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Tips */}
          <div className="mt-6 p-4 bg-slate-50 rounded-xl">
            <p className="text-sm font-medium text-slate-700 mb-2">Tips for best results:</p>
            <ul className="text-xs text-slate-500 space-y-1">
              <li>• Export your schedule from your university portal as PDF or TXT</li>
              <li>• Include course codes like "BUAD 123" or "MATH201"</li>
              <li>• Days can be formatted as MWF, TTh, MW, etc.</li>
              <li>• Times like "9:30AM - 10:45AM" work best</li>
              <li>• Paste Text option works great for most schedules</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
