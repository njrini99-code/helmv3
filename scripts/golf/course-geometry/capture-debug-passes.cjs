async page => {
  const report={passes:[],errors:[],ao:'not implemented',skirts:'none'};
  const context=await page.context().browser().newContext({viewport:{width:388,height:699},deviceScaleFactor:2,reducedMotion:'reduce'});
  const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  try {
    for(const mode of ['final','unlit','wireframe-elevation','normals','lit-no-shadows','feature-ids','shadows','crop']) {
      await p.goto(`http://127.0.0.1:8768/?export=terrain&debug=${mode}`);
      await p.waitForFunction(()=>document.querySelector('[data-terrain-view-state=ready] canvas[data-terrain-state=ready]'));
      await p.screenshot({path:`output/playwright/course-geometry/visual-system/debug-before/${mode}.png`});
      report.passes.push({mode,canvas:await p.locator('canvas').evaluate(e=>({...e.dataset}))});
    }
    if(report.errors.length)throw new Error(JSON.stringify(report.errors));
  }finally{await context.close();}
  await page.evaluate(report=>window.__golfDebugReport=report,report);
}
