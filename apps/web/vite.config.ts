import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { HttpsProxyAgent } from 'https-proxy-agent'
import path from 'path'

export default defineConfig(({ mode }) => {
  // loadEnv with '' prefix reads ALL .env vars (not just VITE_ ones).
  // These are intentionally unprefixed — server-side only, never baked into the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.LLM_PROXY_TARGET
  const httpProxy   = env.LLM_HTTP_PROXY   // e.g. http://proxy.corporate:8080

  const agent = httpProxy
    ? new HttpsProxyAgent(httpProxy)
    : undefined

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@personnel/domain': path.resolve(__dirname, '../../packages/domain/src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    server: proxyTarget ? {
      proxy: {
        '/llm-api': {
          target:       proxyTarget,
          changeOrigin: true,
          rewrite:      path => path.replace(/^\/llm-api/, ''),
          ...(agent ? { agent } : {}),
        },
      },
    } : undefined,
  }
})
