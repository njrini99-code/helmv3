/**
 * Generate complete helm-knowledge.js from extracted routes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read extracted routes
const routesPath = path.join(__dirname, '../data/helm-routes-extracted.json');
const routes = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));

console.log(`📦 Processing ${routes.length} routes...\n`);

// Generate unique IDs
function generateNodeId(urlPath) {
  return urlPath
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/\[id\]/g, 'id')
    || 'home';
}

// Compact Waterfall/Family Tree Layout Algorithm
function calculatePosition(route, index, allRoutes) {
  const domain = route.domain;
  const type = route.type;

  // COMPACT spacing for waterfall effect
  const HORIZONTAL_SPACING = 180;
  const VERTICAL_SPACING = 120;
  const COLUMN_WIDTH = 160;

  // ROOT: Home at top center
  if (type === 'entry' && !domain) {
    return { x: 900, y: 50 };
  }

  // LEVEL 1: Sport entry points (Baseball/Golf) - directly below home
  if (type === 'entry' && domain) {
    if (domain === 'baseball') return { x: 500, y: 200 };
    if (domain === 'golf') return { x: 1300, y: 200 };
  }

  // LEVEL 2: Auth pages (login, signup, onboarding) - cascading below sports
  if (type === 'auth' || type === 'onboarding') {
    const baseX = domain === 'baseball' ? 200 : 1050;
    const authPages = allRoutes.filter(r =>
      (r.type === 'auth' || r.type === 'onboarding') && r.domain === domain
    );
    const myIndex = authPages.findIndex(r => r.urlPath === route.urlPath);
    return {
      x: baseX + (myIndex * COLUMN_WIDTH),
      y: 350
    };
  }

  // LEVEL 3: Dashboard - centered under auth flow
  if (type === 'dashboard') {
    const baseX = domain === 'baseball' ? 500 : 1300;
    return { x: baseX, y: 500 };
  }

  // LEVEL 4: Feature pages - compact grid cascading down
  if (type === 'feature') {
    const features = allRoutes.filter(r =>
      r.type === 'feature' && r.domain === domain
    );
    const myIndex = features.findIndex(r => r.urlPath === route.urlPath);

    const COLUMNS = 5;  // More columns for compactness
    const col = myIndex % COLUMNS;
    const row = Math.floor(myIndex / COLUMNS);

    const baseX = domain === 'baseball' ? 100 : 900;

    return {
      x: baseX + (col * HORIZONTAL_SPACING),
      y: 650 + (row * VERTICAL_SPACING)
    };
  }

  // Fallback
  return { x: 100 + (index * 150), y: 50 };
}

// Generate nodes
const nodes = routes.map((route, index) => {
  const id = generateNodeId(route.urlPath);
  const pos = calculatePosition(route, index, routes);

  return {
    id,
    label: route.title?.replace(/\s+/g, ' ').trim().slice(0, 30) ||
           route.urlPath.split('/').pop()?.replace(/-/g, ' ') ||
           'Home',
    path: route.urlPath,
    icon: route.icon,
    type: route.type,
    domain: route.domain,
    x: pos.x,
    y: pos.y,
    // Additional metadata
    userRoles: route.userRoles,
    features: route.features,
    description: route.description,
    imports: route.imports,
  };
});

console.log(`✅ Generated ${nodes.length} nodes`);

// Generate edges (connections between routes)
const edges = [];

// Connect entry points
edges.push({ from: 'home', to: 'baseball', label: 'Select Baseball' });
edges.push({ from: 'home', to: 'golf', label: 'Select Golf' });

// Connect baseball auth flows
edges.push({ from: 'baseball', to: 'baseball-login', label: 'Login' });
edges.push({ from: 'baseball', to: 'baseball-signup', label: 'Sign Up' });
edges.push({ from: 'baseball-login', to: 'baseball-dashboard', label: 'Authenticate' });
edges.push({ from: 'baseball-signup', to: 'baseball-coach-onboarding', label: 'Coach Onboarding' });
edges.push({ from: 'baseball-signup', to: 'baseball-player', label: 'Player Onboarding' });

// Connect baseball dashboard features with coach type labels
const baseballDashboardFeatures = [
  'baseball-dashboard-discover',
  'baseball-dashboard-watchlist',
  'baseball-dashboard-pipeline',
  'baseball-dashboard-compare',
  'baseball-dashboard-camps',
  'baseball-dashboard-messages',
  'baseball-dashboard-roster',
  'baseball-dashboard-videos',
  'baseball-dashboard-dev-plans',
  'baseball-dashboard-analytics',
  'baseball-dashboard-journey',
  'baseball-dashboard-colleges',
  'baseball-dashboard-profile',
  'baseball-dashboard-settings',
];

baseballDashboardFeatures.forEach(featureId => {
  const node = nodes.find(n => n.id === featureId);
  if (node) {
    // Get route info to determine coach types
    const route = routes.find(r => generateNodeId(r.urlPath) === featureId);
    if (route) {
      const coachTypes = extractCoachTypes(route);
      const playerTypes = extractPlayerTypes(route);

      let label = 'Navigate';

      if (coachTypes.length > 0 && playerTypes.length > 0) {
        label = [...coachTypes, ...playerTypes].join(', ');
      } else if (coachTypes.length > 0) {
        label = coachTypes.join(', ');
      } else if (playerTypes.length > 0) {
        label = playerTypes.join(', ');
      }

      edges.push({ from: 'baseball-dashboard', to: featureId, label });
    } else {
      edges.push({ from: 'baseball-dashboard', to: featureId, label: 'Navigate' });
    }
  }
});

// Connect golf auth flows
edges.push({ from: 'golf', to: 'golf-login', label: 'Login' });
edges.push({ from: 'golf', to: 'golf-signup', label: 'Sign Up' });
edges.push({ from: 'golf-login', to: 'golf-dashboard', label: 'Authenticate' });
edges.push({ from: 'golf-signup', to: 'golf-coach', label: 'Coach Onboarding' });
edges.push({ from: 'golf-signup', to: 'golf-player', label: 'Player Onboarding' });

// Connect golf dashboard features with coach type labels
const golfDashboardFeatures = [
  'golf-dashboard-roster',
  'golf-dashboard-rounds',
  'golf-dashboard-stats',
  'golf-dashboard-qualifiers',
  'golf-dashboard-classes',
  'golf-dashboard-messages',
  'golf-dashboard-calendar',
  'golf-dashboard-team',
  'golf-dashboard-settings',
];

golfDashboardFeatures.forEach(featureId => {
  const node = nodes.find(n => n.id === featureId);
  if (node) {
    // Get route info to determine coach types
    const route = routes.find(r => generateNodeId(r.urlPath) === featureId);
    if (route) {
      const coachTypes = extractCoachTypes(route);
      const playerTypes = extractPlayerTypes(route);

      let label = 'Navigate';

      if (coachTypes.length > 0 && playerTypes.length > 0) {
        label = [...coachTypes, ...playerTypes].join(', ');
      } else if (coachTypes.length > 0) {
        label = coachTypes.join(', ');
      } else if (playerTypes.length > 0) {
        label = playerTypes.join(', ');
      }

      edges.push({ from: 'golf-dashboard', to: featureId, label });
    } else {
      edges.push({ from: 'golf-dashboard', to: featureId, label: 'Navigate' });
    }
  }
});

console.log(`✅ Generated ${edges.length} edges`);

// Generate routeInfo (detailed metadata for each route)
const routeInfo = {};

routes.forEach(route => {
  const id = generateNodeId(route.urlPath);

  routeInfo[id] = {
    description: route.description,
    userRoles: route.userRoles.length > 0 ? route.userRoles : ['public'],
    features: route.features,
    userJourneys: generateUserJourneys(route),
    coachTypes: extractCoachTypes(route),
    playerTypes: extractPlayerTypes(route),
    keyComponents: route.imports.slice(0, 5),
  };
});

function generateUserJourneys(route) {
  const journeys = [];

  if (route.type === 'entry') {
    journeys.push('New visitor selecting sport');
    journeys.push('Returning user navigating to sport');
  }

  if (route.type === 'auth') {
    journeys.push('User logging in or signing up');
  }

  if (route.type === 'dashboard') {
    journeys.push('User viewing dashboard overview');
    journeys.push('User accessing main features');
  }

  if (route.features.includes('search')) {
    journeys.push('User searching for content');
  }

  if (route.features.includes('filtering')) {
    journeys.push('User filtering results with criteria');
  }

  if (route.features.includes('comparison')) {
    journeys.push('User comparing multiple items');
  }

  if (route.features.includes('watchlist')) {
    journeys.push('Coach managing recruiting watchlist');
  }

  if (route.features.includes('pipeline')) {
    journeys.push('Coach organizing recruiting pipeline');
  }

  if (route.features.includes('roster')) {
    journeys.push('Coach viewing team roster');
    journeys.push('Coach adding/removing players');
  }

  if (journeys.length === 0) {
    journeys.push(`User viewing ${route.description.toLowerCase()}`);
  }

  return journeys;
}

function extractCoachTypes(route) {
  const coaches = [];

  // Specific coach type detection (detailed roles)
  if (route.userRoles.includes('college-coach')) {
    coaches.push('College Coach');
  }
  if (route.userRoles.includes('hs-coach')) {
    coaches.push('High School Coach');
  }
  if (route.userRoles.includes('juco-coach-recruiting')) {
    coaches.push('JUCO Coach (Recruiting Mode)');
  }
  if (route.userRoles.includes('juco-coach-team')) {
    coaches.push('JUCO Coach (Team Mode)');
  }
  if (route.userRoles.includes('showcase-coach')) {
    coaches.push('Showcase Coach');
  }

  // Fallback generic roles
  if (route.userRoles.includes('coach-recruiting') && coaches.length === 0) {
    coaches.push('College Coach', 'JUCO Coach (Recruiting Mode)');
  }
  if (route.userRoles.includes('coach-team') && coaches.length === 0) {
    coaches.push('High School Coach', 'JUCO Coach (Team Mode)', 'Showcase Coach');
  }
  if (route.userRoles.includes('coach') && coaches.length === 0) {
    coaches.push('All Coaches');
  }

  return [...new Set(coaches)];
}

function extractPlayerTypes(route) {
  const players = [];

  if (route.userRoles.includes('player-recruiting')) {
    players.push('HS Player (Recruiting Active)');
    players.push('Showcase Player (Recruiting Active)');
    players.push('JUCO Player (Recruiting Active)');
  }

  if (route.userRoles.includes('player')) {
    players.push('All Players');
  }

  return [...new Set(players)];
}

console.log(`✅ Generated routeInfo for ${Object.keys(routeInfo).length} routes`);

// Generate the final helm-knowledge.js file
const outputTemplate = `/**
 * Helm Sports Labs - Complete Knowledge Base
 *
 * REAL DATA extracted from actual Helm app
 * Generated: ${new Date().toISOString()}
 * Routes: ${routes.length}
 */

