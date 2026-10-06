# Vendored PixiJS

`pixi.mjs` is the unmodified ESM, minified build of PixiJS, copied byte for byte.
It is imported by `../city-engine.js` and `../factory-engine.js` (the tool is
served as static files by `scripts/baseballhelm-command-center.mjs`, so there is
no bundler or npm dependency for it).

- Package: `pixi.js` 8.22.0
- Source: `package/dist/pixi.min.mjs` from
  <https://registry.npmjs.org/pixi.js/-/pixi.js-8.22.0.tgz>
- npm integrity:
  `sha512-QbTANHMZ751MIjLiLSUSM8a7LNMWwMIf0KbRCqlW+SPS9hNLfSVS+cl1O2SEp9g1K/wyLzj/OJHv+1TUfiPr/w==`
- SHA-256 of `pixi.mjs`:
  `66257bc46776898bf8c54daaed402ed8f9ac109379c47b2dfa8aa048544d2953`
- License: MIT, see `PIXI-LICENSE` (copied from the same tarball)
- Release notes: <https://github.com/pixijs/pixijs/releases/tag/v8.22.0>

Previous copy: 8.19.0, same file (`dist/pixi.min.mjs`), SHA-256
`28fefb52eeb15bb3e087533456bafc53e91af70932af4dd046ff2938ec3edd0e`.

The trailing `//# sourceMappingURL=pixi.min.mjs.map` comment is kept so the file
stays byte-identical to upstream; the map is not vendored.

## Updating

```sh
npm pack pixi.js@<version>
tar xzf pixi.js-<version>.tgz package/dist/pixi.min.mjs package/LICENSE
cp package/dist/pixi.min.mjs tools/baseballhelm-command-center/vendor/pixi.mjs
cp package/LICENSE tools/baseballhelm-command-center/vendor/PIXI-LICENSE
sha256sum tools/baseballhelm-command-center/vendor/pixi.mjs
```

Then update the list above and open the command center in a browser
(`node scripts/baseballhelm-command-center.mjs`) to check that the city and
factory views render and respond to input.
