'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CopyIcon,
  CheckIcon,
  Maximize2Icon,
  DownloadIcon,
  Loader2Icon,
  WrapTextIcon,
} from 'lucide-react';

interface TextPreviewProps {
  content?: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  onFullScreen?: () => void;
  onDownload?: () => void;
  className?: string;
  fetchContent?: () => Promise<string>;
}

export function TextPreview({
  content: initialContent,
  url,
  fileName,
  mimeType = 'text/plain',
  onFullScreen,
  onDownload,
  className,
  fetchContent,
}: TextPreviewProps) {
  const [content, setContent] = useState(initialContent || '');
  const [isLoading, setIsLoading] = useState(!initialContent);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lineNumbers, _setLineNumbers] = useState(true);

  const isJson = mimeType === 'application/json';
  const isMarkdown = mimeType === 'text/markdown' || fileName?.endsWith('.md');
  const isCsv = mimeType === 'text/csv' || fileName?.endsWith('.csv');

  // Format JSON content
  const formatContent = useCallback((text: string) => {
    if (isJson) {
      try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return text;
      }
    }
    return text;
  }, [isJson]);

  // Fetch content if not provided
  useEffect(() => {
    async function loadContent() {
      if (initialContent) {
        setContent(formatContent(initialContent));
        setIsLoading(false);
        return;
      }

      if (fetchContent) {
        try {
          setIsLoading(true);
          setError(null);
          const text = await fetchContent();
          setContent(formatContent(text));
        } catch {
          setError('Failed to load file content');
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (url) {
        try {
          setIsLoading(true);
          setError(null);
          const response = await fetch(url);
          if (!response.ok) throw new Error('Failed to fetch');
          const text = await response.text();
          setContent(formatContent(text));
        } catch {
          setError('Failed to load file content');
        } finally {
          setIsLoading(false);
        }
      }
    }

    loadContent();
  }, [initialContent, url, fetchContent, formatContent]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload();
    } else if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'file.txt';
      link.click();
    } else {
      // Download from content
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'file.txt';
      link.click();
      URL.revokeObjectURL(url);
    }
  }, [url, fileName, content, mimeType, onDownload]);

  const lines = content.split('\n');
  const lineCount = lines.length;

  // Render CSV as table
  const renderCsvTable = useCallback(() => {
    const rows = lines.map(line => {
      // Simple CSV parsing (doesn't handle quoted commas)
      return line.split(',').map(cell => cell.trim());
    });

    if (rows.length === 0) return null;

    return (
      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/50">
              {rows[0]?.map((cell, i) => (
                <th key={i} className="px-3 py-2 text-left border-b font-medium">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-muted/30">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-1.5 border-b">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [lines]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {lineCount} lines
          </span>
          {isJson && (
            <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              JSON
            </span>
          )}
          {isMarkdown && (
            <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Markdown
            </span>
          )}
          {isCsv && (
            <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              CSV
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isCsv && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setWordWrap(!wordWrap)}
              title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
              className={wordWrap ? 'bg-accent' : ''}
            >
              <WrapTextIcon className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <CheckIcon className="h-4 w-4 text-green-600" />
            ) : (
              <CopyIcon className="h-4 w-4" />
            )}
          </Button>

          <div className="w-px h-6 bg-border mx-2" />

          {onFullScreen && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onFullScreen}
              title="Full Screen"
            >
              <Maximize2Icon className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleDownload}
            title="Download"
          >
            <DownloadIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-muted/30">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-4">
              <p className="text-destructive mb-2">{error}</p>
              <Button variant="outline" onClick={handleDownload}>
                Download Instead
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !error && (
          isCsv ? (
            renderCsvTable()
          ) : (
            <div className="flex font-mono text-sm">
              {/* Line numbers */}
              {lineNumbers && (
                <div className="flex-shrink-0 px-3 py-3 text-right border-r bg-muted/50 select-none">
                  {lines.map((_, i) => (
                    <div key={i} className="text-muted-foreground text-xs leading-6">
                      {i + 1}
                    </div>
                  ))}
                </div>
              )}

              {/* Code content */}
              <pre
                className={cn(
                  'flex-1 p-3 overflow-x-auto leading-6',
                  wordWrap && 'whitespace-pre-wrap break-all'
                )}
              >
                <code className={isJson ? 'text-amber-700 dark:text-amber-400' : ''}>
                  {content}
                </code>
              </pre>
            </div>
          )
        )}
      </div>

      {/* Footer */}
      {fileName && (
        <div className="px-4 py-2 border-t bg-muted/30">
          <span className="text-sm text-muted-foreground truncate">{fileName}</span>
        </div>
      )}
    </div>
  );
}

export default TextPreview;
