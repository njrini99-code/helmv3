'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import {
  IconUpload,
  IconFile,
  IconCheck,
  IconX,
  IconArrowLeft,
  IconAlertCircle,
  IconChevronRight,
  IconChevronDown,
  IconSearch,
  IconClock,
  IconSettings,
  IconRefresh,
} from '@/components/icons';
import { uploadStatsCSV } from '@/app/baseball/actions/stats';
import {
  parseCSV,
  findBestPlayerMatch,
  HEADER_MAPPINGS,
  type PlayerMatch,
} from '@/lib/baseball/csv-utils';
import { UploadHistory } from './UploadHistory';

// ============================================================================
// TYPES
// ============================================================================

interface StatsUploadClientProps {
  teamId: string;
  teamName: string;
  players: Array<{ id: string; firstName: string; lastName: string }>;
}

type Step = 'upload' | 'preview' | 'columns' | 'match' | 'configure' | 'processing' | 'complete';

interface ColumnMapping {
  csvColumn: string;
  mappedTo: string | null;
  sampleValues: string[];
}

// Stat fields that can be mapped
const STAT_FIELDS = [
  { key: 'player_name', label: 'Player Name', required: true },
  { key: 'at_bats', label: 'At Bats (AB)', required: false },
  { key: 'hits', label: 'Hits (H)', required: false },
  { key: 'doubles', label: 'Doubles (2B)', required: false },
  { key: 'triples', label: 'Triples (3B)', required: false },
  { key: 'home_runs', label: 'Home Runs (HR)', required: false },
  { key: 'rbis', label: 'RBIs', required: false },
  { key: 'walks', label: 'Walks (BB)', required: false },
  { key: 'strikeouts', label: 'Strikeouts (K)', required: false },
  { key: 'stolen_bases', label: 'Stolen Bases (SB)', required: false },
  { key: 'exit_velocity', label: 'Exit Velocity', required: false },
  { key: 'launch_angle', label: 'Launch Angle', required: false },
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Auto-detect column mappings based on header names
 */
function autoDetectMappings(headers: string[]): Record<string, string> {
  const mappings: Record<string, string> = {};

  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const [fieldKey, aliases] of Object.entries(HEADER_MAPPINGS)) {
      for (const alias of aliases) {
        if (normalized.includes(alias) || alias.includes(normalized)) {
          mappings[header] = fieldKey;
          break;
        }
      }
      if (mappings[header]) break;
    }
  }

  return mappings;
}

/**
 * Get fuzzy suggestions for an unmatched player name
 */
