import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 专属端口：5173 已被同机的 rain404 占用（绑在 0.0.0.0），
    // 再挤同一端口只能靠"更具体的绑定"侥幸命中，且 Vite 默认会静默跳号。
    // strictPort 让抢不到端口时直接失败报错，而不是悄悄换到 5181。
    port: 5180,
    host: '127.0.0.1',
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
