async page => {
  const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await context.newPage(), errors = [];
  p.on('pageerror', error => errors.push(error.message));
  try {
    // A plain same-origin document has no existing React scene/context.
    await p.goto('http://127.0.0.1:8768/robots.txt');
    const report = await p.evaluate(async () => {
      document.body.replaceChildren();
      const fixture = await import('/runtime-lifecycle.ts');
      return fixture.verifyRuntimeReplacement();
    });
    if (errors.length) throw new Error(JSON.stringify(errors));
    await page.evaluate(report => { window.__golfRuntimeReplacement = report; }, { ...report, errors });
  } finally { await context.close(); }
}
