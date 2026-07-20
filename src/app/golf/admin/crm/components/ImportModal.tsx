'use client';

import { useState, useId } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Division, ProgramType } from '../crm-config';
import { IconX, IconCheck, IconWarning, IconUpload, IconLayers } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DuplicateReview } from './DuplicateReview';

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
  isDuplicate?: boolean;
}

const inputClass = 'w-full bg-cream-50 border border-warm-200 rounded-xl px-4 py-2.5 text-sm transition-colors focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 outline-none';
const DIVISION_OPTIONS = [
  { value: 'D1', label: 'Division I' },
  { value: 'D2', label: 'Division II' },
  { value: 'D3', label: 'Division III' },
  { value: 'NAIA', label: 'NAIA' },
  { value: 'JUCO', label: 'JUCO' },
];
const DIVISION_VALUES: readonly Division[] = ['D1', 'D2', 'D3', 'NAIA', 'JUCO'];
const labelClass = 'text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5 block';

// Normalizes a raw CSV "Division" cell (e.g. "D1", "Division I", "DIII") to a
// canonical Division value. Returns null when the cell is empty/unrecognized
// so the caller can fall back to the form-level selector.
function normalizeDivision(raw: string): Division | null {
  const v = raw.trim().toUpperCase();
  if (!v) return null;
  if ((DIVISION_VALUES as readonly string[]).includes(v)) return v as Division;
  if (v === 'DI' || v === 'DIVISION I' || v === 'DIVISION 1') return 'D1';
  if (v === 'DII' || v === 'DIVISION II' || v === 'DIVISION 2') return 'D2';
  if (v === 'DIII' || v === 'DIVISION III' || v === 'DIVISION 3') return 'D3';
  return null;
}

