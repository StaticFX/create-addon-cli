import { defineConfig } from 'tsup';

// Bundles src/index.ts (and the commander devDependency) into a single ESM file
// with a node shebang, so the published package has zero runtime dependencies.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // Shebang + a real `require` so bundled CommonJS deps (commander) work in ESM.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'module';\nconst require = __cr(import.meta.url);",
  },
});
