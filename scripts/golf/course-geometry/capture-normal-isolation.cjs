async page => {
  const report={passes:[],errors:[],positionsChanged:false,variable:'normal buffer only; source DEM and frozen camera unchanged'};
  const context=await page.context().browser().newContext({viewport:{width:388,height:699},deviceScaleFactor:2,reducedMotion:'reduce'});
  const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  try {
    for(const normals of ['legacy','source']) for(const mode of ['lit-no-shadows','normals','wireframe-elevation']) {
      await p.goto(`http://127.0.0.1:8768/?export=terrain&debug=${mode}&normals=${normals}`);
      await p.waitForFunction(()=>document.querySelector('[data-terrain-view-state=ready] canvas[data-terrain-state=ready]'));
      await p.screenshot({path:`output/playwright/course-geometry/visual-system/normal-isolation/${normals}-${mode}.png`});
      report.passes.push({mode,normals,canvas:await p.locator('canvas').evaluate(e=>({...e.dataset}))});
    }
    if(report.errors.length)throw new Error(JSON.stringify(report.errors));
  }finally{await context.close();}
  await page.evaluate(report=>window.__golfNormalReport=report,report);
}
