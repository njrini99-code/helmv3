// Easing functions for custom animations
export const easings = {
  outExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  elastic: 'cubic-bezier(0.5, 1.5, 0.5, 1)',
  inOutQuart: 'cubic-bezier(0.76, 0, 0.24, 1)',
}

// Delay utility for async operations
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Map range utility for animations
export const mapRange = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number => {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

// Clamp utility
export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

// Lerp (linear interpolation)
export const lerp = (start: number, end: number, factor: number): number => {
  return start + (end - start) * factor
}

// Generate random number in range
export const randomInRange = (min: number, max: number): number => {
  return Math.random() * (max - min) + min
}

// Animation spring configs
export const springConfigs = {
  gentle: { stiffness: 120, damping: 14 },
  default: { stiffness: 300, damping: 30 },
  wobbly: { stiffness: 180, damping: 12 },
  stiff: { stiffness: 400, damping: 40 },
  slow: { stiffness: 100, damping: 20 },
}

// Stagger delay calculator
export const getStaggerDelay = (index: number, baseDelay = 0.05): number => {
  return index * baseDelay
}
