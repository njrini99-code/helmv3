async page => {
  // COURSE selects a compiled course directory; the default remains the Cacapon pilot.
  const course=process.env.COURSE||'cacapon', dir=course==='cacapon'?'course-matrix':`course-matrix-${course}`;
  const report={course,nativeDevice:false,viewport:{width:390,height:844,devicePixelRatio:2},holes:[],errors:[],source:'One compiled source revision; real course geometry; no player positions fabricated'};
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  try {
    for(let hole=1;hole<=18;hole++) {
      const entry={hole,captures:[]};report.holes.push(entry);
      await p.goto(`http://127.0.0.1:8768/?matrix=1&course=${course}&hole=${hole}`);
      await p.getByRole('button',{name:'Expand course view'}).click();
      const dialog=p.getByRole('dialog');
      await p.waitForFunction(()=>Array.from(document.querySelectorAll('[data-slot=modal-shell]')).every(el=>+getComputedStyle(el).opacity>.999));
      for(const preset of ['Top','Terrain','Profile']) {
        await dialog.getByRole('button',{name:preset,exact:true}).click();
        if(preset==='Profile') {
          await dialog.locator('[data-slot=terrain-profile]').waitFor();
          if(await dialog.locator('canvas').count())throw new Error(`Profile retained a live canvas on ${hole}`);
        } else await p.waitForFunction(pitch=>+document.querySelector('canvas[data-terrain-state=ready]')?.dataset.terrainPitch===pitch,preset==='Top'?90:50);
        const file=`hole-${String(hole).padStart(2,'0')}-${preset.toLowerCase()}.png`;
        await p.screenshot({path:`output/playwright/course-geometry/visual-system/${dir}/${file}`});
        entry.captures.push({preset,file,canvas:preset==='Profile'?null:await dialog.locator('canvas').evaluate(e=>({...e.dataset}))});
      }
      await dialog.getByRole('button',{name:'Top',exact:true}).click();
      await dialog.getByRole('button',{name:'Choose course area',exact:true}).click();
      await dialog.getByRole('button',{name:'Green',exact:true}).click();
      await p.waitForFunction(()=>document.querySelector('[data-terrain-view-state=ready] canvas[data-terrain-state=ready]'));
      const file=`hole-${String(hole).padStart(2,'0')}-green.png`;
      await p.screenshot({path:`output/playwright/course-geometry/visual-system/${dir}/${file}`});
      entry.captures.push({preset:'Green',file,canvas:await dialog.locator('canvas').evaluate(e=>({...e.dataset}))});
      entry.quality=JSON.parse(await p.locator('[data-source-quality]').getAttribute('data-source-quality'));
      const before=await dialog.locator('canvas').getAttribute('data-render-count');await p.waitForTimeout(120);
      entry.idleStopped=before===await dialog.locator('canvas').getAttribute('data-render-count');
      if(!entry.idleStopped)throw new Error(`Idle rendering on ${hole}`);
      await dialog.getByRole('button',{name:'Close',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      await p.waitForFunction(()=>document.querySelectorAll('canvas').length===0);
      if(await p.locator('canvas').count())throw new Error(`Canvas not released on ${hole}`);
    }
    if(report.errors.length)throw new Error(JSON.stringify(report.errors));
  }finally{await context.close();await page.evaluate(report=>window.__golfCourseMatrix=report,report);}
}
