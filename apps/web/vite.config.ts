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
      // hc<AppType>() 用（apps/web/src/infrastructure/api/client.ts）。
      // AppType は import type でのみ使われるため実際のバンドルには含まれないが、
      // 念のため tsconfig.json の paths と揃えておく。
      '@server':           path.resolve(__dirname, '../server/src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
  },
})
