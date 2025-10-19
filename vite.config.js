import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Important: set base for GitHub Pages project site
  // If your repo name is different, update the subpath accordingly
  base: '/realtime-path-renderer/',
  server: {
    port: 3000,
    host: true
  },
  worker: {
    format: 'es'
  }
})
