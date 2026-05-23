import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // loadEnv with '' prefix reads ALL .env vars (not just VITE_ ones).
  // LLM_PROXY_TARGET is intentionally unprefixed — it's server-side only
  // and must never be baked into the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.LLM_PROXY_TARGET

  return {
    plugins: [react()],
    server: proxyTarget ? {
      proxy: {
        '/llm-api': {
          target:      proxyTarget,
          changeOrigin: true,
          rewrite:     path => path.replace(/^\/llm-api/, ''),
        },
      },
    } : undefined,
  }
})
