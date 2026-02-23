import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formatStat } from '@/lib/utils/golf-stats-calculator-shots';
import type { TrendAnalysisResponse } from './sections/types';

export async function generateStatsPDF({
  stats,
  playerName,
  trendData,
}: {
  stats: GolfStats;
  playerName?: string;
  trendData?: TrendAnalysisResponse | null;
}): Promise<void> {
  // Dynamically import to avoid SSR issues
  const [html2canvas, { jsPDF }] = await Promise.all([
    import('html2canvas').then(m => m.default),
    import('jspdf'),
  ]);

  const summary = {
    avgScore: stats.scoringAverage,
    bestRound: stats.bestRound,
    worstRound: stats.worstRound,
    roundsPlayed: stats.roundsPlayed,
    holesPlayed: stats.holesPlayed,
    girPct: stats.girPercentage,
    fairwayPct: stats.fairwayPercentage,
    avgPutts: stats.puttsPerRound,
    scramblingPct: stats.scramblingPercentage,
    sgTotal: stats.strokesGainedTotal,
    sgTee: stats.strokesGainedTee,
    sgApproach: stats.strokesGainedApproach,
    sgAroundGreen: stats.strokesGainedAroundGreen,
    sgPutting: stats.strokesGainedPutting,
  };

  const exportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // Create a temporary export-friendly element
  const exportDiv = document.createElement('div');
  exportDiv.style.position = 'absolute';
  exportDiv.style.left = '-9999px';
  exportDiv.style.width = '800px';
  exportDiv.style.padding = '40px';
  exportDiv.style.backgroundColor = '#ffffff';
  exportDiv.style.fontFamily = 'Inter, system-ui, sans-serif';

  exportDiv.innerHTML = `
    <div style="margin-bottom: 32px;">
      <h1 style="font-size: 28px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0;">
        ${playerName || 'Golf'} Stats Report
      </h1>
      <p style="font-size: 14px; color: #78716c; margin: 0;">
        Generated on ${exportDate} • ${stats.roundsPlayed} rounds • ${stats.holesPlayed} holes
      </p>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 14px; font-weight: 600; color: #78716c; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
          Scoring Overview
        </h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${formatStat(summary.avgScore, '', 1)}</div>
            <div style="font-size: 12px; color: #78716c;">Scoring Avg</div>
          </div>
          <div>
            <div style="font-size: 28px; font-weight: 700; color: #0f172a;">${summary.bestRound || '-'}</div>
            <div style="font-size: 12px; color: #78716c;">Best Round</div>
          </div>
          <div>
            <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${summary.worstRound || '-'}</div>
            <div style="font-size: 12px; color: #78716c;">Worst Round</div>
          </div>
          <div>
            <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${stats.roundsPlayed}</div>
            <div style="font-size: 12px; color: #78716c;">Rounds Played</div>
          </div>
        </div>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 14px; font-weight: 600; color: #78716c; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
          Performance Metrics
        </h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${formatStat(summary.girPct, '%', 1)}</div>
            <div style="font-size: 12px; color: #78716c;">GIR %</div>
          </div>
          <div>
            <div style="font-size: 28px; font-weight: 700; color: #0f172a;">${formatStat(summary.fairwayPct, '%', 1)}</div>
            <div style="font-size: 12px; color: #78716c;">Fairways Hit</div>
          </div>
          <div>
            <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${formatStat(summary.avgPutts, '', 1)}</div>
            <div style="font-size: 12px; color: #78716c;">Putts/Round</div>
          </div>
          <div>
            <div style="font-size: 20px; font-weight: 600; color: #0f172a;">${formatStat(summary.scramblingPct, '%', 1)}</div>
            <div style="font-size: 12px; color: #78716c;">Scrambling</div>
          </div>
        </div>
      </div>
    </div>

    ${summary.sgTotal !== null ? `
    <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
      <h2 style="font-size: 14px; font-weight: 600; color: #166534; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
        Strokes Gained Analysis
      </h2>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;">
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: ${(summary.sgTotal || 0) >= 0 ? '#16a34a' : '#dc2626'};">
            ${(summary.sgTotal || 0) >= 0 ? '+' : ''}${formatStat(summary.sgTotal, '', 2)}
          </div>
          <div style="font-size: 11px; color: #78716c;">Total</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 18px; font-weight: 600; color: ${(summary.sgTee || 0) >= 0 ? '#16a34a' : '#dc2626'};">
            ${(summary.sgTee || 0) >= 0 ? '+' : ''}${formatStat(summary.sgTee, '', 2)}
          </div>
          <div style="font-size: 11px; color: #78716c;">Tee</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 18px; font-weight: 600; color: ${(summary.sgApproach || 0) >= 0 ? '#16a34a' : '#dc2626'};">
            ${(summary.sgApproach || 0) >= 0 ? '+' : ''}${formatStat(summary.sgApproach, '', 2)}
          </div>
          <div style="font-size: 11px; color: #78716c;">Approach</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 18px; font-weight: 600; color: ${(summary.sgAroundGreen || 0) >= 0 ? '#16a34a' : '#dc2626'};">
            ${(summary.sgAroundGreen || 0) >= 0 ? '+' : ''}${formatStat(summary.sgAroundGreen, '', 2)}
          </div>
          <div style="font-size: 11px; color: #78716c;">Around Green</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 18px; font-weight: 600; color: ${(summary.sgPutting || 0) >= 0 ? '#16a34a' : '#dc2626'};">
            ${(summary.sgPutting || 0) >= 0 ? '+' : ''}${formatStat(summary.sgPutting, '', 2)}
          </div>
          <div style="font-size: 11px; color: #78716c;">Putting</div>
        </div>
      </div>
    </div>
    ` : ''}

    ${trendData?.personalBests ? `
    <div style="background: #fef3c7; border-radius: 12px; padding: 20px;">
      <h2 style="font-size: 14px; font-weight: 600; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
        Personal Records
      </h2>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
        ${trendData.personalBests.bestScore ? `
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #92400e;">${trendData.personalBests.bestScore.value}</div>
          <div style="font-size: 11px; color: #92400e;">Best Score</div>
        </div>
        ` : ''}
        ${trendData.personalBests.bestToPar ? `
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #92400e;">
            ${trendData.personalBests.bestToPar.value > 0 ? '+' : ''}${trendData.personalBests.bestToPar.value}
          </div>
          <div style="font-size: 11px; color: #92400e;">Best to Par</div>
        </div>
        ` : ''}
        ${trendData.personalBests.bestGir ? `
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #92400e;">${trendData.personalBests.bestGir.value}%</div>
          <div style="font-size: 11px; color: #92400e;">Best GIR</div>
        </div>
        ` : ''}
        ${trendData.personalBests.lowestPutts ? `
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #92400e;">${trendData.personalBests.lowestPutts.value}</div>
          <div style="font-size: 11px; color: #92400e;">Lowest Putts</div>
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}

    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e7e5e4;">
      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
        Generated by GolfHelm • helm.app
      </p>
    </div>
  `;

  document.body.appendChild(exportDiv);

  const canvas = await html2canvas(exportDiv, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  document.body.removeChild(exportDiv);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [canvas.width / 2, canvas.height / 2],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
  pdf.save(`${playerName || 'Golf'}-Stats-${new Date().toISOString().split('T')[0]}.pdf`);
}
