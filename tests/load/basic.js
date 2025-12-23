import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests must complete below 500ms
    'http_req_failed': ['rate<0.01'],   // Error rate must be less than 1%
    'errors': ['rate<0.1'],              // Custom error rate must be less than 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Test 1: Landing page
  const landingRes = http.get(`${BASE_URL}/`);
  const landingCheck = check(landingRes, {
    'landing page status is 200': (r) => r.status === 200,
    'landing page loads quickly': (r) => r.timings.duration < 1000,
  });
  errorRate.add(!landingCheck);
  sleep(1);

  // Test 2: Baseball login page
  const loginRes = http.get(`${BASE_URL}/baseball/login`);
  const loginCheck = check(loginRes, {
    'login page status is 200': (r) => r.status === 200,
    'login page loads quickly': (r) => r.timings.duration < 800,
  });
  errorRate.add(!loginCheck);
  sleep(1);

  // Test 3: Golf login page
  const golfLoginRes = http.get(`${BASE_URL}/golf/login`);
  const golfLoginCheck = check(golfLoginRes, {
    'golf login status is 200': (r) => r.status === 200,
    'golf login loads quickly': (r) => r.timings.duration < 800,
  });
  errorRate.add(!golfLoginCheck);
  sleep(1);

  // Simulate user reading the page
  sleep(2);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options = {}) {
  const indent = options.indent || '';
  const enableColors = options.enableColors !== false;

  return `
${indent}Checks............: ${data.metrics.checks.values.rate * 100}% passed
${indent}HTTP Failures.....: ${data.metrics.http_req_failed.values.rate * 100}%
${indent}HTTP Req Duration.: avg=${data.metrics.http_req_duration.values.avg}ms min=${data.metrics.http_req_duration.values.min}ms max=${data.metrics.http_req_duration.values.max}ms
${indent}HTTP Reqs.........: ${data.metrics.http_reqs.values.count}
${indent}VUs...............: min=${data.metrics.vus.values.min} max=${data.metrics.vus.values.max}
  `.trim();
}
