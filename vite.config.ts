import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    allowedHosts: ['llamada-urgente-2.onrender.com', '.onrender.com'],
    proxy: {
      '/socket.io': {
        target: 'https://llamada-urgente-2.onrender.com',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
