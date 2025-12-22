# E2E Tests Documentation

This directory contains end-to-end tests for the Helm Sports Labs baseball recruiting platform using Playwright.

## Setup

### Install Dependencies

```bash
npm install
```

### Install Playwright Browsers

```bash
npx playwright install
```

## Running Tests

### Run All Tests

```bash
npm run test:e2e
```

### Run Tests in UI Mode (Interactive)

```bash
npm run test:e2e:ui
```

### Run Tests in Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Run Specific Test File

```bash
npx playwright test e2e/auth.spec.ts
```

### Run Tests in Debug Mode

```bash
npx playwright test --debug
```

## Test Structure

### Test Files

- **`auth.spec.ts`** - Authentication flows (login, logout, session persistence)
- **`discover.spec.ts`** - Player discovery and filtering
- **`watchlist.spec.ts`** - Watchlist and pipeline management
- **`messages.spec.ts`** - Messaging functionality
- **`player-profile.spec.ts`** - Player profile viewing and interactions

### Helper Files

- **`helpers/auth.ts`** - Authentication helper functions
- **`helpers/common.ts`** - Common test utilities

## Test Data

Tests use pre-configured test users:

```typescript
{
  coach: {
    email: 'testcoach@helm.test',
    password: 'TestCoach123!',
  },
  player: {
    email: 'testplayer@helm.test',
    password: 'TestPlayer123!',
  },
}
```

**Important:** These users must exist in your test database for tests to pass.

## CI/CD Integration

### GitHub Actions

Add to `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Viewing Test Reports

After running tests, view the HTML report:

```bash
npx playwright show-report
```

## Writing New Tests

### Test Structure Example

```typescript
import { test, expect } from '@playwright/test';
import { loginAsCoach } from './helpers/auth';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
  });

  test('should do something', async ({ page }) => {
    await page.goto('/path');
    await expect(page.locator('selector')).toBeVisible();
  });
});
```

### Best Practices

1. **Use Data Test IDs**: Prefer `[data-testid="..."]` selectors for stability
2. **Wait for Elements**: Always wait for elements to be visible before interacting
3. **Avoid Hardcoded Waits**: Use `waitForSelector` instead of `waitForTimeout` when possible
4. **Clean State**: Each test should be independent and not rely on previous tests
5. **Descriptive Names**: Test names should clearly describe what they're testing

## Debugging Failed Tests

### Screenshots

Failed tests automatically save screenshots to `test-results/`

### Trace Viewer

View traces for failed tests:

```bash
npx playwright show-trace test-results/.../trace.zip
```

### VS Code Extension

Install the Playwright VS Code extension for:
- Running tests from editor
- Debugging with breakpoints
- Test generation

## Configuration

Edit `playwright.config.ts` to customize:
- Test timeout
- Number of retries
- Browsers to test
- Base URL
- Reporter options

## Common Issues

### Tests timing out

Increase timeout in `playwright.config.ts`:

```typescript
use: {
  actionTimeout: 10000, // 10 seconds
}
```

### Element not found

Ensure you're waiting for page load:

```typescript
await page.waitForLoadState('networkidle');
```

### Tests pass locally but fail in CI

- Check browser versions
- Ensure database is seeded with test data
- Verify environment variables

## Test Coverage

Current test coverage includes:
- ✅ Authentication (login, logout, protected routes)
- ✅ Player discovery and filtering
- ✅ Watchlist management
- ✅ Messaging
- ✅ Player profile viewing

## Future Test Areas

- [ ] Player signup and onboarding
- [ ] Video upload and playback
- [ ] Camp registration
- [ ] Compare players feature
- [ ] Mobile responsive views
- [ ] Accessibility (a11y) tests
