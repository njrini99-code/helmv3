'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadBoxScoreCSV, resolveBoxScoreUpload } from '@/app/baseball/actions/games';
import type { BaseballGame, BoxScoreBattingInput, BoxScorePitchingInput } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { IconUpload, IconCheck, IconRefresh } from '@/components/icons';
import { BoxScoreEntry } from './BoxScoreEntry';
import { PaperCard } from '@/components/baseball/living-annual';

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
  initialBatting?: BoxScoreBattingInput[];
  initialPitching?: BoxScorePitchingInput[];
}

type UploadTab = 'manual' | 'csv';
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

export function BoxScoreUpload({ game, teamPlayers, initialBatting, initialPitching }: BoxScoreUploadProps) {
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
      setUploadError(`Please resolve all ${unresolvedCount} unmatched player(s) before saving.`);
      return;
    }

    setUploadError(null);
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

  const unresolvedCount = unmatched.filter((u) => !u.resolvedPlayerId).length;

  return (
    <div className="space-y-5">
      {/* Tab selector */}
      <div className="flex gap-1 p-1 bg-warm-100 rounded-xl w-fit">
        {(['manual', 'csv'] as UploadTab[]).map((tab) => (
          <Button variant="ghost"
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
                ? 'bg-cream-50 text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            {tab === 'manual' ? '✏️ Manual Entry' : '📄 CSV Upload'}
          </Button>
        ))}
      </div>

      {/* Manual entry tab */}
      {activeTab === 'manual' && (
        <BoxScoreEntry
          game={game}
          teamPlayers={teamPlayers}
          initialBatting={initialBatting}
          initialPitching={initialPitching}
        />
      )}

      {/* CSV upload tab */}
      {activeTab === 'csv' && (
        <div className="space-y-5">
          {/* CSV type + template download */}
          <PaperCard className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold text-warm-800">Upload Stats CSV</h3>
                <p className="text-xs text-warm-500 mt-0.5">
                  Upload a CSV file with one row per player. Download the template below.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Batting/Pitching switch */}
                <div className="flex gap-1 p-1 bg-warm-100 rounded-lg">
                  {(['batting', 'pitching'] as CSVType[]).map((t) => (
                    <Button variant="ghost"
                      key={t}
                      onClick={() => setCsvType(t)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${
                        csvType === t ? 'bg-cream-50 text-warm-800 shadow-sm' : 'text-warm-500'
                      }`}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
                <Button variant="ghost"
                  onClick={() =>
                    downloadTemplate(
                      csvType === 'batting' ? BATTING_TEMPLATE : PITCHING_TEMPLATE,
                      `${csvType}_template.csv`
                    )
                  }
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium underline"
                >
                  Download template
                </Button>
              </div>
            </div>

            {/* Column reference */}
            <div className="bg-warm-50 rounded-xl p-3">
              <p className="text-xs font-mono text-warm-500 leading-relaxed">
                {csvType === 'batting'
                  ? 'player_name, ab, r, h, 2b, 3b, hr, rbi, bb, k, sb, cs, hbp, sac, sf, lob'
                  : 'player_name, ip, h, r, er, bb, k, hr, pitch_count, result (W/L/S/H/BS/ND)'}
              </p>
            </div>

            {/* File input */}
            <div className="flex items-center gap-3">
              <Input
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
              <span className="text-xs text-warm-400">or paste CSV below</span>
            </div>

            {/* Paste area */}
            <Textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder={csvType === 'batting'
                ? 'Paste your batting CSV here or choose a file above...'
                : 'Paste your pitching CSV here or choose a file above...'}
              rows={6}
              className="w-full text-xs font-mono border border-warm-200 rounded-xl p-3 bg-cream-100/82 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y placeholder:text-warm-300"
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
          </PaperCard>

          {/* Results */}
          {(matched.length > 0 || unmatched.length > 0) && (
            <PaperCard className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-warm-800">Player Matching Results</h3>
                {allMatched && (
                  <span className="flex items-center gap-1.5 text-xs text-primary-600 font-medium">
                    <IconCheck size={14} />
                    All matched — stats saved!
                  </span>
                )}
              </div>

              {/* Matched players */}
              {matched.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-warm-500 mb-2">
                    ✅ Matched ({matched.length})
                  </p>
                  <div className="space-y-1.5">
                    {matched.map((m) => (
                      <div key={m.csvName} className="flex items-center justify-between bg-primary-50 rounded-lg px-3 py-2">
                        <span className="text-xs text-warm-700 font-mono">{m.csvName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-primary-700 font-medium">{m.playerName}</span>
                          <span className="text-eyebrow text-primary-500 bg-primary-100 px-1.5 py-0.5 rounded-full font-annual tabular-nums">
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
                  <p className="text-xs font-medium text-warm-500 mb-2">
                    ⚠️ Unmatched — please resolve ({unmatched.length})
                  </p>
                  <div className="space-y-2">
                    {unmatched.map((u) => (
                      <div key={u.csvName} className="flex items-center gap-3 bg-amber-50 rounded-lg px-3 py-2">
                        <span className="text-xs text-warm-700 font-mono flex-1 truncate">{u.csvName}</span>
                        <span className="text-warm-400 text-xs">→</span>
                        <Select
                          value={u.resolvedPlayerId ?? ''}
                          onChange={(value) => updateUnmatchedResolution(u.csvName, value)}
                          placeholder="Select player..."
                          options={teamPlayers.map((p) => ({
                            value: p.id,
                            label: `${p.first_name} ${p.last_name}`,
                          }))}
                          className="text-xs min-w-[160px]"
                        />
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
            </PaperCard>
          )}
        </div>
      )}
    </div>
  );
}
