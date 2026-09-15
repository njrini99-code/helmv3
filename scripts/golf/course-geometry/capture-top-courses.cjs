async page => {
  const report={courses:[],errors:[],nativeKeyboardVerified:false};
  for(const course of ['cacapon','winchester']) {
    const context=await page.context().browser().newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const p=await context.newPage();
    p.on('pageerror',e=>report.errors.push(e.message));
    await p.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8768/')?r.continue():r.abort());
    await p.goto(`http://127.0.0.1:8768/review?course=${course}&hole=7`);
    await p.getByRole('button',{name:'Shot 2',exact:true}).click();
    await p.screenshot({path:`output/playwright/course-geometry/${course}-review-green.png`});
    await p.getByRole('button',{name:'Expand course view'}).click();
    const dialog=p.getByRole('dialog');
    await dialog.getByRole('button',{name:'Whole hole',exact:true}).click();
    await dialog.getByRole('button',{name:'Terrain',exact:true}).click();
    await p.waitForFunction(()=>+document.querySelector('canvas[data-terrain-pitch]').dataset.terrainPitch===50);
    await p.waitForFunction(()=>Array.from(document.querySelectorAll('[data-slot=modal-shell]')).every(el=>+getComputedStyle(el).opacity>.999));
    await p.screenshot({path:`output/playwright/course-geometry/${course}-terrain.png`});
    const triangles=+(await dialog.locator('canvas').getAttribute('data-terrain-triangles'));
    await p.goto(`http://127.0.0.1:8768/entry?course=${course}&case=around`);
    const before=await p.locator('[data-fixture-ledger]').getAttribute('data-fixture-ledger');
    await p.getByRole('radio',{name:'Green (not fringe)'}).click();
    const distance=p.getByRole('spinbutton',{name:'Proximity to hole in feet'});
    await distance.fill('12');
    await p.getByRole('button',{name:'Expand course view'}).click();
    await p.keyboard.press('Escape');
    if(await distance.inputValue()!=='12'||await p.locator('[data-fixture-ledger]').getAttribute('data-fixture-ledger')!==before) throw new Error('Course switch proof lost original/pending input');
    await p.screenshot({path:`output/playwright/course-geometry/${course}-entry.png`});
    report.courses.push({course,triangles,preservedPendingFeet:12,ledgerUnchanged:true});
    await context.close();
  }
  for(const course of ['bryan','cardinal']) {
    const context=await page.context().browser().newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
    const p=await context.newPage();
    p.on('pageerror',e=>report.errors.push(e.message));
    await p.goto(`http://127.0.0.1:8768/?study=${course}`);
    await p.getByRole('img',{name:/Unassigned green complex/}).waitFor();
    if(await p.getByRole('button',{name:'Hole',exact:true}).count())throw new Error('Unassigned study exposed whole-hole routing');
    await p.screenshot({path:`output/playwright/course-geometry/${course}-source-study.png`});
    report.courses.push({course,kind:'unassigned_green_study',terrainAvailable:false});
    await context.close();
  }
  if(report.errors.length)throw new Error(JSON.stringify(report.errors));
  await page.evaluate(r=>localStorage.setItem('golf-top-course-qa',JSON.stringify(r)),report);
  console.log(JSON.stringify(report));
}
