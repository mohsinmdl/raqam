import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works from any static host or file://
  base: './',
  build: {
    rolldownOptions: {
      output: {
        // Split the two big, rarely-changing dependency groups out of the app
        // chunk so routine app-code deploys don't re-download React or
        // supabase-js (their hashed chunks stay byte-identical across deploys).
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\\/](?:react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
});
