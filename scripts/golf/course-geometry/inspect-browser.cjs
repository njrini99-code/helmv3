async page => {
  await page.goto('http://127.0.0.1:8768/golf/dashboard/rounds/continue/fixture?case=around');
  await page.locator('[data-slot=course-drawing] svg').waitFor();
  console.log(await page.locator('[data-slot=course-drawing]').boundingBox());
  console.log(await page.locator('section[aria-label="Current shot context"]').boundingBox());
  await page.getByRole('radio', { name: 'Green (not fringe)' }).click();
  console.log(await page.locator('input').evaluateAll(inputs => inputs.map(el=>({label:el.getAttribute('aria-label'),type:el.type}))));
}
