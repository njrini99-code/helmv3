/**
 * Extract ALL routes from Helm app with real metadata
 * Scans page.tsx files and builds comprehensive route registry
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HELM_APP_PATH = '/Users/ricknini/Downloads/helmv3/src/app';

// User role detection patterns
const ROLE_PATTERNS = {
  coach: {
    recruiting: /useRecruitingRouteProtection|recruiting/i,
    team: /useTeamStore|roster|team/i,
  },
  player: {
    recruiting: /recruiting_activated|journey/i,
    team: /team|roster/i,
  },
};

// Feature detection patterns
const FEATURE_PATTERNS = {
  search: /search|filter|query/i,
  comparison: /compare|comparison/i,
  watchlist: /watchlist/i,
  pipeline: /pipeline|planner/i,
  calendar: /calendar|event/i,
  messages: /message|conversation/i,
  analytics: /analytics|stats/i,
  videos: /video|upload/i,
  roster: /roster|team.*member/i,
  devPlans: /dev.*plan|development/i,
};

async function extractRouteMetadata(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(HELM_APP_PATH, filePath);

  // Convert file path to URL path
  let urlPath = '/' + relativePath
    .replace(/\/page\.tsx$/, '')
    .replace(/\(dashboard\)\//, '')
    .replace(/\(auth\)\//, '')
    .replace(/\(onboarding\)\//, '')
    .replace(/\(public\)\//, '');

  // Extract metadata
  const metadata = {
    filePath: relativePath,
    urlPath,
    title: extractTitle(content),
    description: extractDescription(content, urlPath),
    userRoles: extractUserRoles(content, urlPath),
    features: extractFeatures(content),
    domain: extractDomain(urlPath),
    type: extractType(urlPath),
    icon: extractIcon(urlPath),
    imports: extractImports(content),
    hasAuth: content.includes('useAuth'),
    hasRouteProtection: content.includes('RouteProtection'),
  };

  return metadata;
}

function extractTitle(content) {
  // Look for <Header> or <h1> with title
  const headerMatch = content.match(/<Header[^>]*title=["']([^"']+)["']/);
  if (headerMatch) return headerMatch[1];

  const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (h1Match) return h1Match[1];

  return null;
}

function extractDescription(content, urlPath) {
  // Generate description based on imports and features
  const parts = urlPath.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1];

  if (lastPart === 'discover') return 'Search and filter players with advanced criteria';
  if (lastPart === 'watchlist') return 'Manage your recruiting watchlist and pipeline';
  if (lastPart === 'pipeline') return 'Drag-and-drop recruiting pipeline management';
  if (lastPart === 'roster') return 'View and manage team roster';
  if (lastPart === 'compare') return 'Side-by-side player comparison tool';
  if (lastPart === 'analytics') return 'Recruiting analytics and insights';
  if (lastPart === 'journey') return 'Track your recruiting journey and milestones';
  if (lastPart === 'messages') return 'Send and receive messages';
  if (lastPart === 'calendar') return 'View and manage events';
  if (lastPart === 'videos') return 'Upload and manage videos';
  if (lastPart === 'dev-plans' || lastPart === 'dev-plan') return 'Create and track development plans';
  if (lastPart === 'settings') return 'Account and preferences settings';
  if (lastPart === 'profile') return 'Edit your profile information';
  if (lastPart === 'colleges') return 'Discover and research colleges';
  if (lastPart === 'camps') return 'Browse and register for camps';
  if (lastPart === 'team') return 'Team hub and information';
  if (lastPart === 'program') return 'Program profile and settings';
  if (lastPart === 'activate') return 'Activate recruiting features';

  return `${lastPart.charAt(0).toUpperCase() + lastPart.slice(1)} page`;
}

function extractUserRoles(content, urlPath) {
  const roles = [];

  // Detect from URL path
  if (urlPath.includes('/baseball/') || urlPath.includes('/golf/')) {
    if (urlPath.includes('/coach')) {
      roles.push('coach');
    }
    if (urlPath.includes('/player')) {
      roles.push('player');
    }
  }

  // Detect from hooks
  if (content.includes('useRecruitingRouteProtection')) {
    roles.push('coach-recruiting');
  }
  if (content.includes('useTeamStore')) {
    roles.push('coach-team');
  }

  // Dashboard routes - DETAILED coach type detection
  if (urlPath.includes('/dashboard/')) {
    const features = urlPath.split('/').filter(Boolean);

    // RECRUITING features (College + JUCO in recruiting mode)
    if (features.includes('discover')) {
      roles.push('college-coach', 'juco-coach-recruiting');
    }
    if (features.includes('watchlist')) {
      roles.push('college-coach', 'juco-coach-recruiting');
    }
    if (features.includes('pipeline')) {
      roles.push('college-coach', 'juco-coach-recruiting');
    }
    if (features.includes('compare') || features.includes('comparisons')) {
      roles.push('college-coach', 'juco-coach-recruiting');
    }
    if (features.includes('camps')) {
      roles.push('college-coach');
    }

    // TEAM features (HS + JUCO in team mode + Showcase)
    if (features.includes('roster')) {
      roles.push('hs-coach', 'juco-coach-team', 'showcase-coach');
    }
    if (features.includes('videos')) {
      roles.push('hs-coach', 'juco-coach-team', 'showcase-coach');
    }
    if (features.includes('dev-plans') || features.includes('dev-plan')) {
      roles.push('hs-coach', 'juco-coach-team', 'showcase-coach');
    }
    if (features.includes('college-interest')) {
      roles.push('hs-coach', 'juco-coach-team');
    }
    if (features.includes('teams')) {
      roles.push('showcase-coach');
    }
    if (features.includes('academics')) {
      roles.push('juco-coach-team');
    }

    // PLAYER features
    if (features.includes('journey')) {
      roles.push('player-recruiting');
    }
    if (features.includes('analytics')) {
      roles.push('player-recruiting');
    }
    if (features.includes('colleges')) {
      roles.push('player-recruiting');
    }
    if (features.includes('activate')) {
      roles.push('player');
    }
    if (features.includes('profile')) {
      roles.push('player');
    }
    if (features.includes('team') && !features.includes('teams')) {
      roles.push('player');
    }
  }

  return [...new Set(roles)];
}

function extractFeatures(content) {
  const features = [];

  Object.entries(FEATURE_PATTERNS).forEach(([feature, pattern]) => {
    if (pattern.test(content)) {
      features.push(feature);
    }
  });

  // Additional feature detection from imports
  if (content.includes('FilterPanel')) features.push('filtering');
  if (content.includes('DndContext')) features.push('drag-drop');
  if (content.includes('PlayerDetailModal')) features.push('modals');
  if (content.includes('PeekPanel')) features.push('preview');
  if (content.includes('useSearchParams')) features.push('url-params');

  return [...new Set(features)];
}

function extractDomain(urlPath) {
  if (urlPath.includes('/baseball')) return 'baseball';
  if (urlPath.includes('/golf')) return 'golf';
  return null;
}

function extractType(urlPath) {
  if (urlPath === '/' || urlPath === '/baseball' || urlPath === '/golf') {
    return 'entry';
  }
  if (urlPath.endsWith('/dashboard') || urlPath === '/baseball/dashboard' || urlPath === '/golf/dashboard') {
    return 'dashboard';
  }
  if (urlPath.includes('/login') || urlPath.includes('/signup')) {
    return 'auth';
  }
  if (urlPath.includes('/onboarding') || urlPath.includes('/coach-onboarding')) {
    return 'onboarding';
  }
  return 'feature';
}

function extractIcon(urlPath) {
  const path = urlPath.toLowerCase();

  if (path.includes('discover')) return '🔍';
  if (path.includes('watchlist')) return '⭐';
  if (path.includes('pipeline')) return '📊';
  if (path.includes('compare')) return '⚖️';
  if (path.includes('roster')) return '👥';
  if (path.includes('message')) return '💬';
  if (path.includes('calendar')) return '📅';
  if (path.includes('analytics')) return '📈';
  if (path.includes('journey')) return '🗺️';
  if (path.includes('video')) return '🎥';
  if (path.includes('camp')) return '⛺';
  if (path.includes('college')) return '🎓';
  if (path.includes('dev-plan')) return '📋';
  if (path.includes('settings')) return '⚙️';
  if (path.includes('profile')) return '👤';
  if (path.includes('team')) return '🏆';
  if (path.includes('program')) return '🏫';
  if (path.includes('login')) return '🔐';
  if (path.includes('signup')) return '✍️';
  if (path === '/baseball') return '⚾';
  if (path === '/golf') return '⛳';
  if (path === '/') return '🏠';

  return '📄';
}

function extractImports(content) {
  const imports = [];
  const importMatches = content.matchAll(/import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g);

  for (const match of importMatches) {
    const importPath = match[1];
    if (importPath.startsWith('@/components/')) {
      const componentName = importPath.split('/').pop();
      imports.push(componentName);
    }
  }

  return imports.slice(0, 10); // First 10 imports
}

async function scanAllRoutes() {
  const routes = [];

  // Find all page.tsx files
  const findCommand = `find ${HELM_APP_PATH} -type f -name "page.tsx"`;
  const { execSync } = await import('child_process');
  const files = execSync(findCommand).toString().trim().split('\n');

  console.log(`🔍 Found ${files.length} routes`);

  for (const file of files) {
    try {
      const metadata = await extractRouteMetadata(file);
      routes.push(metadata);
      console.log(`✓ ${metadata.urlPath}`);
    } catch (error) {
      console.error(`✗ Failed to parse ${file}:`, error.message);
    }
  }

  return routes;
}

async function generateKnowledgeFile() {
  console.log('🚀 Extracting all routes from Helm app...\n');

  const routes = await scanAllRoutes();

  console.log(`\n✅ Extracted ${routes.length} routes`);
  console.log(`📊 Breakdown:`);
  console.log(`   - Baseball: ${routes.filter(r => r.domain === 'baseball').length}`);
  console.log(`   - Golf: ${routes.filter(r => r.domain === 'golf').length}`);
  console.log(`   - Shared: ${routes.filter(r => !r.domain).length}`);

  // Write to JSON file
  const outputPath = path.join(__dirname, '../data/helm-routes-extracted.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(routes, null, 2));

  console.log(`\n💾 Saved to: ${outputPath}`);

  // Generate summary
  console.log(`\n📋 Sample routes:`);
  routes.slice(0, 10).forEach(route => {
    console.log(`   ${route.icon} ${route.urlPath}`);
    console.log(`      ${route.description}`);
    console.log(`      Roles: ${route.userRoles.join(', ') || 'public'}`);
    console.log(`      Features: ${route.features.join(', ') || 'none'}`);
    console.log('');
  });

  return routes;
}

// Run extraction
generateKnowledgeFile().catch(console.error);
