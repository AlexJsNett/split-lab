const { IgnorePlugin } = require('webpack');
const { TsconfigPathsPlugin } = require('tsconfig-paths-webpack-plugin');

module.exports = (options) => ({
  ...options,
  resolve: {
    ...options.resolve,
    // Prisma's generated client (apps/api/generated/prisma) is a CJS-targeted client whose
    // relative imports carry an explicit ".js" extension (required by TS's nodenext module
    // resolution — see prisma/schema.prisma's generator block). The generated files on disk
    // are still ".ts" though (compiled by this same webpack build, not pre-compiled by
    // Prisma), so webpack's resolver needs to know a ".js" specifier may really mean ".ts".
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
    plugins: [
      ...(options.resolve?.plugins || []),
      new TsconfigPathsPlugin({ configFile: './tsconfig.json' }),
    ],
  },
  plugins: [
    ...options.plugins,
    // The "Console Ninja" VS Code extension patches a require() hook into
    // @nestjs/core/index.js on disk (wrapped in try/catch — harmless at runtime,
    // that's its own fallback path when the extension isn't running). Webpack
    // statically bundles that require though, and chases it into Console Ninja's
    // own dynamic template-engine detection, which fails to resolve packages we
    // don't have. Ignoring the module here matches the intended fallback exactly.
    new IgnorePlugin({ resourceRegExp: /console-ninja/ }),
  ],
});
