import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // React 인스턴스가 둘로 갈라지면 훅 디스패처가 null이 되어 앱 전체가 죽는다.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // 모든 의존성을 첫 패스에서 함께 최적화한다.
    // 나눠서 최적화되면 나중 패스의 청크가 React 사본을 따로 품는 경우가 있다.
    include: ['react', 'react-dom', 'react-dom/client', 'zustand', 'zod', 'lucide-react'],
  },
  server: {
    port: 5180,
    open: true,
  },
});
