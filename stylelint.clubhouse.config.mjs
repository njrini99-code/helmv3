// Deliberately bounded: doctrine, naming and motion tokens remain in check.mjs.
// Do not add a broad recommended preset and then suppress existing findings.
export default {
  rules: {
    'declaration-block-no-duplicate-properties': [true, { ignore: ['consecutive-duplicates-with-different-syntaxes'] }],
    'declaration-block-no-duplicate-custom-properties': true,
    'property-no-unknown': [true, { checkPrefixed: false }],
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'function-calc-no-unspaced-operator': true,
    'keyframe-declaration-no-important': true,
  },
};

/**
 * The system's own values (MOTION-AND-VISUAL 4.5, 4.6 and build step 7, Nick 15 Nov 2026). Main holds many of each, so
 * these are not Stylelint rules that would fail every file: scripts/clubhouse/css-quality.mjs counts them per file into
 * config/clubhouse/css-ratchet.json (`npm run clubhouse:css`), and a file may not hold more than its record.
 *
 * - raw-radius: a border-radius that is not a --ch-radius-* step (0, 50% and the global keywords are shapes, not radii).
 * - raw-shadow: a box-shadow with a layer that is not a --ch-* token (none and the no-op 0 0 0 0 transparent are fine).
 * - raw-motion: a raw duration (ms or s) or a cubic-bezier() outside tokens.css and motion.css.
 * - keyframes: an @keyframes outside motion.css.
 *
 * Radius and shadow only fall: a lower count is recorded with `npm run clubhouse:css -- --ratchet`, so a fix can't make
 * room for a new one. Motion and keyframes are ceilings only while the motion thread moves them into motion.css (it lowers
 * them when it lands); then they join the strict list.
 */
const RADIUS_PROP = /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/i;
const SHAPE_WORDS = /^(?:0|0px|50%|100%|inherit|initial|unset|revert|revert-layer)$/i;
const TOKEN_FILES = /(?:^|\/)(?:tokens|motion)\.css$/;

/** True when a border-radius value is built from the steps alone. */
export function radiusIsToken(value) {
  return value
    .replace(/var\(--ch-radius-[a-z]+\)/g, ' ')
    .split(/[\s/]+/)
    .filter(Boolean)
    .every((part) => SHAPE_WORDS.test(part));
}

/** True when every layer of a box-shadow is a --ch-* token, or the value is none or the no-op. */
export function shadowIsToken(value, comma) {
  const v = value.trim();
  if (/^(?:none|inherit|initial|unset|revert|revert-layer|0 0 0 0 transparent)$/i.test(v)) return true;
  return comma(v).every((layer) => /^var\(--ch-[\w-]+\)$/.test(layer.trim()) || /^0 0 0 0 transparent$/i.test(layer.trim()));
}

/** A raw duration or curve in a declaration's value (var() names and their fallbacks aside). */
export const RAW_MOTION = /(?<![\w-])(?:\d*\.)?\d+m?s(?![\w-])|cubic-bezier\(/i;

export const systemRatchet = {
  strict: ['raw-radius', 'raw-shadow'],
  ceiling: ['raw-motion', 'keyframes'],
  isRadius: (prop) => RADIUS_PROP.test(prop),
  tokenFile: (file) => TOKEN_FILES.test(file),
  motionFile: (file) => /(?:^|\/)motion\.css$/.test(file),
};