export function ImportModal({ onClose, onSuccess }: ImportModalProps) {
  const uid = useId();
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [csvText, setCsvText] = useState('');
  const [parsedData, setParsedData] = useState<ParsedCoach[]>([]);
  const [division, setDivision] = useState<Division>('D3');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, errors: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [showDuplicateReview, setShowDuplicateReview] = useState(false);

  const supabase = createClient();

  const parseCSV = () => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      setErrors(['CSV must have at least a header row and one data row']);
      return;
    }

    const header = lines[0]?.toLowerCase() ?? '';
    const hasSchool = header.includes('school');
    const hasName = header.includes('name') || header.includes('coach');

    if (!hasSchool || !hasName) {
      setErrors(['CSV must have "School" and "Coach Name" or "Name" columns']);
      return;
    }

    const parsed: ParsedCoach[] = [];
    const parseErrors: string[] = [];

    // Parse header to get column indices
    const headerCols = (lines[0] ?? '').split(',').map(h => h.trim().toLowerCase());
    const confIdx = headerCols.findIndex(h => h.includes('conference'));
    const schoolIdx = headerCols.findIndex(h => h.includes('school'));
    const nameIdx = headerCols.findIndex(h => h.includes('name') || h.includes('coach'));
    const titleIdx = headerCols.findIndex(h => h.includes('title') || h.includes('position'));
    const emailIdx = headerCols.findIndex(h => h.includes('email'));
    const programIdx = headerCols.findIndex(h => h.includes('program') || h.includes('gender'));
    const divisionIdx = headerCols.findIndex(h => h.includes('division'));

    for (let i = 1; i < lines.length; i++) {
      const line = (lines[i] ?? '').trim();
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

      const name = nameIdx >= 0 ? (cols[nameIdx] ?? '') : '';
      const school = schoolIdx >= 0 ? (cols[schoolIdx] ?? '') : '';
      const conference = confIdx >= 0 ? (cols[confIdx] ?? 'Unknown') : 'Unknown';
      const title = titleIdx >= 0 ? (cols[titleIdx] ?? 'Head Coach') : 'Head Coach';
      const email = emailIdx >= 0 ? (cols[emailIdx] ?? '') : '';
      const programRaw = programIdx >= 0 ? (cols[programIdx]?.toLowerCase() ?? '') : '';
      const divisionRaw = divisionIdx >= 0 ? (cols[divisionIdx] ?? '') : '';
      // Per-row Division column wins when present and recognized; otherwise
      // fall back to the form-level selector so single-division CSVs (the
      // common case) keep working exactly as before.
      const rowDivision = normalizeDivision(divisionRaw) ?? division;

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
        division: rowDivision,
        program,
      });
    }

    if (parseErrors.length > 0 && parsed.length === 0) {
      setErrors(parseErrors);
      return;
    }

    setParsedData(parsed);
    setErrors(parseErrors);

    // Check for duplicates before showing preview
    checkDuplicates(parsed);
  };

  const checkDuplicates = async (parsed: ParsedCoach[]) => {
    // Collect emails that are non-empty for duplicate detection
    const emails = parsed
      .map(c => c.email)
      .filter(e => e && e.length > 0);

    if (emails.length > 0) {
      try {
        const { data: existingCoaches } = await supabase
          .from('crm_coaches')
          .select('email')
          .in('email', emails);

        if (existingCoaches && existingCoaches.length > 0) {
          const existingEmails = new Set(existingCoaches.map((c: { email: string | null }) => c.email?.toLowerCase()).filter(Boolean));
          let dupes = 0;
          const updated = parsed.map(coach => {
            const isDup = coach.email && existingEmails.has(coach.email.toLowerCase());
            if (isDup) dupes++;
            return { ...coach, isDuplicate: !!isDup };
          });
          setParsedData(updated);
          setDuplicateCount(dupes);
        }
      } catch {
        // If duplicate check fails, proceed without marking duplicates
      }
    }

    setStep('preview');
  };

  const handleImport = async () => {
    setStep('importing');

    // Filter out duplicates
    const coachesToImport = parsedData.filter(c => !c.isDuplicate);
    setImportProgress({ current: 0, total: coachesToImport.length, errors: 0 });

    if (coachesToImport.length === 0) {
      setErrors(['All coaches are duplicates. Nothing to import.']);
      setStep('done');
      return;
    }

    const importErrors: string[] = [];

    try {
      // Batch insert -- single .insert() call with array
      const insertPayload = coachesToImport.map(coach => ({
        name: coach.name,
        title: coach.title || null,
        email: coach.email || null,
        school: coach.school,
        conference: coach.conference,
        division: coach.division,
        program: coach.program,
        status: 'new_lead' as const,
        source: 'import',
      }));

      const { error } = await supabase
        .from('crm_coaches')
        .insert(insertPayload);

      if (error) {
        // If batch insert fails, fall back to individual inserts
        let errorCount = 0;
        for (let i = 0; i < coachesToImport.length; i++) {
          const coach = coachesToImport[i];
          if (!coach) continue;

          try {
            const { error: insertError } = await supabase
              .from('crm_coaches')
              .insert({
                name: coach.name,
                title: coach.title || null,
                email: coach.email || null,
                school: coach.school,
                conference: coach.conference,
                division: coach.division,
                program: coach.program,
                status: 'new_lead',
                source: 'import',
              });

            if (insertError) {
              errorCount++;
              importErrors.push(`${coach.name} @ ${coach.school}: ${insertError.message}`);
            }
          } catch (err) {
            errorCount++;
            importErrors.push(`${coach.name} @ ${coach.school}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }

          setImportProgress({ current: i + 1, total: coachesToImport.length, errors: errorCount });
        }
      } else {
        // Batch succeeded
        setImportProgress({ current: coachesToImport.length, total: coachesToImport.length, errors: 0 });
      }
    } catch (err) {
      importErrors.push(`Batch insert failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setImportProgress(prev => ({ ...prev, errors: prev.errors + 1 }));
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-prominent rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <IconUpload size={16} className="text-warm-600" />
            <h2 className="text-lg font-semibold text-warm-900">Import Coaches</h2>
          </div>
          <IconButton variant="default"
            onClick={onClose}
            aria-label="Close"
            className="text-warm-400 hover:text-warm-600 transition-colors"
          >
            <IconX size={18} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              <div>
                <label htmlFor={`${uid}-division`} className={labelClass}>Default Division</label>
                <Select
                  options={DIVISION_OPTIONS}
                  value={division}
                  onChange={(value) => setDivision(value as Division)}
                  className={inputClass}
                />
                <p className="text-xs text-warm-500 mt-1">
                  Used for rows without a recognized Division column value.
                </p>
              </div>

              <div>
                <label htmlFor={`${uid}-csv-file`} className={labelClass}>Upload CSV File</label>
                <Input
                  id={`${uid}-csv-file`}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor={`${uid}-csv-text`} className={labelClass}>Or Paste CSV Data</label>
                <Textarea
                  id={`${uid}-csv-text`}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Conference,School,Coach Name,Title,Email,Program,Division"
                  className={`${inputClass} font-mono resize-none min-h-[100px]`}
                  rows={10}
                />
              </div>

              {errors.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
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
                <p>Conference, School, Coach Name, Title, Email, Program, Division (optional)</p>
                <p className="mt-1">Program values: Men&apos;s, Women&apos;s, Both</p>
                <p className="mt-1">Division values: D1, D2, D3, NAIA, JUCO — rows missing/unrecognized use the Default Division above</p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost"
                  onClick={() => setShowDuplicateReview(true)}
                  className="inline-flex items-center gap-1.5 bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-warm-50 transition-colors"
                >
                  <IconLayers size={16} />
                  Find duplicates
                </Button>
                <div className="flex justify-end gap-3">
                  <Button variant="ghost"
                    onClick={onClose}
                    className="bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-warm-50 transition-colors"
                  >
                    Cancel
                  </Button>
                  <Button variant="primary"
                    onClick={parseCSV}
                    disabled={!csvText.trim()}
                    className="bg-primary-500 hover:bg-primary-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Parse & Preview
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-warm-600">
                  Found <span className="font-semibold">{parsedData.length}</span> coaches to import
                  {duplicateCount > 0 && (
                    <span className="text-amber-600 ml-1">
                      ({duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} will be skipped)
                    </span>
                  )}
                </p>
                <span className={cn(
                  'px-2 py-1 rounded text-xs font-medium',
                  division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                )}>
                  Default: {division}
                </span>
              </div>

              {errors.length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <p className="text-sm text-yellow-800 flex items-center gap-1.5">
                    <IconWarning className="w-4 h-4" />
                    {errors.length} rows skipped due to errors
                  </p>
                </div>
              )}

              {duplicateCount > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-800 flex items-center gap-1.5">
                    <IconWarning className="w-4 h-4" />
                    {duplicateCount} coach{duplicateCount !== 1 ? 'es' : ''} already exist (matched by email) and will be skipped
                  </p>
                </div>
              )}

              <div className="border border-warm-100 rounded-xl max-h-[300px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-warm-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500 uppercase tracking-wider">Name</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500 uppercase tracking-wider">School</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500 uppercase tracking-wider">Conference</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500 uppercase tracking-wider">Division</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500 uppercase tracking-wider">Program</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-warm-500 uppercase tracking-wider w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-100">
                    {parsedData.slice(0, 50).map((coach, i) => (
                      <tr key={i} className={cn(coach.isDuplicate && 'bg-amber-50/50')}>
                        <td className="px-3 py-2">{coach.name}</td>
                        <td className="px-3 py-2">{coach.school}</td>
                        <td className="px-3 py-2 truncate max-w-[150px]">{coach.conference}</td>
                        <td className="px-3 py-2">{coach.division}</td>
                        <td className="px-3 py-2 capitalize">{coach.program}</td>
                        <td className="px-3 py-2">
                          {coach.isDuplicate && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-semibold bg-amber-100 text-amber-700">
                              Duplicate
                            </span>
                          )}
                        </td>
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
                <Button variant="ghost"
                  onClick={() => { setStep('upload'); setDuplicateCount(0); }}
                  className="bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-warm-50 transition-colors"
                >
                  Back
                </Button>
                <Button variant="primary"
                  onClick={handleImport}
                  disabled={parsedData.filter(c => !c.isDuplicate).length === 0}
                  className="bg-primary-500 hover:bg-primary-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Import {parsedData.filter(c => !c.isDuplicate).length} Coaches
                </Button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-8">
              <div className="flex items-center justify-center gap-2 mx-auto mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                <span className="w-2.5 h-2.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                <span className="w-2.5 h-2.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
              </div>
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
                  className="bg-primary-500 h-2 rounded-full transition-all"
                  style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4',
                importProgress.errors === 0 ? 'bg-primary-100' : 'bg-yellow-100'
              )}>
                <IconCheck className={cn(
                  'w-8 h-8',
                  importProgress.errors === 0 ? 'text-primary-600' : 'text-yellow-600'
                )} />
              </div>
              <h3 className="text-lg font-semibold text-warm-900 mb-2">Import Complete</h3>
              <p className="text-warm-600">
                Successfully imported {importProgress.total - importProgress.errors} coaches
                {importProgress.errors > 0 && ` (${importProgress.errors} failed)`}
                {duplicateCount > 0 && ` (${duplicateCount} duplicates skipped)`}
              </p>

              {errors.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-left max-h-[200px] overflow-y-auto">
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

              <Button variant="primary"
                onClick={onSuccess}
                className="mt-6 bg-primary-500 hover:bg-primary-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </div>

      {showDuplicateReview && (
        <DuplicateReview
          onClose={() => setShowDuplicateReview(false)}
          onMerged={onSuccess}
        />
      )}
    </div>
  );
}
