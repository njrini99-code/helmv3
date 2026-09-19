async page => {
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'no-preference',recordVideo:{dir:'output/playwright/course-geometry/terrain-motion',size:{width:390,height:844}}});
  const p=await context.newPage(), report={errors:[],presets:[]};
  p.on('pageerror',error=>report.errors.push(error.message));
  try {
  await p.goto('http://127.0.0.1:8768/golf/dashboard/rounds/fixture/review?hole=7');
  await p.getByRole('button',{name:'Shot 2',exact:true}).click();
  await p.locator('[data-compiled-state=ready]').waitFor({state:'attached'});
    await p.getByRole('button',{name:'Expand course view'}).click();
  const dialog=p.getByRole('dialog');
  await dialog.getByRole('button',{name:'Choose course area',exact:true}).click();
  await dialog.getByRole('button',{name:'Whole hole',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('[data-terrain-view-state=ready] canvas[data-terrain-state=ready]'));
  await p.waitForTimeout(800);
  for(const preset of ['Terrain','Side','Top']) {
    if(preset==='Side')await dialog.getByRole('button',{name:'Camera controls',exact:true}).click();
      await dialog.getByRole('button',{name:preset,exact:true}).click();
      if(preset==='Side')await dialog.getByRole('button',{name:'Camera controls',exact:true}).click();
    const expected={Terrain:50,Side:20,Top:90}[preset];
    await p.waitForFunction(pitch=>Math.abs(+document.querySelector('canvas[data-terrain-pitch]')?.dataset.terrainPitch-pitch)<.001,expected);
    if(report.errors.length)throw new Error(JSON.stringify(report.errors));
    report.presets.push({preset,pitch:expected});
    if(preset==='Top')await p.screenshot({path:'output/playwright/course-geometry/three-top-390.png'});
    await p.waitForTimeout(400);
  }
  await dialog.getByRole('button',{name:'Choose course area',exact:true}).click();
  await dialog.getByRole('button',{name:'Green',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('[data-terrain-view-state=ready] canvas[data-terrain-state=ready]'));
  await dialog.getByRole('button',{name:'Terrain',exact:true}).click();
  await p.waitForTimeout(800);
  await p.evaluate(()=>{
    window.__terrainFrames=[];window.__terrainFrameRunning=true;
    let last=performance.now();
    function sample(now){window.__terrainFrames.push(now-last);last=now;if(window.__terrainFrameRunning)requestAnimationFrame(sample);}
    requestAnimationFrame(sample);
  });
  const box=await dialog.locator('canvas').boundingBox();
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await p.mouse.down();
  for(let step=0;step<60;step++) {
    await p.mouse.move(box.x+box.width/2+Math.sin(step/10)*65,box.y+box.height/2+Math.cos(step/10)*60);
    await p.waitForTimeout(16);
  }
  await p.mouse.up();
  report.frameIntervals=await p.evaluate(()=>{window.__terrainFrameRunning=false;return window.__terrainFrames;});
  // A new gesture interrupts a preset; the old transition cannot resume.
  await dialog.getByRole('button',{name:'Top',exact:true}).click();
  await p.waitForTimeout(40);
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await p.mouse.down();
  await p.mouse.move(box.x+box.width/2+20,box.y+box.height/2+20);
  await p.mouse.up();
  const interrupted=await dialog.locator('canvas').getAttribute('data-terrain-pitch');
  await p.waitForTimeout(300);
  report.gestureInterruptsTransition=await dialog.locator('canvas').getAttribute('data-terrain-pitch')===interrupted;
  if(!report.gestureInterruptsTransition)throw new Error('Preset resumed after gesture');
  await p.mouse.down();
  await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await p.mouse.up();
  report.blurCancelsGesture=await dialog.locator('[data-slot=course-drawing]').getAttribute('data-dragging')==='false';
  if(!report.blurCancelsGesture)throw new Error('Blur retained active gesture');
  report.browser=await page.context().browser().version();
  report.environment='Desktop Chromium on Mac mini M4; RAF intervals during scripted drag, not GPU timing or phone SLO';
  await p.emulateMedia({reducedMotion:'reduce'});
  await dialog.getByRole('button',{name:'Camera controls',exact:true}).click();
  await dialog.getByRole('button',{name:'Side',exact:true}).click();
  await dialog.getByRole('button',{name:'Camera controls',exact:true}).click();
  report.reducedMotionImmediate=await dialog.locator('canvas').getAttribute('data-terrain-pitch')==='20';
  if(!report.reducedMotionImmediate) throw new Error('Reduced motion did not settle immediately');
  report.video=await p.video().path();
  if(report.errors.length)throw new Error(JSON.stringify(report.errors));
  } finally { await context.close(); }
  await page.evaluate(value=>window.__golfTerrainMotionReport=value,report);
}
