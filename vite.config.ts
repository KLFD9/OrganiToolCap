import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Sépare les gros vendors du code applicatif : le cache navigateur
        // survit aux déploiements qui ne touchent que le code de l'app.
        advancedChunks: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'react-flow', test: /node_modules[\\/]@xyflow[\\/]/ },
          ],
        },
      },
    },
  },
})
