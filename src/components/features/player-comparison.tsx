'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { IconX, IconCheck, IconDownload, IconBookmark, IconChartRadar } from '@/components/icons';
import { getFullName, formatHeight, cn } from '@/lib/utils';
import type { Player } from '@/lib/types';
import dynamic from 'next/dynamic';
import { SaveComparisonModal } from './save-comparison-modal';
import { saveComparison } from '@/app/baseball/(dashboard)/dashboard/compare/actions';
import { toast } from '@/components/ui/sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const RadarChart = dynamic(() => import('recharts').then((mod) => mod.RadarChart), { ssr: false });
const PolarGrid = dynamic(() => import('recharts').then((mod) => mod.PolarGrid), { ssr: false });
const PolarAngleAxis = dynamic(() => import('recharts').then((mod) => mod.PolarAngleAxis), { ssr: false });
const PolarRadiusAxis = dynamic(() => import('recharts').then((mod) => mod.PolarRadiusAxis), { ssr: false });
const Radar = dynamic(() => import('recharts').then((mod) => mod.Radar), { ssr: false });
const Legend = dynamic(() => import('recharts').then((mod) => mod.Legend), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((mod) => mod.ResponsiveContainer), { ssr: false });

interface PlayerComparisonProps {
  players: Player[];
  onRemovePlayer?: (playerId: string) => void;
  onClose?: () => void;
  className?: string;
}

interface StatComparison {
  label: string;
  getValue: (player: Player) => string | number | null;
  format?: (value: string | number | null) => string;
  higherIsBetter?: boolean;
}

const statComparisons: StatComparison[] = [
  {
    label: 'Height',
    getValue: (p) => p.height_feet && p.height_inches ? `${p.height_feet}-${p.height_inches}` : null,
    format: (v) => {
      if (!v || typeof v !== 'string') return '—';
      const parts = v.split('-');
      const feet = parts[0] || '0';
      const inches = parts[1] || '0';
      return formatHeight(parseInt(feet), parseInt(inches));
    },
  },
  {
    label: 'Weight',
    getValue: (p) => p.weight_lbs,
    format: (v) => v ? `${v} lbs` : '—',
    higherIsBetter: true,
  },
  {
    label: 'Grad Year',
    getValue: (p) => p.grad_year,
    format: (v) => v !== null && v !== undefined ? String(v) : '—',
  },
  {
    label: 'Position',
    getValue: (p) => p.primary_position,
    format: (v) => v !== null && v !== undefined ? String(v) : '—',
  },
  {
    label: 'Bats',
    getValue: (p) => p.bats,
    format: (v) => v !== null && v !== undefined ? String(v) : '—',
  },
  {
    label: 'Throws',
    getValue: (p) => p.throws,
    format: (v) => v !== null && v !== undefined ? String(v) : '—',
  },
  {
    label: 'Pitch Velo',
    getValue: (p) => p.pitch_velo,
    format: (v) => v ? `${v} mph` : '—',
    higherIsBetter: true,
  },
  {
    label: 'Exit Velo',
    getValue: (p) => p.exit_velo,
    format: (v) => v ? `${v} mph` : '—',
    higherIsBetter: true,
  },
  {
    label: '60 Time',
    getValue: (p) => p.sixty_time,
    format: (v) => v ? `${v}s` : '—',
    higherIsBetter: false,
  },
  {
    label: 'GPA',
    getValue: (p) => p.gpa,
    format: (v) => (v && typeof v === 'number') ? v.toFixed(2) : '—',
    higherIsBetter: true,
  },
  {
    label: 'SAT',
    getValue: (p) => p.sat_score,
    format: (v) => v !== null && v !== undefined ? String(v) : '—',
    higherIsBetter: true,
  },
  {
    label: 'ACT',
    getValue: (p) => p.act_score,
    format: (v) => v !== null && v !== undefined ? String(v) : '—',
    higherIsBetter: true,
  },
];

