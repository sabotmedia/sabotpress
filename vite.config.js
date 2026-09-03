import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'browser-local' ? './' : '/',
  plugins: [react()],
  server: {
    port: 4173,
    host: true,
  },
}))
