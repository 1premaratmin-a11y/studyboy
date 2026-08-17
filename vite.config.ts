import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Build stamp injected as __APP_BUILD__ — shown in the Footer so you can
  // confirm at a glance the running window is serving the latest code
  // (defeats stale-WebView2-cache confusion).
  define: {
    __APP_BUILD__: JSON.stringify('v3·' + new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  // Prevent Vite's file watcher from touching the Rust build dir
  // (cargo writes/locks .dll/.pdb files under src-tauri/target → EBUSY crashes).
  server: {
    watch: {
      ignored: [
        '**/src-tauri/target/**',
        '**/src-tauri/gen/**',
      ],
    },
  },
})