export function PlayerComparison({
  players,
  onRemovePlayer,
  onClose,
  className
}: PlayerComparisonProps) {
  const [selectedStats] = useState<Set<string>>(
    new Set(statComparisons.map(s => s.label))
  );
  const [showRadarChart, setShowRadarChart] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const comparisonRef = useRef<HTMLDivElement>(null);

  const getBestValue = (stat: StatComparison) => {
    const values = players
      .map(p => stat.getValue(p))
      .filter(v => v !== null && v !== undefined);

    if (values.length === 0) return null;

    if (stat.higherIsBetter === undefined) return null;

    const numericValues = values
      .map(v => typeof v === 'string' ? parseFloat(v) : v)
      .filter(v => !isNaN(v as number));

    if (numericValues.length === 0) return null;

    return stat.higherIsBetter
      ? Math.max(...(numericValues as number[]))
      : Math.min(...(numericValues as number[]));
  };

  const isValueBest = (stat: StatComparison, value: string | number | null, formattedValue: string) => {
    if (formattedValue === '—') return false;
    if (stat.higherIsBetter === undefined) return false;

    const bestValue = getBestValue(stat);
    if (bestValue === null) return false;

    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numericValue as number)) return false;

    return numericValue === bestValue;
  };

  // Prepare radar chart data
  const getRadarData = () => {
    type RadarMetricKey = 'pitch_velo' | 'exit_velo' | 'sixty_time' | 'gpa' | 'height';
    type PlayerMetricKey = Exclude<RadarMetricKey, 'height'>;

    const radarMetrics: Array<{ key: RadarMetricKey; label: string; max: number; inverse?: boolean }> = [
      { key: 'pitch_velo', label: 'Pitch Velo', max: 100 },
      { key: 'exit_velo', label: 'Exit Velo', max: 110 },
      { key: 'sixty_time', label: '60 Time', max: 8, inverse: true },
      { key: 'gpa', label: 'GPA', max: 5 },
      { key: 'height', label: 'Height', max: 80 }, // inches
    ];

    return radarMetrics.map(metric => {
      const dataPoint: Record<string, string | number> = { metric: metric.label };

      players.forEach((player, index) => {
        let value = 0;

        if (metric.key === 'height' && player.height_feet && player.height_inches) {
          const totalInches = player.height_feet * 12 + player.height_inches;
          value = (totalInches / metric.max) * 100;
        } else if (metric.key === 'sixty_time' && player.sixty_time) {
          // Inverse - lower is better, so invert the percentage
          value = metric.inverse ? (1 - (player.sixty_time / metric.max)) * 100 : (player.sixty_time / metric.max) * 100;
        } else if (metric.key !== 'height') {
          const metricValue = player[metric.key as PlayerMetricKey];
          if (typeof metricValue === 'number') {
            value = (metricValue / metric.max) * 100;
          }
        }

        dataPoint[`player${index + 1}`] = Math.min(100, Math.max(0, value));
      });

      return dataPoint;
    });
  };

  const PLAYER_COLORS = ['#16A34A', '#3B82F6', '#F59E0B', '#EF4444'];

  const handleSave = () => {
    setShowSaveModal(true);
  };

  const handleSaveComparison = async (data: { name: string; description?: string }) => {
    setSaving(true);

    try {
      const playerIds = players.map(p => p.id);

      const result = await saveComparison({
        name: data.name,
        notes: data.description,
        playerIds,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Comparison saved successfully!');
        setShowSaveModal(false);
      }
    } catch (error) {
      toast.error('Failed to save comparison');
      console.error('Save comparison error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!comparisonRef.current) {
      toast.error('Unable to export comparison');
      return;
    }

    setExporting(true);

    try {
      // Wait a tick for any pending renders
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture the comparison element as canvas with improved options
      const canvas = await html2canvas(comparisonRef.current, {
        scale: 2, // Higher quality
        logging: false,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FAF6F1', // Cream background
        windowWidth: comparisonRef.current.scrollWidth,
        windowHeight: comparisonRef.current.scrollHeight,
        onclone: (clonedDoc) => {
          // Ensure the cloned element is fully visible
          const clonedElement = clonedDoc.querySelector('[data-comparison-ref]');
          if (clonedElement instanceof HTMLElement) {
            clonedElement.style.overflow = 'visible';
          }
        },
      });

      // Calculate PDF dimensions - use landscape if wider than tall
      const imgRatio = canvas.width / canvas.height;
      const isLandscape = imgRatio > 1.2;
      
      const pdf = new jsPDF(isLandscape ? 'l' : 'p', 'mm', 'a4');
      const pageWidth = isLandscape ? 297 : 210; // A4 dimensions
      const pageHeight = isLandscape ? 210 : 297;
      
      const imgWidth = pageWidth - 20; // 10mm margins on each side
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      const imgData = canvas.toDataURL('image/png', 1.0);

      // Check if we need multiple pages
      if (imgHeight > pageHeight - 20) {
        // Scale down to fit single page
        const scaledHeight = pageHeight - 20;
        const scaledWidth = (canvas.width * scaledHeight) / canvas.height;
        const xOffset = (pageWidth - scaledWidth) / 2;
        pdf.addImage(imgData, 'PNG', xOffset, 10, scaledWidth, scaledHeight);
      } else {
        pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      }

      // Add header/footer
      pdf.setFontSize(8);
      pdf.setTextColor(128, 128, 128);
      pdf.text(`Generated on ${new Date().toLocaleDateString()}`, 10, pageHeight - 5);

      // Generate filename with player names (sanitized)
      const playerNames = players
        .map(p => getFullName(p.first_name, p.last_name))
        .join('_')
        .replace(/[^a-zA-Z0-9_]/g, '');
      const filename = `player_comparison_${playerNames}_${new Date().toISOString().split('T')[0]}.pdf`;

      // Save PDF
      pdf.save(filename);

      toast.success('PDF exported successfully!');
    } catch (error) {
      toast.error('Failed to export PDF. Please try again.');
      // Log error but don't expose details
      if (process.env.NODE_ENV === 'development') {
        console.error('Export error:', error);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div ref={comparisonRef} data-comparison-ref>
        <Card variant="glass" className={cn('overflow-hidden border-white/40', className)}>
          {onClose && (
        <CardHeader className="flex flex-row items-center justify-between border-b border-border-light">
          <h2 className="text-lg font-semibold text-warm-900">Player Comparison</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close comparison">
            <IconX size={18} />
          </Button>
        </CardHeader>
      )}

      <CardContent className="p-0">
        {/* Horizontal scroll container for mobile */}
        <div className="overflow-x-auto scrollbar-hide -webkit-overflow-scrolling-touch">
          <table className="w-full min-w-[600px]">
            {/* Player Headers */}
            <thead className="bg-cream-50 border-b border-border-light">
              <tr>
                <th className="sticky left-0 bg-cream-50 z-10 px-4 py-3 text-left text-sm font-medium text-warm-600 min-w-[140px]">
                  Metric
                </th>
                {players.map(player => {
                  const name = getFullName(player.first_name, player.last_name);
                  return (
                    <th key={player.id} className="px-4 py-3 text-center min-w-[200px]">
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative">
                          <Avatar decorative
                            name={name}
                            src={player.avatar_url}
                            size="lg"
                            ring
                          />
                          {onRemovePlayer && players.length > 1 && (
                            <IconButton variant="default" aria-label="Close"
                              onClick={() => onRemovePlayer(player.id)}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-warm-700 text-white rounded-full flex items-center justify-center hover:bg-warm-800 transition-colors shadow-sm"
                            >
                              <IconX size={12} />
                            </IconButton>
                          )}
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-warm-900 text-sm">{name}</p>
                          <p className="text-xs text-warm-500">
                            {player.high_school_name}
                          </p>
                          <div className="flex items-center gap-1 justify-center mt-1">
                            <Badge variant="primary" className="text-2xs">
                              {player.primary_position}
                            </Badge>
                            <Badge variant="success" className="text-2xs">
                              {player.grad_year}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Stats Rows */}
            <tbody>
              {statComparisons
                .filter(stat => selectedStats.has(stat.label))
                .map((stat, index) => (
                  <tr
                    key={stat.label}
                    className={cn(
                      'border-b border-border-light hover:bg-cream-50 active:bg-cream-100 transition-colors',
                      index % 2 === 0 && 'bg-cream-50'
                    )}
                  >
                    <td className="sticky left-0 bg-inherit z-10 px-4 py-3 text-sm font-medium text-warm-700">
                      {stat.label}
                    </td>
                    {players.map(player => {
                      const value = stat.getValue(player);
                      const formattedValue = stat.format
                        ? stat.format(value)
                        : value?.toString() || '—';
                      const isBest = isValueBest(stat, value, formattedValue);

                      return (
                        <td
                          key={player.id}
                          className={cn(
                            'px-4 py-3 text-center text-sm transition-colors',
                            isBest && 'bg-primary-50 font-semibold text-primary-900'
                          )}
                        >
                          <div className="flex items-center justify-center gap-1">
                            {isBest && (
                              <IconCheck size={14} className="text-primary-600" />
                            )}
                            {formattedValue}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Radar Chart Visualization */}
        {showRadarChart && (
          <div className="p-6 border-t border-border-light bg-cream-50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <IconChartRadar size={20} className="text-primary-600" />
                <h3 className="text-base font-semibold text-warm-900">Performance Radar</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRadarChart(!showRadarChart)}
              >
                Hide Chart
              </Button>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={getRadarData()}>
                <PolarGrid stroke="#E2E8F0" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: '#64748B', fontSize: 12 }}
                />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} />
                {players.map((player, index) => {
                  const name = getFullName(player.first_name, player.last_name);
                  return (
                    <Radar
                      key={player.id}
                      name={name}
                      dataKey={`player${index + 1}`}
                      stroke={PLAYER_COLORS[index]}
                      fill={PLAYER_COLORS[index]}
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  );
                })}
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="circle"
                />
              </RadarChart>
            </ResponsiveContainer>
            <p className="text-xs text-warm-500 text-center mt-2">
              Values are normalized to a 0-100 scale for comparison
            </p>
          </div>
        )}

        {!showRadarChart && (
          <div className="p-4 bg-warm-50 border-t border-border-light">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRadarChart(true)}
              className="w-full"
            >
              <IconChartRadar size={16} className="mr-2" />
              Show Radar Chart
            </Button>
          </div>
        )}

        {/* Footer with action buttons — stacks on phone (flex-col) since the
            two non-shrinking (whitespace-nowrap) buttons plus the "Comparing
            N players" label don't fit one row under ~390px, and Card's own
            overflow-clip would otherwise silently hide whichever action loses
            the fight for space rather than showing a scrollbar. */}
        <div className="flex flex-col gap-3 p-4 bg-cream-50 border-t border-border-light sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-warm-600">
            Comparing {players.length} player{players.length > 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
            >
              <IconDownload size={16} className="mr-1.5" />
              {exporting ? 'Exporting...' : 'Export PDF'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              <IconBookmark size={16} className="mr-1.5" />
              {saving ? 'Saving...' : 'Save Comparison'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>

  {/* Save Comparison Modal - Outside ref to exclude from PDF */}
  <SaveComparisonModal
    open={showSaveModal}
    onClose={() => setShowSaveModal(false)}
    onSave={handleSaveComparison}
    playerCount={players.length}
  />
</>
  );
}