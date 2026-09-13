async page => {
  const browser=page.context().browser(), report={screens:[],checks:{},errors:[],animation:{}};
  for(const [width,height] of [[375,812],[390,844],[430,932],[320,568]]) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const p=await context.newPage();
    p.on('pageerror',e=>report.errors.push(e.message));
    await p.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8768/')?r.continue():r.abort());
    await p.goto('http://127.0.0.1:8768/golf/dashboard/rounds/continue/fixture?case=around');
    await p.getByRole('radio',{name:'Green (not fringe)'}).click();
    const input=p.getByRole('spinbutton',{name:'Proximity to hole in feet'});
    await input.fill('12');
    const original=await p.locator('[data-fixture-ledger]').getAttribute('data-fixture-ledger');
    const inline=await p.locator('[data-slot=course-drawing]').innerHTML();
    await p.locator('[data-compiled-state=ready]').waitFor({state:'attached'});
    await p.getByRole('button',{name:'Expand course view'}).click();
    const dialog=p.getByRole('dialog'), canvas=dialog.locator('canvas');
    await canvas.waitFor();
    await p.waitForFunction(() => document.querySelector('canvas[data-terrain-renderer="three-webgl2"]'));
    await p.waitForFunction(()=>Array.from(document.querySelectorAll('[data-slot=modal-shell]')).every(el=>+getComputedStyle(el).opacity>.999));
    for(const preset of ['Top','Terrain','Side']) {
      if(preset==='Side')await dialog.getByRole('button',{name:'Camera controls',exact:true}).click();
      await dialog.getByRole('button',{name:preset,exact:true}).click();
      if(preset==='Side')await dialog.getByRole('button',{name:'Camera controls',exact:true}).click();
      await p.waitForFunction(pitch=>+document.querySelector('canvas[data-terrain-pitch]').dataset.terrainPitch===pitch, {Top:90,Terrain:50,Side:20}[preset]);
      await p.screenshot({path:`output/playwright/course-geometry/terrain-${preset.toLowerCase()}-${width}.png`});
      report.screens.push({width,height,preset,drawing:await canvas.boundingBox(),triangles:+await canvas.getAttribute('data-terrain-triangles')});
    }
    await dialog.getByRole('button',{name:'Camera controls',exact:true}).click();
    await dialog.getByRole('button',{name:'Height 1.5×',exact:true}).click();
    if(await canvas.getAttribute('data-terrain-exaggeration')!=='1') throw new Error('Height toggle failed');
    await dialog.getByRole('button',{name:'Camera controls',exact:true}).click();
    await dialog.getByRole('button',{name:'Reset view',exact:true}).click();
    const box=await canvas.boundingBox();
    await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await p.mouse.down();
    await p.mouse.move(box.x+box.width/2+40,box.y+box.height/2+70,{steps:12});
    await p.mouse.up();
    await p.waitForFunction(()=>+document.querySelector('canvas[data-terrain-pitch]').dataset.terrainPitch<90);
    if(await p.locator('[data-fixture-ledger]').getAttribute('data-fixture-ledger')!==original) throw new Error('Camera mutated ledger');
    await p.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    if(await input.inputValue()!=='12'||await p.locator('[data-slot=course-drawing]').innerHTML()!==inline) throw new Error('Camera lost unsaved input or changed inline scene');
    if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Horizontal overflow');
    report.checks[`entry-${width}`]={presets:true,drag:true,height:true,ledgerUnchanged:true,unsavedInputPreserved:true,inlineUnchanged:true};
    if(width===390) {
      // Deterministic failure injection: actual WebGL context loss, not a mocked renderer.
      await p.locator('[data-compiled-state=ready]').waitFor({state:'attached'});
    await p.getByRole('button',{name:'Expand course view'}).click();
      await p.waitForFunction(() => document.querySelector('canvas[data-terrain-renderer="three-webgl2"]'));
      await canvas.evaluate(el=>el.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
      await p.getByRole('status').filter({hasText:'3D view unavailable'}).waitFor();
      if(await dialog.getByRole('group',{name:'Terrain camera',exact:true}).count()) throw new Error('Dead camera controls survived GPU loss');
      await p.screenshot({path:'output/playwright/course-geometry/terrain-gpu-fallback-390.png'});
      await p.keyboard.press('Escape');
      if(await input.inputValue()!=='12') throw new Error('GPU failure lost unsaved input');
      report.checks.gpuLossFallback=true;
      await p.setViewportSize({width:390,height:510});
      await input.focus();
      await input.scrollIntoViewIfNeeded();
      await p.screenshot({path:'output/playwright/course-geometry/entry-short-focused-390.png'});
      report.checks.shortFocusedViewport={input:await input.boundingBox(),nativeKeyboardVerified:false};
      await p.setViewportSize({width,height});
    }
    for(const scenario of ['missing','putting']) {
      await p.goto(`http://127.0.0.1:8768/golf/dashboard/rounds/continue/fixture?case=${scenario}`);
      await p.locator('[data-compiled-state=ready]').waitFor({state:'attached'});
    await p.getByRole('button',{name:'Expand course view'}).click();
      if(await dialog.getByRole('group',{name:'Terrain camera',exact:true}).count()) throw new Error(`Unexpected terrain for ${scenario}`);
      await p.keyboard.press('Escape');
    }
    report.checks.fallbackAndPutting=true;
    await p.goto('http://127.0.0.1:8768/golf/dashboard/rounds/fixture/review?hole=7');
    await p.getByRole('button',{name:'Shot 2',exact:true}).click();
    await p.locator('[data-compiled-state=ready]').waitFor({state:'attached'});
    await p.getByRole('button',{name:'Expand course view'}).click();
    await dialog.getByRole('button',{name:'Terrain',exact:true}).click();
    await p.waitForFunction(()=>Array.from(document.querySelectorAll('[data-slot=modal-shell]')).every(el=>+getComputedStyle(el).opacity>.999));
    await p.screenshot({path:`output/playwright/course-geometry/review-terrain-${width}.png`});
    await dialog.getByRole('button',{name:'Choose course area',exact:true}).click();
    await dialog.getByRole('button',{name:'Whole hole',exact:true}).click();
    await dialog.getByRole('button',{name:'Terrain',exact:true}).click();
    await p.screenshot({path:`output/playwright/course-geometry/terrain-whole-hole-${width}.png`});
    await context.close();
  }
  if(report.errors.length) throw new Error(JSON.stringify(report.errors));
  await page.evaluate(value=>window.__golfTerrainReport=value,report);
}
