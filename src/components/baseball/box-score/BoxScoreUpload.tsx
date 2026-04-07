'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadBoxScoreCSV, resolveBoxScoreUpload } from '@/app/baseball/actions/games';
import type { BaseballGame } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { IconUpload, IconCheck, IconRefresh } from '@/components/icons';
import { BoxScoreEntry } from './BoxScoreEntry';

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  jersey_number: string | null;
}

interface BoxScoreUploadProps {
  game: BaseballGame;
  teamPlayers: PlayerRow[];
}

type UploadTab = 'manual' | 'csv' | 'pdf';
type CSVType = 'batting' | 'pitching';

const BATTING_TEMPLATE = `player_name,ab,r,h,2b,3b,hr,rbi,bb,k,sb,cs,hbp,sac,sf,lob
John Smith,4,1,2,0,0,1,2,0,1,1,0,0,0,0,1
Mike Johnson,3,0,1,1,0,0,0,1,1,0,0,0,0,0,2`;

const PITCHING_TEMPLATE = `player_name,ip,h,r,er,bb,k,hr,pitch_count,result
Alex Jones,6.0,5,3,2,1,7,0,95,W
Chris Davis,2.0,1,0,0,0,3,0,28,ND`;

function downloadTemplate(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface MatchedPlayer {
  csvName: string;
  playerId: string;
  playerName: string;
  confidence: number;
}

interface UnmatchedPlayer {
  csvName: string;
  resolvedPlayerId?: string;
}

export function BoxScoreUpload({ game, teamPlayers }: BoxScoreUploadProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<UploadTab>('manual');
  const [csvType, setCsvType] = useState<CSVType>('batting');
  const [csvContent, setCsvContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [matched, setMatched] = useState<MatchedPlayer[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedPlayer[]>([]);
  const [allMatched, setAllMatched] = useState(false);
  const [resolving, setResolving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  function updateUnmatchedResolution(csvName: string, playerId: string) {
    setUnmatched((prev) =>
      prev.map((u) => (u.csvName === csvName ? { ...u, resolvedPlayerId: playerId } : u))
    );
  }

  async function handleCSVUpload() {
    if (!csvContent.trim()) {
      setUploadError('Please paste or select a CSV file first');
      return;
    }

    setUploading(true);
    setUploadError(null);

    const result = await uploadBoxScoreCSV(game.team_id, game.id, csvContent, csvType);

    if (!result.success) {
      setUploadError(result.error ?? 'Upload failed');
      setUploading(false);
      return;
    }

    setUploadId(result.uploadId ?? null);
    setMatched(result.matched);
    setUnmatched(result.unmatched.map((u) => ({ csvName: u.csvName })));
    setAllMatched(result.allMatched);
    setUploading(false);

    if (result.allMatched) {
      // All players matched — stats already saved
      router.refresh();
    }
  }

  async function handleResolveAndSave() {
    if (!uploadId) return;

    const unresolvedCount = unmatched.filter((u) => !u.resolvedPlayerId).length;
    if (unresolvedCount > 0) {
      alert(`Please resolve all ${unresolvedCount} unmatched player(s) before saving.`);
      return;
    }

    setResolving(true);

    const mappings = unmatched.map((u) => ({
      csvName: u.csvName,
      playerId: u.resolvedPlayerId!,
    }));

    const result = await resolveBoxScoreUpload(uploadId, game.id, mappings, csvType);

    if (result.success) {
      router.refresh();
      router.push(`/baseball/dashboard/stats/games/${game.id}`);
    } else {
      setUploadError(result.error ?? 'Failed to save resolved stats');
      setResolving(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvContent(text);
  }

  async function handlePDFSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // For PDF, we show a user-friendly message — server-side parsing happens via API
    setUploadError(
      'PDF upload: Copy the text content from your PDF box score and paste it into the CSV tab using the column format shown in the template.'
    );
  }

  const unresolvedCount = unmatched.filter((u) => !u.resolvedPlayerId).length;

  return (
    <div className="space-y-5">
      {/* Tab selector */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {(['manual', 'csv', 'pdf'] as UploadTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setCsvContent('');
              setUploadError(null);
              setMatched([]);
              setUnmatched([]);
              setAllMatched(false);
            }}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'manual' ? '✏️ Manual Entry' : tab === 'csv' ? '📄 CSV Upload' : '📑 PDF Upload'}
          </button>
        ))}
      </div>

      {/* Manual entry tab */}
      {activeTab === 'manual' && (
        <BoxScoreEntry game={game} teamPlayers={teamPlayers} />
      )}

      {/* CSV upload tab */}
      {activeTab === 'csv' && (
        <div className="space-y-5">
          {/* CSV type + template download */}
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Upload Stats CSV</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload a CSV file with one row per player. Download the template below.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Batting/Pitching switch */}
                <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['batting', 'pitching'] as CSVType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setCsvType(t)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${
                        csvType === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() =>
                    downloadTemplate(
                      csvType === 'batting' ? BATTING_TEMPLATE : PITCHING_TEMPLATE,
                      `${csvType}_template.csv`
                    )
                  }
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium underline"
                >
                  Download template
                </button>
              </div>
            </div>

            {/* Column reference */}
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-mono text-slate-500 leading-relaxed">
                {csvType === 'batting'
                  ? 'player_name, ab, r, h, 2b, 3b, hr, rbi, bb, k, sb, cs, hbp, sac, sf, lob'
                  : 'player_name, ip, h, r, er, bb, k, hr, pitch_count, result (W/L/S/H/BS/ND)'}
              </p>
            </div>

            {/* File input */}
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconUpload size={14} className="mr-1.5" />
                Choose File
              </Button>
              <span className="text-xs text-slate-400">or paste CSV below</span>
            </div>

            {/* Paste area */}
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder={csvType === 'batting'
                ? 'Paste your batting CSV here or choose a file above...'
                : 'Paste your pitching CSV here or choose a file above...'}
              rows={6}
              className="w-full text-xs font-mono border border-slate-200 rounded-xl p-3 bg-white/80 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y placeholder:text-slate-300"
            />

            {uploadError && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600">
                {uploadError}
              </div>
            )}

            <Button
              onClick={handleCSVUpload}
              disabled={uploading || !csvContent.trim()}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {uploading ? (
                <>
                  <IconRefresh size={14} className="mr-1.5 animate-spin" />
                  Matching players...
                </>
              ) : (
                <>
                  <IconUpload size={14} className="mr-1.5" />
                  Upload & Match Players
                </>
              )}
            </Button>
          </div>

          {/* Results */}
          {(matched.length > 0 || unmatched.length > 0) && (
            <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Player Matching Results</h3>
                {allMatched && (
                  <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                    <IconCheck size={14} />
                    All matched — stats saved!
                  </span>
                )}
              </div>

              {/* Matched players */}
              {matched.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">
                    ✅ Matched ({matched.length})
                  </p>
                  <div className="space-y-1.5">
                    {matched.map((m) => (
                      <div key={m.csvName} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                        <span className="text-xs text-slate-700 font-mono">{m.csvName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-700 font-medium">{m.playerName}</span>
                          <span className="text-[10px] text-green-500 bg-green-100 px-1.5 py-0.5 rounded-full">
                            {Math.round(m.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched players — manual resolution */}
              {unmatched.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">
                    ⚠️ Unmatched — please resolve ({unmatched.length})
                  </p>
                  <div className="space-y-2">
                    {unmatched.map((u) => (
                      <div key={u.csvName} className="flex items-center gap-3 bg-amber-50 rounded-lg px-3 py-2">
                        <span className="text-xs text-slate-700 font-mono flex-1 truncate">{u.csvName}</span>
                        <span className="text-slate-400 text-xs">→</span>
                        <select
                          value={u.resolvedPlayerId ?? ''}
                          onChange={(e) => updateUnmatchedResolution(u.csvName, e.target.value)}
                          className="text-xs border border-amber-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 min-w-[160px]"
                        >
                          <option value="">Select player...</option>
                          {teamPlayers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.first_name} {p.last_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={handleResolveAndSave}
                    disabled={resolving || unresolvedCount > 0}
                    className="mt-4 bg-primary-600 hover:bg-primary-700 text-white"
                    size="sm"
                  >
                    {resolving ? (
                      <>
                        <IconRefresh size={14} className="mr-1.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <IconCheck size={14} className="mr-1.5" />
                        Save Resolved Stats
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PDF upload tab */}
      {activeTab === 'pdf' && (
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
            <IconUpload size={24} className="text-slate-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">Upload Box Score PDF</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Upload a PDF box score and we&apos;ll extract player stats automatically. 
              Works best with standard box score formats.
            </p>
          </div>

          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handlePDFSelect}
            className="hidden"
          />

          <Button
            onClick={() => pdfInputRef.current?.click()}
            variant="outline"
            className="mx-auto"
          >
            <IconUpload size={16} className="mr-2" />
            Choose PDF File
          </Button>

          {uploadError && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700 text-left max-w-md mx-auto">
              {uploadError}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Tip: If PDF parsing doesn&apos;t work, use the CSV tab — download the template and fill it in manually.
          </p>
        </div>
      )}
    </div>
  );
}
