/**
 * StandingBar metric display primitives.
 *
 * Lives in src/lib so counterfactual + metric-config can reference
 * direction/unit without importing React UI components.
 */

export type Direction = 'higher_better' | 'lower_better';

export type Unit = 'percent' | 'strokes' | 'yards' | 'count' | 'feet';
