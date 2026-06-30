import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

const baseUrl = __ENV.STAGING_BASE_URL || 'http://localhost:3000';

export default function () {
  for (const path of ['/', '/golf', '/baseball']) {
    const res = http.get(`${baseUrl}${path}`);
    check(res, {
      [`${path} returns non-5xx`]: (r) => r.status < 500,
    });
  }
  sleep(1);
}
