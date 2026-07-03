/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Keep dependency cycles visible before turning this into a hard gate.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-client-imports-server-admin',
      severity: 'warn',
      comment: 'Client-facing components should not import server-only admin helpers.',
      from: {
        path: '^src/components/',
      },
      to: { path: '^src/lib/(admin/|server|supabase/(admin|service)|auth/ownership|server-error-logger)' },
    },
    {
      name: 'no-components-import-admin-service-role',
      severity: 'warn',
      comment: 'Shared components must stay away from service-role/admin data access.',
      from: { path: '^src/components/' },
      to: { path: '^src/lib/(admin/|supabase/(admin|service)|.*service-role)' },
    },
    {
      name: 'no-baseball-import-golf-feature',
      severity: 'warn',
      from: { path: '^src/(app|components|lib)/baseball/' },
      to: { path: '^src/(app|components|lib)/golf/' },
    },
    {
      name: 'no-golf-import-baseball-feature',
      severity: 'warn',
      from: { path: '^src/(app|components|lib)/golf/' },
      to: { path: '^src/(app|components|lib)/baseball/' },
    },
    {
      name: 'no-shared-ui-import-feature-code',
      severity: 'warn',
      comment: 'Primitive UI components should remain feature-agnostic.',
      from: { path: '^src/components/ui/' },
      to: { path: '^src/(app|components|lib)/(admin|baseball|golf|lifting)/' },
    },
    {
      name: 'no-new-legacy-baseball-lift-imports',
      severity: 'warn',
      comment: 'Use helm_lifting unless explicitly touching legacy migration/compat paths.',
      from: { path: '^src/' },
      to: { path: 'baseball_(lift|strength)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        '^node_modules/',
        '^\\.next/',
        '^coverage/',
        '^test-results/',
        '^playwright-report/',
        '^docs/archive/',
        '^docs/audits/generated/',
        '^docs/operations/generated/',
      ].join('|'),
    },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'] },
  },
};
