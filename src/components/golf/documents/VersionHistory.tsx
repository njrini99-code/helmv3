'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatFileSize, type DocumentVersion, type GolfDocument } from '@/lib/types/golf';
import { revertToVersion } from '@/app/golf/actions/documents';
import {
  HistoryIcon,
  EyeIcon,
  DownloadIcon,
  RotateCcwIcon,
  Loader2Icon,
  CheckCircle2Icon,
  ClockIcon,
  UserIcon,
  FileIcon,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface VersionHistoryProps {
  document: GolfDocument;
  versions: DocumentVersion[];
  onPreviewVersion?: (version: DocumentVersion) => void;
  onDownloadVersion?: (version: DocumentVersion) => void;
  onReverted?: () => void;
  className?: string;
}

export function VersionHistory({
  document,
  versions,
  onPreviewVersion,
  onDownloadVersion,
  onReverted,
  className,
}: VersionHistoryProps) {
  const [revertingTo, setRevertingTo] = useState<number | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [showRevertDialog, setShowRevertDialog] = useState(false);

  const handleRevertClick = useCallback((versionNumber: number) => {
    setRevertingTo(versionNumber);
    setShowRevertDialog(true);
    setRevertError(null);
  }, []);

  const handleConfirmRevert = useCallback(async () => {
    if (revertingTo === null) return;

    setIsReverting(true);
    setRevertError(null);

    try {
      const { success, error } = await revertToVersion(document.id, String(revertingTo));

      if (error) {
        setRevertError(error);
        return;
      }

      if (success) {
        setShowRevertDialog(false);
        setRevertingTo(null);
        onReverted?.();
      }
    } catch {
      setRevertError('An unexpected error occurred');
    } finally {
      setIsReverting(false);
    }
  }, [document.id, revertingTo, onReverted]);

  const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);
  // Use the latest version number as current since golf_documents doesn't have current_version column
  const currentVersion = sortedVersions[0]?.version_number ?? 1;

  return (
    <>
      <Card className={cn('', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="h-5 w-5" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HistoryIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No version history available</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

              {/* Version items */}
              <div className="space-y-4">
                {sortedVersions.map((version, index) => {
                  const isCurrent = version.version_number === currentVersion;
                  const isLatest = index === 0;

                  return (
                    <div
                      key={version.id}
                      className={cn(
                        'relative pl-10 group',
                        isCurrent && 'bg-primary/5 -mx-4 px-4 py-3 rounded-lg ml-6'
                      )}
                    >
                      {/* Timeline dot */}
                      <div
                        className={cn(
                          'absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 bg-background',
                          isCurrent
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground/40'
                        )}
                      />

                      {/* Version content */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">
                              v{version.version_number}
                            </span>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                                <CheckCircle2Icon className="h-3 w-3" />
                                Current
                              </span>
                            )}
                            {isLatest && !isCurrent && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                                Latest
                              </span>
                            )}
                          </div>

                          {/* Change notes */}
                          {version.change_notes && (
                            <p className="text-sm text-foreground mb-2">
                              {version.change_notes}
                            </p>
                          )}

                          {/* Metadata */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <ClockIcon className="h-3 w-3" />
                              {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                            </span>
                            {version.uploader?.full_name && (
                              <span className="flex items-center gap-1">
                                <UserIcon className="h-3 w-3" />
                                {version.uploader.full_name}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <FileIcon className="h-3 w-3" />
                              {formatFileSize(version.file_size)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          {onPreviewVersion && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2"
                              onClick={() => onPreviewVersion(version)}
                              title="Preview this version"
                            >
                              <EyeIcon className="h-4 w-4" />
                            </Button>
                          )}
                          {onDownloadVersion && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2"
                              onClick={() => onDownloadVersion(version)}
                              title="Download this version"
                            >
                              <DownloadIcon className="h-4 w-4" />
                            </Button>
                          )}
                          {!isCurrent && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2"
                              onClick={() => handleRevertClick(version.version_number)}
                              title="Revert to this version"
                            >
                              <RotateCcwIcon className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Full date on hover */}
                      <div className="text-xs text-muted-foreground mt-1 hidden group-hover:block">
                        {format(new Date(version.created_at), 'PPpp')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revert Confirmation Dialog */}
      <Dialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert to Version {revertingTo}?</DialogTitle>
            <DialogDescription>
              This will create a new version based on version {revertingTo}. The current version will not be deleted - you can always revert back.
            </DialogDescription>
          </DialogHeader>

          {revertError && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {revertError}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowRevertDialog(false)}
              disabled={isReverting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmRevert}
              disabled={isReverting}
            >
              {isReverting ? (
                <>
                  <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                  Reverting...
                </>
              ) : (
                <>
                  <RotateCcwIcon className="h-4 w-4 mr-2" />
                  Revert to v{revertingTo}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default VersionHistory;
