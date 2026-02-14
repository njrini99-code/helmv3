'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Division, ProgramType } from '../page';
import { IconX, IconUpload, IconCheck, IconWarning } from '@/components/icons';

interface ImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedCoach {
  name: string;
  title: string;
  email: string;
  school: string;
  conference: string;
  division: Division;
  program: ProgramType;
}

export function ImportModal({ onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [csvText, setCsvText] = useState('');
  const [parsedData, setParsedData] = useState<ParsedCoach[]>([]);
  const [division, setDivision] = useState<Division>('D3');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, errors: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  const supabase = createClient();

  const parseCSV = () => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      setErrors(['CSV must have at least a header row and one data row']);
      return;
    }

    const header = lines[0].toLowerCase();
    const hasConference = header.includes('conference');
    const hasSchool = header.includes('school');
    const hasName = header.includes('name') || header.includes('coach');
    
    if (!hasSchool || !hasName) {
      setErrors(['CSV must have "School" and "Coach Name" or "Name" columns']);
      return;
    }

    const parsed: ParsedCoach[] = [];
    const parseErrors: string[] = [];

    // Parse header to get column indices
    const headerCols = lines[0].split(',').map(h => h.trim().toLowerCase());
    const confIdx = headerCols.findIndex(h => h.includes('conference'));
    const schoolIdx = headerCols.findIndex(h => h.includes('school'));
    const nameIdx = headerCols.findIndex(h => h.includes('name') || h.includes('coach'));
    const titleIdx = headerCols.findIndex(h => h.includes('title') || h.includes('position'));
    const emailIdx = headerCols.findIndex(h => h.includes('email'));
    const programIdx = headerCols.findIndex(h => h.includes('program') || h.includes('gender'));

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle quoted fields with commas
      const cols: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cols.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      cols.push(current.trim());

      const name = nameIdx >= 0 ? cols[nameIdx] : '';
      const school = schoolIdx >= 0 ? cols[schoolIdx] : '';
      const conference = confIdx >= 0 ? cols[confIdx] : 'Unknown';
      const title = titleIdx >= 0 ? cols[titleIdx] : 'Head Coach';
      const email = emailIdx >= 0 ? cols[emailIdx] : '';
      const programRaw = programIdx >= 0 ? cols[programIdx]?.toLowerCase() || '' : '';

      if (!name || !school) {
        parseErrors.push(`Row ${i + 1}: Missing name or school`);
        continue;
      }

      // Parse program type
      let program: ProgramType = 'both';
      if (programRaw.includes("men's") && !programRaw.includes("women")) {
        program = 'mens';
      } else if (programRaw.includes("women")) {
        program = 'womens';
      } else if (programRaw.includes('both') || programRaw.includes('&')) {
        program = 'both';
      }

      parsed.push({
        name,
        title,
        email,
        school,
        conference,
        division,
        program,
      });
    }

    if (parseErrors.length > 0 && parsed.length === 0) {
      setErrors(parseErrors);
      return;
    }

    setParsedData(parsed);
    setErrors(parseErrors);
    setStep('preview');
  };

  const handleImport = async () => {
    setStep('importing');
    setImportProgress({ current: 0, total: parsedData.length, errors: 0 });

    let errorCount = 0;
    const importErrors: string[] = [];

    for (let i = 0; i < parsedData.length; i++) {
      const coach = parsedData[i];
      
      try {
        const { error } = await supabase
          .from('crm_coaches')
          .insert({
            name: coach.name,
            title: coach.title || null,
            email: coach.email || null,
            school: coach.school,
            conference: coach.conference,
            division: coach.division,
            program: coach.program,
            status: 'lead',
          });

        if (error) {
          errorCount++;
          importErrors.push(`${coach.name} @ ${coach.school}: ${error.message}`);
        }
      } catch (err) {
        errorCount++;
        importErrors.push(`${coach.name} @ ${coach.school}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      setImportProgress({ current: i + 1, total: parsedData.length, errors: errorCount });
    }

    setErrors(importErrors);
    setStep('done');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target?.result as string || '');
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-warm-900">Import Coaches</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-warm-100 text-warm-500 transition-colors"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">Division</label>
                <select
                  value={division}
                  onChange={(e) => setDivision(e.target.value as Division)}
                  className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="D2">Division II</option>
                  <option value="D3">Division III</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">Upload CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 mb-2">Or Paste CSV Data</label>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Conference,School,Coach Name,Title,Email,Program"
                  className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm resize-none"
                  rows={10}
                />
              </div>

              {errors.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="font-medium text-red-800 mb-2">Parse Errors:</p>
                  <ul className="text-sm text-red-600 space-y-1">
                    {errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-xs text-warm-500">
                <p className="font-medium mb-1">Expected columns:</p>
                <p>Conference, School, Coach Name, Title, Email, Program</p>
                <p className="mt-1">Program values: Men's, Women's, Both</p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-warm-200 text-warm-600 hover:bg-warm-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={parseCSV}
                  disabled={!csvText.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  Parse & Preview
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-warm-600">
                  Found <span className="font-semibold">{parsedData.length}</span> coaches to import
                </p>
                <span className={cn(
                  'px-2 py-1 rounded text-xs font-medium',
                  division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                )}>
                  {division}
                </span>
              </div>

              {errors.length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <IconWarning className="w-4 h-4 inline mr-1" />
                    {errors.length} rows skipped due to errors
                  </p>
                </div>
              )}

              <div className="border border-warm-200 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-warm-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500">Name</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500">School</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500">Conference</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500">Program</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-100">
                    {parsedData.slice(0, 50).map((coach, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">{coach.name}</td>
                        <td className="px-3 py-2">{coach.school}</td>
                        <td className="px-3 py-2 truncate max-w-[150px]">{coach.conference}</td>
                        <td className="px-3 py-2 capitalize">{coach.program}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 50 && (
                  <div className="px-3 py-2 bg-warm-50 text-sm text-warm-500 text-center">
                    ...and {parsedData.length - 50} more
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 rounded-lg border border-warm-200 text-warm-600 hover:bg-warm-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Import {parsedData.length} Coaches
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-8">
              <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-warm-700 font-medium">
                Importing coaches... {importProgress.current} / {importProgress.total}
              </p>
              {importProgress.errors > 0 && (
                <p className="text-sm text-red-600 mt-2">
                  {importProgress.errors} errors so far
                </p>
              )}
              <div className="w-full bg-warm-200 rounded-full h-2 mt-4 max-w-md mx-auto">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4',
                importProgress.errors === 0 ? 'bg-emerald-100' : 'bg-yellow-100'
              )}>
                <IconCheck className={cn(
                  'w-8 h-8',
                  importProgress.errors === 0 ? 'text-emerald-600' : 'text-yellow-600'
                )} />
              </div>
              <h3 className="text-lg font-semibold text-warm-900 mb-2">Import Complete!</h3>
              <p className="text-warm-600">
                Successfully imported {importProgress.total - importProgress.errors} coaches
                {importProgress.errors > 0 && ` (${importProgress.errors} failed)`}
              </p>

              {errors.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-left max-h-[200px] overflow-y-auto">
                  <p className="font-medium text-red-800 mb-2">Errors:</p>
                  <ul className="text-sm text-red-600 space-y-1">
                    {errors.slice(0, 20).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {errors.length > 20 && (
                      <li>...and {errors.length - 20} more</li>
                    )}
                  </ul>
                </div>
              )}

              <button
                onClick={onSuccess}
                className="mt-6 px-6 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
