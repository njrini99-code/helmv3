import type { LocationSample } from './location-estimator';

/** Raw GNSS windows (master plan §71). The durable anchor keeps the resolved
 * position, covariance and a summary of the estimator's evidence; the raw
 * latitude/longitude window never persists or uploads by default. Internal
 * calibration and debugging opt in by handing the controller a sink; the
 * memory sink below is bounded and lives only as long as the session. */
export interface CalibrationTrace {
  anchorId: string;
  roundId: string;
  tapMs: number;
  samples: readonly LocationSample[];
}
export interface CalibrationTraceSink { record(trace: CalibrationTrace): void }
export class MemoryCalibrationTraceSink implements CalibrationTraceSink {
  private traces: CalibrationTrace[] = [];
  constructor(private readonly limit = 64) {}
  record(trace: CalibrationTrace) {
    this.traces = [...this.traces.filter(t => t.anchorId !== trace.anchorId), trace].slice(-this.limit);
  }
  get(anchorId: string): CalibrationTrace | null { return this.traces.find(t => t.anchorId === anchorId) ?? null; }
  list(): readonly CalibrationTrace[] { return this.traces; }
  clear() { this.traces = []; }
}
