import { Page, expect } from '@playwright/test';

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}

/**
 * Wait for a specific element to be visible
 */
export async function waitForElement(page: Page, selector: string, timeout = 5000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Fill a form field with proper waiting
 */
export async function fillField(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector, { state: 'visible' });
  await page.fill(selector, value);
}

/**
 * Click a button with proper waiting
 */
export async function clickButton(page: Page, selector: string) {
  await page.waitForSelector(selector, { state: 'visible' });
  await page.click(selector);
}

/**
 * Check if an element contains specific text
 */
export async function expectTextContent(page: Page, selector: string, text: string) {
  const element = await page.waitForSelector(selector);
  const content = await element.textContent();
  expect(content).toContain(text);
}

/**
 * Take a screenshot with a descriptive name
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: true,
  });
}

/**
 * Check if element is visible
 */
export async function isVisible(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for navigation after an action
 */
export async function waitForNavigation(page: Page, url: string | RegExp) {
  if (typeof url === 'string') {
    await page.waitForURL(`**/${url}/**`);
  } else {
    await page.waitForURL(url);
  }
}

/**
 * Clear and fill input field
 */
export async function clearAndFill(page: Page, selector: string, value: string) {
  await page.fill(selector, '');
  await page.fill(selector, value);
}

/**
 * Select an option from dropdown
 */
export async function selectOption(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.selectOption(selector, value);
}

/**
 * Wait for API response
 */
export async function waitForApiResponse(page: Page, urlPattern: string | RegExp) {
  return page.waitForResponse((response) => {
    const url = response.url();
    if (typeof urlPattern === 'string') {
      return url.includes(urlPattern);
    }
    return urlPattern.test(url);
  });
}
