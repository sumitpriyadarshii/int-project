import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    cssCodeSplit: true,
    minify: 'terser',
    reportCompressedSize: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('@react-three') || id.includes('/three/')) return 'three';
          if (id.includes('axios') || id.includes('socket.io-client')) return 'network';
        }
      }
    }
  }
})
