import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 打包到 dist/，由 tools/build-site.mjs 放进 cloud/site.js，官网在 /admin 提供（只有 js/css，不内联脚本，配合严格的安全策略）
export default defineConfig({
  base: '/admin/',
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 600,
    target: ['es2020', 'safari14', 'chrome87', 'edge88', 'firefox78'],
  },
  server: { port: 5173, proxy: { '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8787', changeOrigin: true } } },
})
