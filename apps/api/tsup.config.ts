import { defineConfig } from 'tsup';

// Bundles the API (and the internal @bookleaf/* TypeScript packages) into dist/.
// Third-party dependencies stay external and are installed in production.
export default defineConfig({
  entry: ['src/server.ts', 'src/database/seed/run-seed.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@bookleaf\//],
  // The OpenAPI spec is read at runtime (see app.ts) — ship it next to the bundle.
  onSuccess: 'cp src/docs/openapi.yaml dist/openapi.yaml',
});
