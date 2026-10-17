import { defineConfig } from 'tsup';

// Bundles the API, its internal @bookleaf/* packages and its npm dependencies into dist/,
// so dist/ runs on its own (`node dist/server.js`) with no node_modules. That lets hosts that
// upload a folder as-is (e.g. Zoho Catalyst AppSail) deploy apps/api/dist directly.
export default defineConfig({
  entry: ['src/server.ts', 'src/database/seed/run-seed.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/.*/],
  // Optional MongoDB driver add-ons we don't use; the driver loads them lazily inside try/catch.
  external: [
    'kerberos',
    '@mongodb-js/zstd',
    '@aws-sdk/credential-providers',
    'gcp-metadata',
    'snappy',
    'socks',
    'aws4',
    'mongodb-client-encryption',
    'pino-pretty',
  ],
  // Bundled CommonJS dependencies expect require/__filename/__dirname, which ESM lacks.
  banner: {
    js: [
      "import { createRequire as __bundleCreateRequire } from 'node:module';",
      "import { fileURLToPath as __bundleFileURLToPath } from 'node:url';",
      "import { dirname as __bundleDirname } from 'node:path';",
      'const require = __bundleCreateRequire(import.meta.url);',
      'const __filename = __bundleFileURLToPath(import.meta.url);',
      'const __dirname = __bundleDirname(__filename);',
    ].join('\n'),
  },
});
