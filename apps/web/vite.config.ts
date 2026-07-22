import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// AI呼び出しは apps/server の /api/ai プロキシ経由に統一されている
// （apps/web/.env.local.example・apps/server/.env.example 参照）。
// 旧来の「Viteの同一オリジンプロキシ経由でLLMキーをそのままブラウザに持たせる」方式は廃止済み。

export default defineConfig({
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
})
