import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // FreelanceHQ's own port. strictPort: fail loudly instead of silently moving to another
    // port when this one is busy (other projects use 5173/5174).
    port: 5180,
    strictPort: true,
    // Forward /api/* requests to the Express server so the browser sees one origin.
    proxy: { '/api': 'http://localhost:4000' },
  },
  preview: { port: 5180, strictPort: true },
})
