const { IgnorePlugin } = require('webpack');
const { TsconfigPathsPlugin } = require('tsconfig-paths-webpack-plugin');

module.exports = (options) => ({
  ...options,
  resolve: {
    ...options.resolve,
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
