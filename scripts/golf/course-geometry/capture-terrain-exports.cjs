async page => {
  const context=await page.context().browser().newContext({viewport:{width:620,height:480},deviceScaleFactor:2,reducedMotion:'reduce'});
  const p=await context.newPage();
  for(const preset of ['top','terrain','side']) {
    await p.goto(`http://127.0.0.1:8768/?export=${preset}`);
    const canvas=p.locator('canvas[data-terrain-hash]');
    await canvas.waitFor();
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await canvas.locator('..').screenshot({path:`output/playwright/course-geometry/export-gpu-${preset}.png`,scale:'css'});
  }
  await context.close();
}
