import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base + HashRouter means the build works from any subfolder or host path.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
