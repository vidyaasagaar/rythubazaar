import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scripts/seed.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared workspace package ships TypeScript source, so bundle it into the API build.
  noExternal: ['@rythubazaar/shared'],
});
