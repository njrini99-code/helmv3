// Deliberately bounded: doctrine, naming and motion tokens remain in check.mjs.
// Do not add a broad recommended preset and then suppress existing findings.
export default {
  rules: {
    'declaration-block-no-duplicate-properties': [true, { ignore: ['consecutive-duplicates-with-different-syntaxes'] }],
    'declaration-block-no-duplicate-custom-properties': true,
    'property-no-unknown': [true, { checkPrefixed: false }],
    'block-no-empty': true,
  },
};
