import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { gasProxyPlugin } from './vite-plugin-gas-proxy.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const netlifyFlag = process.env.NETLIFY || env.VITE_NETLIFY || ''
  return {
    plugins: [react(), gasProxyPlugin()],
    define: {
      // Netlify définit `NETLIFY=true` pendant le build ; on l’expose au client pour router vers `/.netlify/functions/*`.
      'import.meta.env.VITE_NETLIFY': JSON.stringify(netlifyFlag),
    },
  }
})
