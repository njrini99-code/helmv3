/**
 * Next.js App Router path normalizer.
 * Converts src/app file paths to canonical customer-facing URLs.
 */

const PAGE_LEAVES = new Set(['page.tsx', 'page.ts', 'page.jsx', 'page.js']);
const ROUTE_LEAVES = new Set(['route.ts', 'route.js']);

/**
 * @param {string} filePath - repo-relative path under src/app
 * @returns {{
 *   canonicalPath: string;
 *   sourcePath: string;
 *   fileType: 'page' | 'route-handler';
 *   routeGroupSegments: string[];
 *   privateSegments: string[];
 *   dynamic: boolean;
 *   dynamicParams: string[];
 * } | null}
 */
export function normalizeAppFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized.startsWith('src/app/')) return null;

  const rel = normalized.slice('src/app/'.length);
  const parts = rel.split('/');
  const leaf = parts.pop();
  if (!leaf) return null;

  let fileType = null;
  if (PAGE_LEAVES.has(leaf)) fileType = 'page';
  else if (ROUTE_LEAVES.has(leaf)) fileType = 'route-handler';
  else return null;

  const routeGroupSegments = [];
  const privateSegments = [];
  const urlParts = [];
  const dynamicParams = [];

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('_')) {
      privateSegments.push(part);
      continue;
    }
    if (part.startsWith('(') && part.endsWith(')')) {
      routeGroupSegments.push(part);
      continue;
    }
    if (part.startsWith('@')) continue;

    if (part.startsWith('[[...') && part.endsWith(']]')) {
      const name = part.slice(5, -2);
      urlParts.push(`:${name}?`);
      dynamicParams.push(name);
      continue;
    }
    if (part.startsWith('[...') && part.endsWith(']')) {
      const name = part.slice(4, -1);
      urlParts.push(`:${name}*`);
      dynamicParams.push(name);
      continue;
    }
    if (part.startsWith('[') && part.endsWith(']')) {
      const name = part.slice(1, -1);
      urlParts.push(`:${name}`);
      dynamicParams.push(name);
      continue;
    }
    urlParts.push(part);
  }

  let canonicalPath = `/${urlParts.join('/')}`.replace(/\/+/g, '/');
  if (canonicalPath.length > 1 && canonicalPath.endsWith('/')) {
    canonicalPath = canonicalPath.slice(0, -1);
  }
  if (canonicalPath === '') canonicalPath = '/';

  return {
    canonicalPath,
    sourcePath: normalized,
    fileType,
    routeGroupSegments,
    privateSegments,
    dynamic: dynamicParams.length > 0,
    dynamicParams,
  };
}

/**
 * @param {string} canonicalPath
 */
export function classifyProduct(canonicalPath) {
  if (canonicalPath.startsWith('/golf')) return 'golf';
  if (canonicalPath.startsWith('/baseball')) return 'baseball';
  if (canonicalPath.startsWith('/api/coachhelm')) return 'coachhelm';
  if (canonicalPath.startsWith('/api')) return 'api';
  if (canonicalPath.startsWith('/admin') || canonicalPath.startsWith('/golf/admin')) return 'admin';
  return 'shared';
}

/**
 * @param {string} canonicalPath
 * @param {string[]} routeGroupSegments
 */
export function classifyArea(canonicalPath, routeGroupSegments = []) {
  const groups = routeGroupSegments.map((g) => g.toLowerCase());
  if (groups.some((g) => g.includes('auth'))) return 'auth';
  if (groups.some((g) => g.includes('onboarding'))) return 'onboarding';
  if (groups.some((g) => g.includes('dashboard') || g.includes('player-dashboard'))) return 'dashboard';
  if (groups.some((g) => g.includes('public'))) return 'public';
  if (canonicalPath.includes('/coachhelm') || canonicalPath.includes('/intelligence')) return 'coachhelm';
  if (canonicalPath.includes('/stats')) return 'stats';
  if (canonicalPath.includes('/rounds')) return 'rounds';
  if (canonicalPath.includes('/recruiting')) return 'recruiting';
  if (canonicalPath.includes('/admin')) return 'admin';
  if (canonicalPath.startsWith('/api')) return 'api';
  if (canonicalPath === '/' || /^\/(about|help|products|privacy|terms|support|splash)/.test(canonicalPath)) {
    return 'public';
  }
  return 'unknown';
}

/**
 * @param {string} canonicalPath
 * @param {string} area
 */
export function classifyRole(canonicalPath, area) {
  if (area === 'public' || area === 'auth' || area === 'onboarding') return 'public';
  if (canonicalPath.includes('/player/') || canonicalPath.includes('/my-')) return 'player';
  if (canonicalPath.includes('/coach') || canonicalPath.includes('/dashboard')) return 'coach';
  if (canonicalPath.startsWith('/admin') || canonicalPath.includes('/admin')) return 'admin';
  return 'unknown';
}

/**
 * @param {string} area
 * @param {boolean} dynamic
 */
export function classifyAuthExpectation(area, dynamic) {
  if (area === 'public' || area === 'auth' || area === 'onboarding') return 'public';
  if (area === 'dashboard' || area === 'coachhelm' || area === 'stats' || area === 'rounds') {
    return 'protected';
  }
  if (dynamic && area === 'unknown') return 'unknown';
  return 'unknown';
}

/**
 * Match a static href against inventory canonical paths (supports :param patterns).
 * @param {string} href
 * @param {Set<string>} staticRoutes
 * @param {Array<{ canonicalPath: string }>} dynamicRoutes
 */
export function routeExistsInInventory(href, staticRoutes, dynamicRoutes) {
  const path = href.split('?')[0]?.split('#')[0] ?? href;
  if (staticRoutes.has(path)) return true;
  for (const row of dynamicRoutes) {
    const pattern = row.canonicalPath
      .replace(/:[^/]+\?/g, '(?:/[^/]+)?')
      .replace(/:[^/]+\*/g, '(?:/[^/]+)*')
      .replace(/:[^/]+/g, '[^/]+');
    const re = new RegExp(`^${pattern}$`);
    if (re.test(path)) return true;
  }
  return false;
}
