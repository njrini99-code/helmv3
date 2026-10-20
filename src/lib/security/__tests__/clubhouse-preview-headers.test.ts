import { describe, expect, it } from 'vitest';
import { clubhousePreviewHeaders } from '../clubhouse-preview-headers.mjs';

const routes = [{ source: '/:path*', headers: [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; frame-ancestors 'none';" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
] }];
describe('component gallery frame policy', () => {
  it('keeps production and test policies unchanged', () => {
    expect(clubhousePreviewHeaders(routes, 'production')).toBe(routes);
    expect(clubhousePreviewHeaders(routes, 'test')).toBe(routes);
  });
  it('permits only the exact development gallery inside same-origin frames', () => {
    const result = clubhousePreviewHeaders(routes, 'development');
    expect(result[0]).toBe(routes[0]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ source: '/clubhouse-preview/components/gallery', headers: [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; frame-ancestors 'self';" },
    ] });
    expect(routes[0]!.headers[0]!.value).toBe('DENY');
  });
});
