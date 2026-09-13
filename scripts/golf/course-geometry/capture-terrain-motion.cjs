async page => {
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'no-preference',recordVideo:{dir:'output/playwright/course-geometry/terrain-motion',size:{width:390,height:844}}});
  const p=await context.newPage(), report={};
  await p.goto('http://127.0.0.1:8768/golf/dashboard/rounds/fixture/review?hole=7');
  await p.getByRole('button',{name:'Shot 2',exact:true}).click();
  await p.getByRole('button',{name:'Expand course view'}).click();
  const dialog=p.getByRole('dialog');
  await dialog.getByRole('button',{name:'Whole hole',exact:true}).click();
  await p.waitForTimeout(800);
  for(const preset of ['Terrain','Side','Top']) {
    await dialog.getByRole('button',{name:preset,exact:true}).click();
    await p.waitForTimeout(750);
  }
  await dialog.getByRole('button',{name:'Green',exact:true}).click();
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
  report.environment='Desktop Chromium on Mac mini M4; RAF intervals during scripted drag, not GPU timing or phone SLO';
  await p.emulateMedia({reducedMotion:'reduce'});
  await dialog.getByRole('button',{name:'Side',exact:true}).click();
  report.reducedMotionImmediate=await dialog.locator('canvas').getAttribute('data-terrain-pitch')==='20';
  if(!report.reducedMotionImmediate) throw new Error('Reduced motion did not settle immediately');
  report.video=await p.video().path();
  await context.close();
  await page.evaluate(value=>window.__golfTerrainMotionReport=value,report);
  await page.evaluate(value=>localStorage.setItem('golf-geometry-qa-motion',JSON.stringify(value)),report);
}
