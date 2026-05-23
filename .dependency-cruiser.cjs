/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── ドメイン層は application・components・store・infrastructure をインポートしない ──
    {
      name: 'domain-must-not-import-application',
      severity: 'error',
      from: { path: '^src/domain' },
      to:   { path: '^src/application' },
    },
    {
      name: 'domain-must-not-import-components',
      severity: 'error',
      from: { path: '^src/domain' },
      to:   { path: '^src/components' },
    },
    {
      name: 'domain-must-not-import-store',
      severity: 'error',
      from: { path: '^src/domain' },
      to:   { path: '^src/store' },
    },
    {
      name: 'domain-must-not-import-infrastructure',
      severity: 'error',
      from: { path: '^src/domain' },
      to:   { path: '^src/infrastructure' },
    },

    // ── アプリケーション層は components・store をインポートしない ──
    {
      name: 'application-must-not-import-components',
      severity: 'error',
      from: { path: '^src/application' },
      to:   { path: '^src/components' },
    },
    {
      name: 'application-must-not-import-store',
      severity: 'error',
      from: { path: '^src/application' },
      to:   { path: '^src/store' },
    },

    // ── インフラ層は components・store をインポートしない ──
    {
      name: 'infrastructure-must-not-import-components',
      severity: 'error',
      from: { path: '^src/infrastructure' },
      to:   { path: '^src/components' },
    },
    {
      name: 'infrastructure-must-not-import-store',
      severity: 'error',
      from: { path: '^src/infrastructure' },
      to:   { path: '^src/store' },
    },
  ],

  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
}
