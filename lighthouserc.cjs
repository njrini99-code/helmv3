/**
 * Lighthouse CI configuration — helmv3.
 *
 * Wired into CircleCI's `lighthouse-preview` job which:
 *   1. Polls the Vercel API for the current PR's preview URL until ready
 *      (.circleci/scripts/wait-for-vercel-preview.sh)
 *   2. Runs `lhci autorun --config=lighthouserc.cjs`
 *
 * Run locally against any URL:
 *   PREVIEW_URL=https://your-preview.vercel.app npx lhci autorun \
 *     --config=lighthouserc.cjs
 *
 * Asserts are split: a11y + CLS are HARD ERRORS (user-visible failures
 * worth blocking on). Perf/best-practices/SEO are WARNINGS so a one-off
 * regression doesn't block deploy — investigate via the artifact.
 */

const baseUrl = process.env.PREVIEW_URL || 'http://localhost:3000';

/** Routes to audit. Cover one of each major template:
 *    - landing/marketing  (LCP-sensitive, SEO)
 *    - golf player login  (smallest auth screen — cold path)
 *    - golf signup        (form complexity / a11y)
 *    - baseball login     (parallel surface)
 *
 *  Add a dashboard route once we have a synthetic logged-in fixture
 *  flow (today auth blocks these from Lighthouse).
 */
const urls = [
  `${baseUrl}/`,
  `${baseUrl}/golf/login`,
  `${baseUrl}/golf/signup`,
  `${baseUrl}/baseball/login`,
];

module.exports = {
  ci: {
    collect: {
      url: urls,
      numberOfRuns: 3, // Three runs per URL; lhci uses the median.
      settings: {
        // Throttling profile that approximates a real 4G mobile user
        // on a mid-range Android. Default is "simulated" 3G — way too
        // pessimistic for our actual audience.
        throttlingMethod: 'devtools',
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
        // Treat Capacitor WKWebView like Mobile Safari.
        emulatedUserAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
          'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    },
    assert: {
      assertions: {
        // Category scores
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],

        // Core Web Vitals (hard for the user-visible ones)
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        'interaction-to-next-paint': ['warn', { maxNumericValue: 200 }],

        // Skip the SEO description audit on auth routes — login/signup
        // pages don't need OG descriptions. Re-evaluate per route if
        // SEO becomes a problem.
        'meta-description': 'off',
      },
    },
    upload: {
      // `temporary-public-storage` posts results to lhci's hosted
      // viewer and prints the URL in the job log. Switch to a
      // self-hosted @lhci/server later if we want historical trending.
      target: 'temporary-public-storage',
    },
  },
};