export const HelmKnowledge = {
  flowGraph: {
    // All ${nodes.length} routes from Helm app
    nodes: ${JSON.stringify(nodes, null, 6)},

    // ${edges.length} connections between routes
    edges: ${JSON.stringify(edges, null, 6)},

    // Detailed metadata for each route
    routeInfo: ${JSON.stringify(routeInfo, null, 6)},
  },

  // Helper methods
  getFlowGraph() {
    return this.flowGraph;
  },

  getRouteContext(routePath) {
    // Find node by path
    const node = this.flowGraph.nodes.find(n => n.path === routePath);
    if (!node) return null;

    // Get routeInfo
    const info = this.flowGraph.routeInfo[node.id];
    if (!info) return null;

    return {
      ...info,
      node,
    };
  },

  getRouteDomain(routePath) {
    const node = this.flowGraph.nodes.find(n => n.path === routePath);
    return node?.domain || null;
  },

  getDomain(domainName) {
    return {
      nodes: this.flowGraph.nodes.filter(n => n.domain === domainName),
      edges: this.flowGraph.edges.filter(e => {
        const fromNode = this.flowGraph.nodes.find(n => n.id === e.from);
        const toNode = this.flowGraph.nodes.find(n => n.id === e.to);
        return fromNode?.domain === domainName || toNode?.domain === domainName;
      }),
    };
  },

  getDesignSystem() {
    return {
      colors: {
        background: '#FAF6F1',
        surface: '#FFFFFF',
        accent: '#16A34A',
        success: '#16A34A',
        error: '#DC2626',
        text: {
          primary: '#0F172A',
          secondary: '#475569',
          muted: '#94A3B8',
        },
      },
      spacing: {
        rules: [
          'Use Tailwind spacing scale (p-1, p-2, p-4, p-6, p-8)',
          'Card padding: p-6 minimum',
          'Section spacing: space-y-8',
          'Component gaps: gap-4',
        ],
      },
      borderRadius: {
        input: 'rounded-lg (12px)',
        button: 'rounded-lg (12px)',
        card: 'rounded-2xl (16px)',
        modal: 'rounded-3xl (24px)',
      },
      glass: {
        when: 'Modals, floating panels, popovers',
        notWhen: 'Main content, cards, forms',
      },
      typography: {
        fontFamily: 'Inter, system-ui, sans-serif',
        sizes: {
          h1: 'text-2xl (24px)',
          h2: 'text-xl (20px)',
          body: 'text-sm (14px)',
          small: 'text-xs (12px)',
        },
      },
      transitions: {
        micro: 'transition-all duration-150',
        normal: 'transition-all duration-300',
        reveal: 'transition-all duration-500',
      },
    };
  },
};

export default HelmKnowledge;
`;

// Write to file
const outputPath = path.join(__dirname, '../src/knowledge/helm-knowledge.js');
fs.writeFileSync(outputPath, outputTemplate);

console.log(`\n💾 Saved complete knowledge base to: ${outputPath}`);
console.log(`\n📊 Summary:`);
console.log(`   - ${nodes.length} routes`);
console.log(`   - ${edges.length} connections`);
console.log(`   - ${Object.keys(routeInfo).length} detailed descriptions`);
console.log(`   - Baseball routes: ${nodes.filter(n => n.domain === 'baseball').length}`);
console.log(`   - Golf routes: ${nodes.filter(n => n.domain === 'golf').length}`);
console.log(`   - Shared routes: ${nodes.filter(n => !n.domain).length}`);
console.log(`\n✅ Complete! Flow Visualizer now has ALL real data.`);
