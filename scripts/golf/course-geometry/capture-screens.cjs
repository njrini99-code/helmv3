async page => {
  const browser = page.context().browser();
  const report = { viewports: [], interactions: {}, errors: [] };
  for (const [width, height] of [[375,812], [390,844], [430,932], [320,568]]) {
    const context = await browser.newContext({ viewport: {width,height}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const screen = await context.newPage();
    screen.on('pageerror', error => report.errors.push(error.message));
    await screen.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:8768/') ? route.continue() : route.abort());
    for (const scenario of ['tee','approach','around','putting','ambiguous','missing','penalty']) {
      await screen.goto(`http://127.0.0.1:8768/golf/dashboard/rounds/continue/fixture?case=${scenario}`);
      await screen.locator('[data-slot=course-drawing]').waitFor();
      await screen.evaluate(() => document.fonts.ready);
      await screen.waitForFunction(() => document.querySelector('[data-slot=course-drawing]')?.clientHeight === 160);
      await screen.evaluate(() => scrollTo(0,0));
      await screen.screenshot({path:`output/playwright/course-geometry/entry-${scenario}-${width}.png`});
      const metrics = await screen.evaluate(() => {
        const box = selector => { const r=document.querySelector(selector).getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,bottom:r.bottom}; };
        return {drawing:box('[data-slot=course-drawing]'),header:box('[data-slot=scene-header]'),hero:box('section[aria-label="Current shot context"]'),view:document.querySelector('[data-current-view]').getAttribute('data-current-view'),horizontalOverflow:document.documentElement.scrollWidth > innerWidth,
          innerVerticalScroll: Array.from(document.querySelectorAll('#main-content *')).filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1).map(el=>el.getAttribute('data-slot')||el.tagName)};
      });
      if (metrics.drawing.height !== 160 || metrics.horizontalOverflow || metrics.innerVerticalScroll.length) throw new Error(`Entry layout ${scenario}/${width}: ${JSON.stringify(metrics)}`);
      report.viewports.push({width,height,scenario,...metrics});
    }
    await screen.goto('http://127.0.0.1:8768/golf/dashboard/rounds/fixture/review?hole=7');
    await screen.getByRole('group',{name:'Recorded shots',exact:true}).waitFor();
    await screen.evaluate(() => document.fonts.ready);
    await screen.screenshot({path:`output/playwright/course-geometry/review-summary-${width}.png`});
    await screen.getByRole('button',{name:'Shot 2',exact:true}).click();
    await screen.locator('[data-scene-context=review]').evaluate(el=>scrollTo(0,scrollY+el.getBoundingClientRect().top-72));
    await screen.screenshot({path:`output/playwright/course-geometry/review-green-${width}.png`});
    const drawing = await screen.locator('[data-slot=course-drawing]').boundingBox();
    if (drawing.height !== 310) throw new Error('Review viewport is not bounded');
    report.viewports.push({width,height,scenario:'review',drawing,viewportCount:await screen.locator('[data-slot=course-drawing]').count()});
    await screen.getByRole('button',{name:'Shot 4',exact:true}).click();
    await screen.locator('[data-scene-context=review]').evaluate(el=>scrollTo(0,scrollY+el.getBoundingClientRect().top-72));
    await screen.screenshot({path:`output/playwright/course-geometry/review-putting-${width}.png`});
    if (width===390) {
      await screen.goto('http://127.0.0.1:8768/golf/dashboard/rounds/continue/fixture?case=around');
      await screen.getByRole('radio',{name:'Green (not fringe)'}).click();
      const input=screen.getByRole('spinbutton',{name:'Proximity to hole in feet'});
      const camera=()=>screen.locator('[data-slot=course-drawing] svg').evaluate(el=>({scale:el.getAttribute('data-scale'),angle:el.getAttribute('data-angle'),view:el.getAttribute('data-view')}));
      const before=await camera();
      await input.fill('12');
      if (JSON.stringify(await camera())!==JSON.stringify(before)) throw new Error('Camera changed while typing');
      await screen.getByRole('button',{name:'Expand course view'}).click();
      await screen.getByRole('dialog').waitFor();
      await screen.screenshot({path:'output/playwright/course-geometry/entry-expanded-390.png'});
      await screen.getByRole('button',{name:'Zoom in',exact:true}).click();
      await screen.getByRole('button',{name:'Reset view',exact:true}).click();
      await screen.keyboard.press('Escape');
      await screen.getByRole('dialog').waitFor({state:'hidden'});
      if (await input.inputValue()!=='12') throw new Error('Expand lost unsaved distance');
      if (JSON.stringify(await camera())!==JSON.stringify(before)) throw new Error('Expand changed inline camera');
      const restoredFocus=await screen.getByRole('button',{name:'Expand course view'}).evaluate(el=>el===document.activeElement);
      if (!restoredFocus) throw new Error('Expand failed to restore focus');
      report.interactions={cameraStable:true,unsavedDistancePreserved:true,focusRestored:true};
      await input.focus();
      await screen.screenshot({path:'output/playwright/course-geometry/entry-distance-focused-390.png'});
      await screen.getByRole('button',{name:'Next shot',exact:false}).click();
      await screen.getByRole('heading',{name:'Shot 4 · Putting'}).waitFor();
      report.interactions.committedShot=true;
      const saved=await screen.locator('[data-fixture-ledger]').getAttribute('data-fixture-ledger');
      report.interactions.saved=JSON.parse(saved).map(e=>({number:e.shotNumber,result:e.result,before:e.before.originalValue,beforeUnit:e.before.originalUnit,after:e.after.originalValue,afterUnit:e.after.originalUnit}));
    }
    await context.close();
  }
  if(report.errors.length) throw new Error(JSON.stringify(report.errors));
  await page.evaluate(report => window.__golfSceneReport=report,report);
}
