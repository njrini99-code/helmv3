'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  IconUpload,
  IconFile,
  IconCheck,
  IconX,
  IconArrowLeft,
  IconAlertCircle,
  IconChevronRight,
} from '@/components/icons';
import { uploadStatsCSV } from '@/app/baseball/actions/stats';
import { parseCSV, findBestPlayerMatch, type PlayerMatch } from '@/lib/baseball/csv-utils';

interface StatsUploadClientProps {
  teamId: string;
  teamName: string;
  players: Array<{ id: string; firstName: string; lastName: string }>;
}

type Step = 'upload' | 'preview' | 'configure' | 'processing' | 'complete';

export function StatsUploadClient({
  teamId,
  teamName,
  players,
}: StatsUploadClientProps) {
  const router = useRouter();
  const { addToast } = useToast();

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
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCsvContent(content);
      setFileName(file.name);

      // Parse and preview
      const rows = parseCSV(content);
      setParsedRows(rows);

      // Find player matches
      const dbPlayers = players.map(p => ({
        id: p.id,
        first_name: p.firstName,
        last_name: p.lastName,
      }));

      const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
      const playerNameCol = headers.find(h =>
        ['player', 'name', 'player_name', 'athlete', 'batter', 'hitter'].some(n =>
          h.toLowerCase().includes(n)
        )
      );

      if (playerNameCol) {
        const uniqueNames = [...new Set(rows.map(r => r[playerNameCol]).filter(Boolean))];
        const matches = uniqueNames.map(name =>
          findBestPlayerMatch(name as string, dbPlayers)
        );
        setPlayerMatches(matches);
      }

      setStep('preview');
    };
    reader.readAsText(file);
  }, [players]);

  const handleDrop = useCallback((e: React.DragEvent) => {
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
  }, [handleFileSelect, addToast]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleUpload = async () => {
    setStep('processing');

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
        description: result.error,
      });
    }
  };

  const goodMatches = playerMatches.filter(m => m.confidence >= 0.7);
  const poorMatches = playerMatches.filter(m => m.confidence < 0.7 && m.confidence > 0);

  return (
    <div className="min-h-screen bg-[#FFFEFA]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/baseball/dashboard/command-center"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
          >
            <IconArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Upload Stats</h1>
            <p className="text-slate-500 mt-1">{teamName}</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8">
          {(['upload', 'preview', 'configure', 'complete'] as const).map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s || (step === 'processing' && s === 'configure')
                    ? 'bg-primary-600 text-white'
                    : ['upload', 'preview', 'configure'].indexOf(s) < ['upload', 'preview', 'configure', 'complete'].indexOf(step)
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {i + 1}
              </div>
              {i < 3 && (
                <div className="w-8 h-0.5 bg-slate-200 mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div
            className={`bg-white/70 backdrop-blur-xl border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${
              isDragging ? 'border-primary-500 bg-primary-50/50' : 'border-slate-200'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-4">
              <IconUpload size={32} className="text-primary-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              Upload CSV File
            </h2>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
              Drag and drop your stats CSV file here, or click to browse.
              We&apos;ll automatically match player names to your roster.
            </p>

            <input
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="inline-flex items-center justify-center cursor-pointer px-4 py-2 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-medium rounded-lg transition-colors">
              Choose File
            </label>

            <div className="mt-8 text-left max-w-sm mx-auto">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Supported Columns
              </p>
              <div className="flex flex-wrap gap-1">
                {['Player Name', 'AB', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO', 'SB', 'Exit Velo'].map(col => (
                  <span key={col} className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-600">
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
                  <p className="font-medium text-slate-900">{fileName}</p>
                  <p className="text-sm text-slate-500">{parsedRows.length} rows detected</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setStep('upload');
                    setCsvContent('');
                    setFileName('');
                    setParsedRows([]);
                    setPlayerMatches([]);
                  }}
                >
                  Change File
                </Button>
              </div>
            </div>

            {/* Player Matching Preview */}
            <div className="glass-standard rounded-2xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Player Matching</h3>

              {goodMatches.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-primary-600 font-medium mb-2 flex items-center gap-1">
                    <IconCheck size={16} />
                    {goodMatches.length} players matched
                  </p>
                  <div className="bg-primary-50 rounded-lg p-3">
                    <div className="flex flex-wrap gap-2">
                      {goodMatches.slice(0, 8).map(match => (
                        <span
                          key={match.csvName}
                          className="px-2 py-1 bg-white rounded text-xs text-slate-700"
                        >
                          {match.csvName} → {match.playerName}
                        </span>
                      ))}
                      {goodMatches.length > 8 && (
                        <span className="px-2 py-1 text-xs text-primary-600">
                          +{goodMatches.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {poorMatches.length > 0 && (
                <div>
                  <p className="text-sm text-amber-600 font-medium mb-2 flex items-center gap-1">
                    <IconAlertCircle size={16} />
                    {poorMatches.length} players need review
                  </p>
                  <div className="bg-amber-50 rounded-lg p-3">
                    <div className="flex flex-wrap gap-2">
                      {poorMatches.map(match => (
                        <span
                          key={match.csvName}
                          className="px-2 py-1 bg-white rounded text-xs text-slate-700"
                        >
                          {match.csvName} (no match)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {playerMatches.length === 0 && (
                <div className="text-center py-4 text-slate-500">
                  <IconAlertCircle size={24} className="mx-auto mb-2 text-amber-500" />
                  <p>Could not find player name column in CSV</p>
                </div>
              )}
            </div>

            {/* Data Preview */}
            <div className="glass-standard rounded-2xl p-6 overflow-hidden">
              <h3 className="font-semibold text-slate-900 mb-4">Data Preview</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {parsedRows[0] && Object.keys(parsedRows[0]).slice(0, 6).map(header => (
                        <th
                          key={header}
                          className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase"
                        >
                          {header.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {Object.values(row).slice(0, 6).map((val, j) => (
                          <td key={j} className="px-3 py-2 text-slate-600">
                            {val || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 5 && (
                  <p className="text-center text-xs text-slate-400 mt-2">
                    +{parsedRows.length - 5} more rows
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={() => setStep('configure')} className="gap-1">
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
              <h3 className="font-semibold text-slate-900 mb-4">Session Details</h3>

              <div className="space-y-4">
                {/* Stat Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Session Type
                  </label>
                  <div className="flex gap-2">
                    {(['practice', 'game', 'other'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => setStatType(type)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          statType === type
                            ? 'bg-primary-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
                        }`}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    This helps track practice vs game performance separately.
                  </p>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Session Date
                  </label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200
                               focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                               text-slate-900 transition-colors"
                  />
                </div>

                {/* Session Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Session Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="e.g., Fall Scrimmage vs State"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200
                               focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                               text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-primary-50 border border-primary-200 rounded-2xl p-6">
              <h4 className="font-semibold text-primary-800 mb-3">Ready to Upload</h4>
              <ul className="space-y-2 text-sm text-primary-700">
                <li className="flex items-center gap-2">
                  <IconCheck size={16} />
                  {parsedRows.length} rows from {fileName}
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={16} />
                  {goodMatches.length} players will be matched
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={16} />
                  Type: {statType.charAt(0).toUpperCase() + statType.slice(1)}
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck size={16} />
                  Date: {new Date(sessionDate).toLocaleDateString()}
                </li>
              </ul>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep('preview')}>
                Back
              </Button>
              <Button onClick={handleUpload} className="gap-1">
                Upload Stats
                <IconUpload size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="glass-standard rounded-2xl p-12 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              Processing Upload
            </h2>
            <p className="text-slate-500">
              Matching players and calculating statistics...
            </p>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && uploadResult && (
          <div className="space-y-6">
            <div className={`rounded-2xl p-8 text-center ${
              uploadResult.success
                ? 'bg-primary-50 border border-primary-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                uploadResult.success ? 'bg-primary-100' : 'bg-red-100'
              }`}>
                {uploadResult.success ? (
                  <IconCheck size={32} className="text-primary-600" />
                ) : (
                  <IconX size={32} className="text-red-600" />
                )}
              </div>
              <h2 className={`text-xl font-semibold mb-2 ${
                uploadResult.success ? 'text-primary-800' : 'text-red-800'
              }`}>
                {uploadResult.success ? 'Upload Complete!' : 'Upload Failed'}
              </h2>

              {uploadResult.success && (
                <div className="mt-4 space-y-2 text-sm text-primary-700">
                  <p>
                    <strong>{uploadResult.matchedRows}</strong> players matched and stats recorded
                  </p>
                  {(uploadResult.unmatchedRows ?? 0) > 0 && (
                    <p className="text-amber-700">
                      <strong>{uploadResult.unmatchedRows}</strong> players could not be matched
                    </p>
                  )}
                </div>
              )}

              {uploadResult.unmatchedNames && uploadResult.unmatchedNames.length > 0 && (
                <div className="mt-4 bg-white rounded-lg p-4 text-left">
                  <p className="text-xs font-semibold text-amber-600 uppercase mb-2">
                    Unmatched Names
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {uploadResult.unmatchedNames.map(name => (
                      <span key={name} className="px-2 py-1 bg-amber-100 rounded text-xs text-amber-700">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-center gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setStep('upload');
                  setCsvContent('');
                  setFileName('');
                  setParsedRows([]);
                  setPlayerMatches([]);
                  setUploadResult(null);
                }}
              >
                Upload Another
              </Button>
              <Button onClick={() => router.push('/baseball/dashboard/command-center')}>
                Go to Command Center
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