function getPlayerSuggestions(
  csvName: string,
  players: Array<{ id: string; firstName: string; lastName: string }>,
  limit = 3
): Array<{ player: { id: string; firstName: string; lastName: string }; confidence: number }> {
  const suggestions: Array<{
    player: { id: string; firstName: string; lastName: string };
    confidence: number;
  }> = [];

  for (const player of players) {
    const match = findBestPlayerMatch(csvName, [
      { id: player.id, first_name: player.firstName, last_name: player.lastName },
    ]);
    suggestions.push({
      player,
      confidence: match.confidence,
    });
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StatsUploadClient({
  teamId,
  teamName,
  players,
}: StatsUploadClientProps) {
  const router = useRouter();
  const { addToast } = useToast();

  // Core state
  const [step, setStep] = useState<Step>('upload');
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [statType, setStatType] = useState<'practice' | 'game' | 'other'>('practice');
  const [sessionDate, setSessionDate] = useState<string>(
    new Date().toISOString().split('T')[0]!
  );
  const [sessionName, setSessionName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<Array<Record<string, string>>>([]);
  const [playerMatches, setPlayerMatches] = useState<PlayerMatch[]>([]);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    matchedRows?: number;
    unmatchedRows?: number;
    unmatchedNames?: string[];
    error?: string;
  } | null>(null);

  // UI state
  const [isDragging, setIsDragging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [expandedUnmatchedPlayer, setExpandedUnmatchedPlayer] = useState<string | null>(null);

  // Column mapping state
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // ============================================================================
  // FILE HANDLING
  // ============================================================================

  const handleFileSelect = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCsvContent(content);
        setFileName(file.name);

        // Parse and preview
        const rows = parseCSV(content);
        setParsedRows(rows);

        if (rows.length === 0) {
          addToast({
            type: 'error',
            title: 'Invalid CSV',
            description: 'No valid data found in the file',
          });
          return;
        }

        // Build column mappings with sample values
        const headers = Object.keys(rows[0]!);
        const autoMappings = autoDetectMappings(headers);

        const mappings: ColumnMapping[] = headers.map((header) => ({
          csvColumn: header,
          mappedTo: autoMappings[header] || null,
          sampleValues: rows.slice(0, 3).map((r) => r[header] || '-'),
        }));

        setColumnMappings(mappings);

        setStep('preview');
      };
      reader.readAsText(file);
    },
    [addToast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        handleFileSelect(file);
      } else {
        addToast({
          type: 'error',
          title: 'Invalid file',
          description: 'Please upload a CSV file',
        });
      }
    },
    [handleFileSelect, addToast]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // ============================================================================
  // COLUMN MAPPING
  // ============================================================================

  const handleColumnMappingChange = useCallback(
    (csvColumn: string, mappedTo: string | null) => {
      setColumnMappings((prev) =>
        prev.map((m) => (m.csvColumn === csvColumn ? { ...m, mappedTo } : m))
      );
    },
    []
  );

  const playerNameColumn = useMemo(() => {
    const mapping = columnMappings.find((m) => m.mappedTo === 'player_name');
    return mapping?.csvColumn || null;
  }, [columnMappings]);

  const mappedStatColumns = useMemo(() => {
    return columnMappings.filter(
      (m) => m.mappedTo && m.mappedTo !== 'player_name'
    );
  }, [columnMappings]);

  // ============================================================================
  // PLAYER MATCHING
  // ============================================================================

  const runPlayerMatching = useCallback(() => {
    if (!playerNameColumn || parsedRows.length === 0) return;

    const dbPlayers = players.map((p) => ({
      id: p.id,
      first_name: p.firstName,
      last_name: p.lastName,
    }));

    const uniqueNames = [
      ...new Set(parsedRows.map((r) => r[playerNameColumn]).filter(Boolean)),
    ];

    const matches = uniqueNames.map((name) =>
      findBestPlayerMatch(name as string, dbPlayers)
    );

    setPlayerMatches(matches);
  }, [playerNameColumn, parsedRows, players]);

  // Run player matching when moving to match step
  useEffect(() => {
    if (step === 'match' || step === 'preview') {
      runPlayerMatching();
    }
  }, [step, runPlayerMatching]);

  const handleManualAssignment = useCallback(
    (csvName: string, playerId: string | null) => {
      if (!playerId) {
        // Skip this player - mark with isManualMatch but no playerId
        setPlayerMatches((prev) =>
          prev.map((match) =>
            match.csvName === csvName
              ? { ...match, playerId: null, playerName: null, confidence: 0, isManualMatch: true }
              : match
          )
        );
        setExpandedUnmatchedPlayer(null);
        return;
      }

      const player = players.find((p) => p.id === playerId);
      setPlayerMatches((prev) =>
        prev.map((match) => {
          if (match.csvName === csvName) {
            return {
              ...match,
              playerId,
              playerName: player ? `${player.firstName} ${player.lastName}` : '',
              confidence: 1.0, // Manual match = 100%
              isManualMatch: true,
            };
          }
          return match;
        })
      );

      // Collapse the expanded section
      setExpandedUnmatchedPlayer(null);
    },
    [players]
  );

  // Filter players based on search
  const filteredPlayers = useMemo(() => {
    if (!playerSearchQuery.trim()) return players;
    const query = playerSearchQuery.toLowerCase();
    return players.filter(
      (p) =>
        p.firstName.toLowerCase().includes(query) ||
        p.lastName.toLowerCase().includes(query) ||
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(query)
    );
  }, [players, playerSearchQuery]);

  const goodMatches = playerMatches.filter((m) => m.confidence >= 0.7);
  const poorMatches = playerMatches.filter(
    (m) => m.confidence < 0.7 && !m.isManualMatch
  );

  // ============================================================================
  // UPLOAD
  // ============================================================================

  const handleUpload = async () => {
    setStep('processing');
    setIsUploading(true);

    try {
      const result = await uploadStatsCSV(
        teamId,
        csvContent,
        statType,
        sessionDate,
        sessionName || undefined
      );

      setUploadResult(result);
      setStep('complete');

      if (result.success) {
        addToast({
          type: 'success',
          title: 'Stats uploaded',
          description: `${result.matchedRows} players matched successfully`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Upload failed',
          description: result.error || 'An error occurred',
        });
      }
    } catch {
      setUploadResult({
        success: false,
        error: 'An unexpected error occurred',
      });
      setStep('complete');
      addToast({
        type: 'error',
        title: 'Upload failed',
        description: 'An unexpected error occurred',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const resetUpload = useCallback(() => {
    setStep('upload');
    setCsvContent('');
    setFileName('');
    setParsedRows([]);
    setPlayerMatches([]);
    setColumnMappings([]);
    setUploadResult(null);
    setExpandedUnmatchedPlayer(null);
    setPlayerSearchQuery('');
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/baseball/dashboard/command-center"
              className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors"
            >
              <IconArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-warm-900">
                Upload Stats
              </h1>
              <p className="text-warm-500 mt-1">{teamName}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="gap-2"
          >
            <IconClock size={16} />
            History
            <IconChevronDown
              size={14}
              className={`transition-transform ${showHistory ? 'rotate-180' : ''}`}
            />
          </Button>
        </div>

        {/* Upload History (collapsible) */}
        {showHistory && (
          <div className="mb-8 animate-in slide-in-from-top-2 duration-200">
            <UploadHistory teamId={teamId} limit={5} />
          </div>
        )}

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {(
            [
              { key: 'upload', label: 'Upload' },
              { key: 'preview', label: 'Preview' },
              { key: 'columns', label: 'Map Columns' },
              { key: 'match', label: 'Match Players' },
              { key: 'configure', label: 'Configure' },
              { key: 'complete', label: 'Complete' },
            ] as const
          ).map((s, i, arr) => {
            const stepOrder = ['upload', 'preview', 'columns', 'match', 'configure', 'processing', 'complete'];
            const currentIndex = stepOrder.indexOf(step);
            const thisIndex = stepOrder.indexOf(s.key);
            const isActive = step === s.key || (step === 'processing' && s.key === 'configure');
            const isPast = thisIndex < currentIndex;

            return (
              <div key={s.key} className="flex items-center flex-shrink-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : isPast
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-warm-100 text-warm-400'
                  }`}
                >
                  {isPast ? <IconCheck size={14} /> : i + 1}
                </div>
                <span
                  className={`ml-2 text-sm hidden sm:inline ${
                    isActive
                      ? 'text-warm-900 font-medium'
                      : isPast
                        ? 'text-primary-700'
                        : 'text-warm-400'
                  }`}
                >
                  {s.label}
                </span>
                {i < arr.length - 1 && (
                  <div className="w-6 sm:w-8 h-0.5 bg-warm-200 mx-2" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div
            className={`bg-cream-100/75 backdrop-blur-xl border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${
              isDragging
                ? 'border-primary-500 bg-primary-50/50'
                : 'border-warm-200'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-4">
              <IconUpload size={32} className="text-primary-600" />
            </div>
            <h2 className="text-xl font-semibold text-warm-900 mb-2">
              Upload CSV File
            </h2>
            <p className="text-warm-500 mb-6 max-w-md mx-auto">
              Drag and drop your stats CSV file here, or click to browse. We'll
              help you map columns and match player names.
            </p>

            <input
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="inline-flex items-center justify-center cursor-pointer px-4 py-2 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-medium rounded-lg transition-colors"
            >
              Choose File
            </label>

            <div className="mt-8 text-left max-w-sm mx-auto">
              <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">
                Supported Columns
              </p>
              <div className="flex flex-wrap gap-1">
                {[
                  'Player Name',
                  'AB',
                  'H',
                  '2B',
                  '3B',
                  'HR',
                  'RBI',
                  'BB',
                  'SO',
                  'SB',
                  'Exit Velo',
                ].map((col) => (
                  <span
                    key={col}
                    className="px-2 py-1 bg-warm-100 rounded text-xs text-warm-600"
                  >
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="space-y-6">
            {/* File Info */}
            <div className="glass-standard rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                  <IconFile size={24} className="text-primary-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-warm-900">{fileName}</p>
                  <p className="text-sm text-warm-500">
                    {parsedRows.length} rows • {columnMappings.length} columns
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={resetUpload}>
                  Change File
                </Button>
              </div>
            </div>

            {/* Auto-detected Mappings Summary */}
            <div className="glass-standard rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <IconSettings size={18} className="text-warm-400" />
                <h3 className="font-semibold text-warm-900">
                  Auto-Detected Columns
                </h3>
              </div>

              {playerNameColumn ? (
                <div className="mb-4">
                  <p className="text-sm text-primary-600 font-medium flex items-center gap-1">
                    <IconCheck size={16} />
                    Player name column: &quot;{playerNameColumn}&quot;
                  </p>
                </div>
              ) : (
                <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-700 flex items-center gap-1">
                    <IconAlertCircle size={16} />
                    Could not detect player name column. You'll need to map it
                    manually.
                  </p>
                </div>
              )}

              {mappedStatColumns.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {mappedStatColumns.map((col) => (
                    <span
                      key={col.csvColumn}
                      className="px-2 py-1 bg-primary-50 rounded text-xs text-primary-700"
                    >
                      {col.csvColumn} →{' '}
                      {STAT_FIELDS.find((f) => f.key === col.mappedTo)?.label ||
                        col.mappedTo}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Data Preview */}
            <div className="glass-standard rounded-2xl p-6 overflow-clip">
              <h3 className="font-semibold text-warm-900 mb-4">Data Preview</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-warm-200">
                      {parsedRows[0] &&
                        Object.keys(parsedRows[0])
                          .slice(0, 6)
                          .map((header) => (
                            <th
                              key={header}
                              className="px-3 py-2 text-left text-xs font-semibold text-warm-500 uppercase"
                            >
                              {header.replace(/_/g, ' ')}
                            </th>
                          ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-warm-100">
                        {Object.values(row)
                          .slice(0, 6)
                          .map((val, j) => (
                            <td key={j} className="px-3 py-2 text-warm-600">
                              {val || '-'}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 5 && (
                  <p className="text-center text-xs text-warm-400 mt-2">
                    +{parsedRows.length - 5} more rows
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={resetUpload}>
                Back
              </Button>
              <Button onClick={() => setStep('columns')} className="gap-1">
                Map Columns
                <IconChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Column Mapping */}
        {step === 'columns' && (
          <div className="space-y-6">
            <div className="glass-standard rounded-2xl p-6">
              <h3 className="font-semibold text-warm-900 mb-2">
                Map CSV Columns
              </h3>
              <p className="text-sm text-warm-500 mb-6">
                We auto-detected some columns. Review and adjust the mappings as
                needed.
              </p>

              <div className="space-y-4">
                {columnMappings.map((mapping) => (
                  <div
                    key={mapping.csvColumn}
                    className={`p-4 rounded-xl border transition-colors ${
                      mapping.mappedTo === 'player_name'
                        ? 'bg-primary-50/50 border-primary-200'
                        : mapping.mappedTo
                          ? 'bg-warm-50 border-warm-200'
                          : 'bg-white border-warm-100'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* CSV Column Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-warm-900 truncate">
                          {mapping.csvColumn}
                        </p>
                        <p className="text-xs text-warm-500 mt-1 truncate">
                          Sample: {mapping.sampleValues.join(', ')}
                        </p>
                      </div>

                      {/* Arrow */}
                      <div className="hidden sm:block">
                        <IconChevronRight size={16} className="text-warm-300" />
                      </div>

                      {/* Mapping Dropdown */}
                      <div className="sm:w-48">
                        <select
                          value={mapping.mappedTo || ''}
                          onChange={(e) =>
                            handleColumnMappingChange(
                              mapping.csvColumn,
                              e.target.value || null
                            )
                          }
                          className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                            mapping.mappedTo === 'player_name'
                              ? 'border-primary-300 bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100'
                              : 'border-warm-200 bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100'
                          }`}
                        >
                          <option value="">Skip this column</option>
                          {STAT_FIELDS.map((field) => {
                            const isUsed = columnMappings.some(
                              (m) =>
                                m.mappedTo === field.key &&
                                m.csvColumn !== mapping.csvColumn
                            );
                            return (
                              <option
                                key={field.key}
                                value={field.key}
                                disabled={isUsed}
                              >
                                {field.label}
                                {field.required ? ' *' : ''}
                                {isUsed ? ' (already mapped)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Validation */}
              {!playerNameColumn && (
                <div className="mt-6 p-4 bg-red-50 rounded-xl border border-red-200">
                  <p className="text-sm text-red-700 flex items-center gap-2">
                    <IconAlertCircle size={16} />
                    <span>
                      <strong>Required:</strong> Please map a column to "Player
                      Name"
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep('preview')}>
                Back
              </Button>
              <Button
                onClick={() => setStep('match')}
                disabled={!playerNameColumn}
                className="gap-1"
              >
                Match Players
                <IconChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Match Players */}
        {step === 'match' && (
          <div className="space-y-6">
            {/* Good Matches Summary */}
            {goodMatches.length > 0 && (
              <div className="glass-standard rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <IconCheck size={16} className="text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-warm-900">
                      {goodMatches.length} Players Matched
                    </h3>
                    <p className="text-sm text-warm-500">
                      Automatically matched with high confidence
                    </p>
                  </div>
                </div>
                <div className="bg-primary-50 rounded-lg p-3">
                  <div className="flex flex-wrap gap-2">
                    {goodMatches.slice(0, 10).map((match) => (
                      <span
                        key={match.csvName}
                        className="px-2 py-1 bg-white rounded text-xs text-warm-700 shadow-sm"
                      >
                        {match.csvName} → {match.playerName}
                      </span>
                    ))}
                    {goodMatches.length > 10 && (
                      <span className="px-2 py-1 text-xs text-primary-600 font-medium">
                        +{goodMatches.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Poor Matches - Need Review */}
            {poorMatches.length > 0 && (
              <div className="glass-standard rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <IconAlertCircle size={16} className="text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-warm-900">
                      {poorMatches.length} Players Need Review
                    </h3>
                    <p className="text-sm text-warm-500">
                      Select the correct player or skip
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {poorMatches.map((match) => {
                    const suggestions = getPlayerSuggestions(
                      match.csvName,
                      players,
                      5
                    );
                    const isExpanded = expandedUnmatchedPlayer === match.csvName;

                    return (
                      <div
                        key={match.csvName}
                        className={`border rounded-xl transition-all ${
                          isExpanded
                            ? 'border-primary-300 bg-white shadow-sm'
                            : 'border-amber-200 bg-amber-50'
                        }`}
                      >
                        <button
                          onClick={() =>
                            setExpandedUnmatchedPlayer(
                              isExpanded ? null : match.csvName
                            )
                          }
                          className="w-full flex items-center justify-between p-4 text-left"
                        >
                          <div>
                            <p className="font-medium text-warm-900">
                              {match.csvName}
                            </p>
                            <p className="text-xs text-amber-600">
                              No automatic match found
                            </p>
                          </div>
                          <IconChevronDown
                            size={18}
                            className={`text-warm-400 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-warm-100 pt-4">
                            {/* Suggestions */}
                            {suggestions.length > 0 && (
                              <div className="mb-4">
                                <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">
                                  Suggestions
                                </p>
                                <div className="space-y-2">
                                  {suggestions.map((sug) => (
                                    <button
                                      key={sug.player.id}
                                      onClick={() =>
                                        handleManualAssignment(
                                          match.csvName,
                                          sug.player.id
                                        )
                                      }
                                      className="w-full flex items-center justify-between p-2 rounded-lg border border-warm-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
                                    >
                                      <span className="font-medium text-warm-900">
                                        {sug.player.firstName} {sug.player.lastName}
                                      </span>
                                      <span className="text-xs text-warm-400">
                                        {Math.round(sug.confidence * 100)}% match
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Search All Players */}
                            <div>
                              <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">
                                Or search roster
                              </p>
                              <div className="relative mb-2">
                                <IconSearch
                                  size={16}
                                  className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400"
                                />
                                <input
                                  type="text"
                                  placeholder="Search players..."
                                  value={playerSearchQuery}
                                  onChange={(e) =>
                                    setPlayerSearchQuery(e.target.value)
                                  }
                                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-warm-200 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-colors"
                                />
                              </div>
                              {playerSearchQuery && (
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {filteredPlayers.slice(0, 8).map((player) => (
                                    <button
                                      key={player.id}
                                      onClick={() =>
                                        handleManualAssignment(
                                          match.csvName,
                                          player.id
                                        )
                                      }
                                      className="w-full flex items-center p-2 rounded-lg hover:bg-warm-50 transition-colors text-left text-sm"
                                    >
                                      {player.firstName} {player.lastName}
                                    </button>
                                  ))}
                                  {filteredPlayers.length === 0 && (
                                    <p className="text-sm text-warm-400 text-center py-2">
                                      No players found
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Skip Button */}
                            <div className="mt-4 pt-4 border-t border-warm-100">
                              <button
                                onClick={() =>
                                  handleManualAssignment(match.csvName, null)
                                }
                                className="text-sm text-warm-500 hover:text-warm-700 transition-colors"
                              >
                                Skip this player
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All Matched Summary */}
            {poorMatches.length === 0 && goodMatches.length > 0 && (
              <div className="bg-primary-50 border border-primary-200 rounded-2xl p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
                  <IconCheck size={24} className="text-primary-600" />
                </div>
                <h3 className="font-semibold text-primary-800 mb-1">
                  All Players Matched!
                </h3>
                <p className="text-sm text-primary-700">
                  {goodMatches.length} players matched automatically
                </p>
              </div>
            )}

            {/* No Players Found */}
            {playerMatches.length === 0 && (
              <div className="glass-standard rounded-2xl p-8 text-center">
                <IconAlertCircle
                  size={32}
                  className="text-amber-500 mx-auto mb-3"
                />
                <h3 className="font-semibold text-warm-900 mb-1">
                  No Player Names Found
                </h3>
                <p className="text-sm text-warm-500">
                  Check that the player name column is correctly mapped
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep('columns')}>
                Back
              </Button>
              <Button
                onClick={() => setStep('configure')}
                disabled={goodMatches.length === 0}
                className="gap-1"
              >
                Continue
                <IconChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Configure */}
        {step === 'configure' && (
          <div className="space-y-6">
            <div className="glass-standard rounded-2xl p-6">
              <h3 className="font-semibold text-warm-900 mb-4">
                Session Details
              </h3>

              <div className="space-y-4">
                {/* Stat Type */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">
                    Session Type
                  </label>
                  <div className="flex gap-2">
                    {(['practice', 'game', 'other'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setStatType(type)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          statType === type
                            ? 'bg-primary-600 text-white'
                            : 'bg-warm-100 text-warm-600 hover:bg-warm-200 active:bg-warm-300'
                        }`}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-warm-500 mt-2">
                    This helps track practice vs game performance separately.
                  </p>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">
                    Session Date
                  </label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-warm-200
                               focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                               text-warm-900 transition-colors"
                  />
                </div>

                {/* Session Name */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">
                    Session Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="e.g., Fall Scrimmage vs State"
                    className="w-full px-4 py-2 rounded-lg border border-warm-200
                               focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                               text-warm-900 placeholder:text-warm-400 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-primary-50 border border-primary-200 rounded-2xl p-6">
              <h4 className="font-semibold text-primary-800 mb-3">
                Ready to Upload
              </h4>
              <ul className="space-y-2 text-sm text-primary-700">
                <li className="flex items-center gap-2">
                  <IconCheck size={16} />
                  {parsedRows.length} rows from {fileName}
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={16} />
                  {goodMatches.length} players will be matched
                </li>
                {poorMatches.length > 0 && (
                  <li className="flex items-center gap-2 text-amber-700">
                    <IconAlertCircle size={16} />
                    {poorMatches.length} players will be skipped
                  </li>
                )}
                <li className="flex items-center gap-2">
                  <IconCheck size={16} />
                  Type: {statType.charAt(0).toUpperCase() + statType.slice(1)}
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={16} />
                  Date: {new Date(sessionDate).toLocaleDateString()}
                </li>
                {mappedStatColumns.length > 0 && (
                  <li className="flex items-center gap-2">
                    <IconCheck size={16} />
                    {mappedStatColumns.length} stat columns mapped
                  </li>
                )}
              </ul>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep('match')}>
                Back
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="gap-1"
              >
                {isUploading ? (
                  <>
                    <IconRefresh size={16} className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    Upload Stats
                    <IconUpload size={16} />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="glass-standard rounded-2xl p-12 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-warm-900 mb-2">
              Processing Upload
            </h2>
            <p className="text-warm-500">
              Matching players and calculating statistics...
            </p>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && uploadResult && (
          <div className="space-y-6">
            <div
              className={`rounded-2xl p-8 text-center ${
                uploadResult.success
                  ? 'bg-primary-50 border border-primary-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  uploadResult.success ? 'bg-primary-100' : 'bg-red-100'
                }`}
              >
                {uploadResult.success ? (
                  <IconCheck size={32} className="text-primary-600" />
                ) : (
                  <IconX size={32} className="text-red-600" />
                )}
              </div>
              <h2
                className={`text-xl font-semibold mb-2 ${
                  uploadResult.success ? 'text-primary-800' : 'text-red-800'
                }`}
              >
                {uploadResult.success ? 'Upload Complete!' : 'Upload Failed'}
              </h2>

              {uploadResult.success && (
                <div className="mt-4 space-y-2 text-sm text-primary-700">
                  <p>
                    <strong>{uploadResult.matchedRows}</strong> players matched
                    and stats recorded
                  </p>
                  {(uploadResult.unmatchedRows ?? 0) > 0 && (
                    <p className="text-amber-700">
                      <strong>{uploadResult.unmatchedRows}</strong> players
                      could not be matched
                    </p>
                  )}
                </div>
              )}

              {uploadResult.error && (
                <p className="mt-4 text-sm text-red-700">{uploadResult.error}</p>
              )}

              {uploadResult.unmatchedNames &&
                uploadResult.unmatchedNames.length > 0 && (
                  <div className="mt-4 bg-white rounded-lg p-4 text-left">
                    <p className="text-xs font-semibold text-amber-600 uppercase mb-2">
                      Unmatched Names
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {uploadResult.unmatchedNames.map((name) => (
                        <span
                          key={name}
                          className="px-2 py-1 bg-amber-100 rounded text-xs text-amber-700"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={resetUpload}>
                Upload Another
              </Button>
              <Button
                onClick={() => router.push('/baseball/dashboard/command-center')}
              >
                Go to Command Center
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
