#!/usr/bin/env node
/**
 * The app's native canvas colour, from one switch (A15): config/native-canvas.json names the active palette (Fairway's
 * cream or Clubhouse's page) and this writes it everywhere the native app draws before or around the web page:
 *
 *   - ios/App/App/Assets.xcassets/AppCanvas.colorset   the launch screen, view, web view and overscroll (light + dark)
 *   - ios/App/App/Base.lproj/LaunchScreen.storyboard  the named colour's inline fallback
 *   - ios/App/App/Assets.xcassets/Splash.imageset      the splash images (from config/native-canvas/splash/<palette>/)
 *   - capacitor.config.ts and its generated ios/App/App/capacitor.config.json   the web view and splash colour
 *   - android/app/src/main/res (drawable/splash.xml, values/styles.xml)          Android's splash
 *
 * A dry run by default: it prints what would change. `--apply` writes. `--set <palette>` changes the switch first, so
 * going back is `node scripts/native-canvas.mjs --set fairway --apply`. `--check` exits 1 when a copy differs from the
 * active palette. Nothing ships until a new app build. src/test/static/canvas-color-sync.test.ts pins the result.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => join(root, p);
const CONFIG = 'config/native-canvas.json';

const { values } = parseArgs({ options: { apply: { type: 'boolean' }, check: { type: 'boolean' }, set: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('usage: node scripts/native-canvas.mjs [--set fairway|clubhouse] [--apply | --check]');
  process.exit(0);
}

const config = JSON.parse(readFileSync(at(CONFIG), 'utf8'));
if (values.set) {
  if (!config.palettes[values.set]) throw new Error(`no palette "${values.set}" (have: ${Object.keys(config.palettes).join(', ')})`);
  config.active = values.set;
}
const palette = config.palettes[config.active];
if (!palette) throw new Error(`active palette "${config.active}" is not defined`);
const known = Object.values(config.palettes).flatMap((p) => [p.light, p.dark]);
const hex = (h) => h.replace('#', '').toUpperCase();
const channels = (h) => [0, 2, 4].map((i) => parseInt(hex(h).slice(i, i + 2), 16));

/** Every write this palette needs: [path, next contents] (text) or [path, source file] (binary copy). */
function plan() {
  const text = [];
  const copies = [];

  const component = (h) => {
    const [r, g, b] = channels(h);
    const two = (n) => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;
    return { 'color-space': 'srgb', components: { alpha: '1.000', blue: two(b), green: two(g), red: two(r) } };
  };
  const asset = {
    colors: [
      { color: component(palette.light), idiom: 'universal' },
      { appearances: [{ appearance: 'luminosity', value: 'dark' }], color: component(palette.dark), idiom: 'universal' },
    ],
    info: { author: 'xcode', version: 1 },
  };
  text.push(['ios/App/App/Assets.xcassets/AppCanvas.colorset/Contents.json', `${JSON.stringify(asset, null, 2)}\n`]);

  const sb = readFileSync(at('ios/App/App/Base.lproj/LaunchScreen.storyboard'), 'utf8');
  const [r, g, b] = channels(palette.light).map((n) => String(n / 255));
  text.push([
    'ios/App/App/Base.lproj/LaunchScreen.storyboard',
    sb.replace(/(<namedColor name="AppCanvas">\s*<color )red="[\d.]+" green="[\d.]+" blue="[\d.]+"/, `$1red="${r}" green="${g}" blue="${b}"`),
  ]);

  // A known palette colour in a colour value (never in a comment) becomes the active light colour: `backgroundColor:
  // '#…'` in the TS config, `"backgroundColor": "#…"` in the generated JSON, `android:color="#…"` and
  // `windowSplashScreenBackground">#…<` in Android's resources. Nothing else in the file is touched.
  const anyKnown = known.map(hex).join('|');
  const value = new RegExp(`((?:backgroundColor['"]?\\s*:\\s*['"])|(?:android:color=")|(?:windowSplashScreenBackground">))#(?:${anyKnown})`, 'gi');
  const swapLight = (src) => src.replace(value, `$1#${hex(palette.light)}`);
  for (const p of ['capacitor.config.ts', 'ios/App/App/capacitor.config.json', 'android/app/src/main/res/drawable/splash.xml', 'android/app/src/main/res/values/styles.xml']) {
    text.push([p, swapLight(readFileSync(at(p), 'utf8'))]);
  }

  const splash = 'ios/App/App/Assets.xcassets/Splash.imageset';
  const from = `config/native-canvas/splash/${config.active}`;
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) copies.push([`${splash}/${name}`, `${from}/light.png`]);
  for (const name of ['splash-2732x2732-dark.png', 'splash-dark-1x.png', 'splash-dark-2x.png']) copies.push([`${splash}/${name}`, `${from}/dark.png`]);
  return { text, copies };
}

const read = (p) => {
  try {
    return readFileSync(at(p));
  } catch {
    return null;
  }
};
const { text, copies } = plan();
const changed = [
  ...text.filter(([p, next]) => read(p)?.toString('utf8') !== next).map(([p]) => p),
  ...copies.filter(([p, src]) => !read(p)?.equals(readFileSync(at(src)))).map(([p]) => p),
];

console.log(`native canvas: ${config.active} (light ${palette.light}, dark ${palette.dark})`);
if (values.check) {
  if (changed.length) {
    console.log(`out of step with ${CONFIG}:\n  ${changed.join('\n  ')}`);
    process.exit(1);
  }
  console.log('every native copy matches');
  process.exit(0);
}
if (!changed.length && !values.set) {
  console.log('nothing to change');
  process.exit(0);
}
console.log(`${values.apply ? 'writing' : 'would write (dry run; pass --apply)'}:\n  ${[...(values.set ? [CONFIG] : []), ...changed].join('\n  ') || '(the switch only)'}`);
if (!values.apply) process.exit(0);
if (values.set) writeFileSync(at(CONFIG), `${JSON.stringify(config, null, 2)}\n`);
for (const [p, next] of text) if (changed.includes(p)) writeFileSync(at(p), next);
for (const [p, src] of copies) if (changed.includes(p)) copyFileSync(at(src), at(p));
console.log('done. It ships with the next app build.');
