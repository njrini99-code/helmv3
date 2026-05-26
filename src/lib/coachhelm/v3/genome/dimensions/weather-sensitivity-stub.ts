/**
 * Genome dimension: weather_sensitivity (DEFERRED STUB).
 *
 * Category: weather_sensitivity.
 * Master plan Part IX.2 rule #12 noted no weather/temperature tracking
 * in shot data, and the same constraint applies here. This stub keeps
 * the radar slot present (8 categories complete) and returns null with
 * a clear "weather data unavailable" label.
 *
 * When a weather-context wave eventually ships, replace this file with
 * a real compute() — the registry line stays unchanged.
 */

import type { DimensionResult, GenomeDimension } from '../types';

const dim: GenomeDimension = {
  id: 'weather_sensitivity_stub',
  category: 'weather_sensitivity',
  label: 'Weather sensitivity',

  compute(): DimensionResult {
    return {
      value: null,
      confidence: null,
      label: 'Awaiting weather data',
    };
  },
};

export default dim;
