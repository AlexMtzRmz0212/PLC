import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base + HashRouter means the build works on GitHub Pages under any repo name.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
