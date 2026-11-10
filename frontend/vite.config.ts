import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server proxies /api to the local dashboard server (backend/server),
// so the React app fetches live data from the real SQLite DB.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // SOLACE_API lets a scratch server stand in for the live one during verification.
      '/api': process.env.SOLACE_API ?? 'http://localhost:8787',
    },
  },
});
