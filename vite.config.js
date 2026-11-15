import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' face ca aplicatia sa mearga si de pe un subdosar GitHub Pages
// (ex. https://<user>.github.io/<repo>/), nu doar de pe root.
export default defineConfig({
  plugins: [react()],
  base: './',
});
