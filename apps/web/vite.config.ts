import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.KOBRALINK_API_URL ?? 'http://localhost:7100';

export default defineConfig({
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
        proxy: {
            '/api': { target: API, changeOrigin: false },
            '/kx': { target: API, changeOrigin: false },
        },
    },
    build: { outDir: 'dist', sourcemap: true },
});
