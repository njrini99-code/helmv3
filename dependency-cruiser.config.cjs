/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'golf-app-must-not-import-baseball-app',
      severity: 'error',
      from: { path: '^src/app/golf/' },
      to: { path: '^src/app/baseball/' },
    },
    {
      name: 'baseball-app-must-not-import-golf-app',
      severity: 'error',
      from: { path: '^src/app/baseball/' },
      to: { path: '^src/app/golf/' },
    },
    {
      name: 'golf-lib-must-not-import-baseball-lib',
      severity: 'error',
      from: { path: '^src/lib/golf/' },
      to: { path: '^src/lib/baseball/' },
    },
    {
      name: 'baseball-lib-must-not-import-golf-lib',
      severity: 'error',
      from: { path: '^src/lib/baseball/' },
      to: { path: '^src/lib/golf/' },
    },
    {
      name: 'lib-must-not-import-app',
      severity: 'error',
      from: { path: '^src/lib/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'coachhelm-core-must-not-import-ui-pages',
      severity: 'error',
      from: { path: '^src/lib/coachhelm/' },
      to: { path: '^src/(app|components)/' },
    },
    {
      name: 'stats-helpers-must-not-import-react-ui',
      severity: 'error',
      from: { path: '^src/lib/.*/(stats|stat|calculator|formulas)' },
      to: { dependencyTypes: ['npm'], path: '^(react|react-dom|next)' },
    },
    {
      name: 'no-circular-coachhelm-or-stats',
      severity: 'error',
      from: { path: '^src/lib/(coachhelm|.*stats.*|.*golf.*)' },
      to: { circular: true },
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' },
    },
  },
};
