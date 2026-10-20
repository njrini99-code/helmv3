/** Permit only the local component gallery to appear in same-origin frames. */
export function clubhousePreviewHeaders(routes, environment) {
  if (environment !== 'development') return routes;
  const security = routes.find(route => route.source === '/:path*');
  if (!security) throw new Error('Missing shared security headers');
  const headers = security.headers.filter(header =>
    ['X-Frame-Options', 'Content-Security-Policy'].includes(header.key)
  ).map(header => ({
    ...header,
    value: header.key === 'X-Frame-Options' ? 'SAMEORIGIN'
      : header.value.replace("frame-ancestors 'none';", "frame-ancestors 'self';"),
  }));
  return [...routes, { source: '/clubhouse-preview/components/gallery', headers }];
}
